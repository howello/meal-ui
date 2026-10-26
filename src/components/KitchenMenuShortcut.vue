<script setup lang="ts">
import { computed } from "vue";
import { useThemeStore } from "@/store/theme";
import { useUserStore } from "@/store/user";
import { svgIcon } from "@/utils/icons";

/**
 * 厨师工作台快捷入口
 *
 * 待接单与制作中页右上角显示，点击切换到点餐区视图。
 * 不能直接 reLaunch 到菜单页：那样会丢失厨师视图，底部导航变成点餐员那套，
 * 厨师就没有入口回到工作台了。
 */
const themeStore = useThemeStore();
const userStore = useUserStore();
const icon = computed(() => svgIcon("menu", themeStore.isDark ? "#9aa0ab" : "#8b93a7"));

function goMenu() {
  // 用户主动进入点餐区才切换底部导航；页面预加载不会影响工作台视图
  userStore.setViewMode("eater");
  uni.reLaunch({ url: "/pages/menu/index" });
}
</script>

<template>
  <view class="kitchen-menu-shortcut" role="button" aria-label="回到点餐区" @click.stop="goMenu">
    <image class="kitchen-menu-shortcut__icon" :src="icon" />
  </view>
</template>

<style lang="scss" scoped>
.kitchen-menu-shortcut {
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

.kitchen-menu-shortcut__icon {
  width: 36rpx;
  height: 36rpx;
}
</style>
