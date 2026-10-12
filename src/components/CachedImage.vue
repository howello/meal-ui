<script setup lang="ts">
/**
 * 带本地缓存的图片
 *
 * App 端先解析本地缓存：命中直接用本地文件（不联网），未命中下载并落盘后再展示；
 * H5 / 小程序端直接透传原地址，行为与普通 `<image>` 一致。
 * `class` / `style` 等未声明的属性会自动透传到内部 `<image>`。
 */
import { computed, ref, watch } from "vue";
import { getCachedImageSrcSync, resolveImageSrc } from "@/utils/imageCache";

const props = withDefaults(
  defineProps<{
    /** 远程图片地址 */
    src: string;
    /** 裁剪模式，透传给 `<image mode>` */
    mode?: string;
    /** 是否懒加载，透传给 `<image lazy-load>` */
    lazyLoad?: boolean;
  }>(),
  { mode: "aspectFill", lazyLoad: false },
);

/** 1×1 透明 gif：App 端解析完成前占位，避免提前走网络 */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** 实际用于展示的地址 */
const resolved = ref("");
/** 解析令牌，丢弃 src 变更或组件卸载后迟到的结果 */
let token = 0;

/** 解析地址：App 端走本地缓存，其余端直接透传 */
async function refresh(url: string): Promise<void> {
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

/** 本地文件失效时回退到原地址，避免裂图 */
function onError(): void {
  if (resolved.value !== props.src) {
    resolved.value = props.src;
  }
}
</script>

<template>
  <image :src="displaySrc" :mode="mode" :lazy-load="lazyLoad" @error="onError" />
</template>
