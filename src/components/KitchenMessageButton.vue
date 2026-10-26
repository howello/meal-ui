<script setup lang="ts">
import { computed } from "vue";
import { useThemeStore } from "@/store/theme";
import { useUserStore } from "@/store/user";
import { svgIcon } from "@/utils/icons";
import { kitchenTodoCount } from "@/utils/notify";

/**
 * 厨师工作台消息入口
 *
 * 仅在厨师角色的点餐区与购物车右上角展示。
 * 角标统计本家庭待接单与制作中的订单总数；没有待办时保留图标、隐藏数字。
 * 数字来自全局通知轮询的聚合结果，不再单独发起角标请求。
 * 点击后进入厨师工作台待接单页。
 */
const userStore = useUserStore();
const themeStore = useThemeStore();

const visible = computed(() => userStore.isChef);
const icon = computed(() => svgIcon("message", themeStore.isDark ? "#9aa0ab" : "#8b93a7"));
const count = kitchenTodoCount;
/** 仅显示数字，超过 99 时收敛为 99+，避免角标横向撑开导航栏 */
const badge = computed(() => (count.value > 99 ? "99+" : String(count.value)));

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
