<script setup lang="ts">
import { computed } from "vue";
import { useThemeStore } from "@/store/theme";
import { svgIcon } from "@/utils/icons";

/**
 * 厨师工作台快捷入口
 *
 * 待接单与制作中页右上角显示，点击回到用户端点餐区。
 * 图标与待办角标入口采用一致的玻璃按钮，但使用“点餐”语义而不是消息语义。
 */
const themeStore = useThemeStore();
const icon = computed(() => svgIcon("menu", themeStore.isDark ? "#9aa0ab" : "#8b93a7"));

function goMenu() {
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
