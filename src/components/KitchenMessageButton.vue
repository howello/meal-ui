<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { onHide, onShow, onUnload } from "@dcloudio/uni-app";
import { kitchenOrderSummary } from "@/api/order";
import { useThemeStore } from "@/store/theme";
import { useUserStore } from "@/store/user";
import { svgIcon } from "@/utils/icons";

/**
 * 厨师工作台消息入口
 *
 * 仅在厨师角色的点餐区与购物车右上角展示。
 * 角标统计本家庭待接单与制作中的订单总数；没有待办时保留图标、隐藏数字。
 * 点击后进入厨师工作台待接单页。
 */
const POLL_INTERVAL_MS = 15000;

const userStore = useUserStore();
const themeStore = useThemeStore();
const count = ref(0);
let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
let requestVersion = 0;

const visible = computed(() => userStore.isChef);
const icon = computed(() => svgIcon("message", themeStore.isDark ? "#9aa0ab" : "#8b93a7"));
/** 仅显示数字，超过 99 时收敛为 99+，避免角标横向撑开导航栏 */
const badge = computed(() => (count.value > 99 ? "99+" : String(count.value)));

/** 拉取待办汇总；失败时保留上一次角标，不打断点餐流程 */
async function refresh() {
  if (!visible.value) {
    count.value = 0;
    return;
  }
  const version = ++requestVersion;
  try {
    const summary = await kitchenOrderSummary();
    if (version === requestVersion) {
      count.value = Number(summary.pendingCount || 0) + Number(summary.cookingCount || 0);
    }
  } catch (e) {
    // 请求层已提示网络 / 登录问题，这里维持现有角标
  }
}

/** 页面可见时轮询，隐藏后停止，避免后台无意义请求 */
function schedule() {
  if (stopped || timer !== null || !visible.value) {
    return;
  }
  timer = setTimeout(async () => {
    timer = null;
    if (stopped) {
      return;
    }
    await refresh();
    schedule();
  }, POLL_INTERVAL_MS);
}

/** 页面显示时启动：立即刷新一次，再按固定间隔轮询 */
function start() {
  if (!stopped && timer !== null) {
    return;
  }
  stopped = false;
  void refresh();
  schedule();
}

/** 页面隐藏或组件卸载时停止轮询，并丢弃在途请求结果 */
function stop() {
  stopped = true;
  requestVersion += 1;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

onMounted(start);
onShow(start);
onHide(stop);
onUnload(stop);

/*
 * 冷启动时用户角色可能在页面挂载后才由 /getInfo 返回，
 * 观察到角色变为厨师时补启轮询，退出厨师角色时立即停掉。
 */
watch(visible, (isVisible) => {
  if (isVisible) {
    start();
  } else {
    stop();
  }
});

/** 页面切回前台或回到本页时立即刷新一次，避免最多等满一个轮询周期 */
function onVisibleRefresh() {
  if (visible.value) {
    void refresh();
  }
}

onShow(onVisibleRefresh);

function openKitchen() {
  uni.reLaunch({ url: "/pages/kitchen/waiting" });
}
</script>

<template>
  <view
    v-if="visible"
    class="kitchen-message"
    role="button"
    aria-label="打开厨师工作台"
    @click.stop="openKitchen"
  >
    <image class="kitchen-message__icon" :src="icon" />
    <text v-if="count > 0" class="kitchen-message__badge">{{ badge }}</text>
  </view>
</template>

<style lang="scss" scoped>
.kitchen-message {
  position: relative;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $lg-fill-2;
  border: 1rpx solid $lg-border;
}

.kitchen-message__icon {
  width: 36rpx;
  height: 36rpx;
}

/* 角标贴图标右下，紧邻而不遮挡铃铛/消息轮廓 */
.kitchen-message__badge {
  position: absolute;
  right: -10rpx;
  bottom: -8rpx;
  min-width: 28rpx;
  height: 28rpx;
  line-height: 28rpx;
  padding: 0 7rpx;
  border-radius: 999rpx;
  background: $meal-danger;
  color: #fff;
  font-size: 17rpx;
  font-weight: 700;
  text-align: center;
  box-sizing: border-box;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.18);
}
</style>
