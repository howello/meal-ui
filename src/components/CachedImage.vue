<script setup lang="ts">
/**
 * 带本地缓存的图片
 *
 * App 端先解析本地缓存：命中直接用本地文件（不联网），未命中下载并落盘后再展示；
 * H5 / 小程序端直接透传原地址，行为与普通 `<image>` 一致。
 * `class` / `style` 等未声明的属性会自动透传到内部 `<image>`。
 *
 * 另支持「加载失败自动重试」：AI 生成图会先写入预写的永久地址、图片稍后才补传成功，
 * 这段窗口内地址是 404，靠带 `?t=` 破缓存参数延时重试把它撑过去。
 */
import { computed, onUnmounted, ref, watch } from "vue";
import { getCachedImageSrcSync, resolveImageSrc } from "@/utils/imageCache";

const props = withDefaults(
  defineProps<{
    /** 远程图片地址 */
    src: string;
    /** 裁剪模式，透传给 `<image mode>` */
    mode?: string;
    /** 是否懒加载，透传给 `<image lazy-load>` */
    lazyLoad?: boolean;
    /** 加载失败后的重试次数，0 表示不重试 */
    retry?: number;
    /** 每次重试前的等待时长（毫秒） */
    retryDelay?: number;
  }>(),
  { mode: "aspectFill", lazyLoad: false, retry: 0, retryDelay: 3000 },
);

const emit = defineEmits<{ (e: "error"): void }>();

/** 1×1 透明 gif：App 端解析完成前占位，避免提前走网络 */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** 实际用于展示的地址 */
const resolved = ref("");
/** 解析令牌，丢弃 src 变更或组件卸载后迟到的结果 */
let token = 0;
/** 已重试次数 */
let attempts = 0;
/** 重试定时器 */
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** 解析地址：App 端走本地缓存，其余端直接透传 */
async function refresh(url: string): Promise<void> {
  clearTimer();
  attempts = 0;
  // #ifndef APP-PLUS
  resolved.value = url;
  return;
  // #endif
  // #ifdef APP-PLUS
  if (!url) {
    resolved.value = "";
    return;
  }
  const current = ++token;
  // 先用同步缓存兜底渲染（重挂载时立即出图、不闪），再异步确认文件是否仍在
  resolved.value = getCachedImageSrcSync(url);
  const next = await resolveImageSrc(url);
  if (current === token && next) {
    resolved.value = next;
  }
  // #endif
}

watch(() => props.src, refresh, { immediate: true });

const displaySrc = computed(() => resolved.value || BLANK);

/** 加载失败：本地缓存失效先回退原地址，原地址也失败则延时重试，重试用尽才对外报错 */
function onError(): void {
  // App 端本地文件失效（当前显示的不是原地址，也不是原地址的重试变体）
  if (resolved.value !== props.src && !resolved.value.startsWith(props.src)) {
    resolved.value = props.src;
    return;
  }
  if (props.retry > 0 && attempts < props.retry) {
    attempts += 1;
    clearTimer();
    timer = setTimeout(() => {
      const sep = props.src.includes("?") ? "&" : "?";
      // 带上时间戳：R2 忽略 query，对象照常返回；缓存键变化可绕过可能被边缘缓存的 404
      resolved.value = `${props.src}${sep}t=${Date.now()}`;
    }, props.retryDelay);
    return;
  }
  emit("error");
}

onUnmounted(clearTimer);
</script>

<template>
  <image :src="displaySrc" :mode="mode" :lazy-load="lazyLoad" @error="onError" />
</template>
