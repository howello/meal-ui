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
  // 先切到厨房视图，避免登录页恢复上次 eater 视图后底部导航仍停在点餐端
  userStore.setViewMode("kitchen");
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
    <view class="kitchen-message__bubble">
      <image class="kitchen-message__icon" :src="icon" />
      <text v-if="count > 0" class="kitchen-message__badge">{{ badge }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 入口外框留出角标空间，避免数字被导航栏边缘裁切 */
.kitchen-message {
  width: 76rpx;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 消息按钮：圆形玻璃底，图标与数字作为一个整体设计 */
.kitchen-message__bubble {
  position: relative;
  width: 64rpx;
  height: 64rpx;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $lg-fill-2;
  border: 1rpx solid $lg-border;
  box-shadow: $lg-shadow-sm;
}

.kitchen-message__icon {
  width: 34rpx;
  height: 34rpx;
}

/* 数字角标：嵌在按钮右上角内沿，使用白描边与按钮分离 */
.kitchen-message__badge {
  position: absolute;
  top: -5rpx;
  right: -5rpx;
  min-width: 30rpx;
  height: 30rpx;
  line-height: 26rpx;
  padding: 0 7rpx;
  border-radius: 999rpx;
  background: $meal-danger;
  border: 2rpx solid $lg-fill-4;
  color: #fff;
  font-size: 16rpx;
  font-weight: 700;
  text-align: center;
  box-sizing: border-box;
  box-shadow: 0 4rpx 10rpx rgba(0, 0, 0, 0.16);
}
</style>
