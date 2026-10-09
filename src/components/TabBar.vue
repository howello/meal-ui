<script setup lang="ts">
import { computed } from "vue";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";
import { svgIcon } from "@/utils/icons";

interface TabItem {
  key: string;
  text: string;
  url: string;
  icon: string;
}

const props = defineProps<{ active: string }>();

const userStore = useUserStore();
const cartStore = useCartStore();

/** 点餐员 / 家庭管理员的三个 tab */
const EATER_TABS: TabItem[] = [
  { key: "menu", text: "点餐区", url: "/pages/menu/index", icon: "menu" },
  { key: "cart", text: "购物车", url: "/pages/cart/index", icon: "cart" },
  { key: "mine", text: "我的", url: "/pages/mine/index", icon: "user" },
];

/** 厨师登录后底部整体换成工作台 */
const CHEF_TABS: TabItem[] = [
  { key: "kitchen-waiting", text: "待接单", url: "/pages/kitchen/waiting", icon: "pan" },
  { key: "kitchen-cooking", text: "制作中", url: "/pages/kitchen/cooking", icon: "fire" },
  { key: "mine", text: "我的", url: "/pages/mine/index", icon: "user" },
];

/**
 * 刻意不用 uni 的 tabBar 配置。
 *
 * `tabBar.custom` 只在微信小程序端生效，H5 与 App 会忽略它并直接按 tabBar.list
 * 全量渲染，结果任何账号都看到同一排 tab。所以 pages.json 不声明 tabBar，
 * 底部导航完全由本组件承担，页面切换用 reLaunch（等价于 tab 之间的根级跳转）。
 *
 * 用哪一套看的是「当前在哪个视图」而不是「当前是什么角色」：厨师与家庭管理员
 * 两边都能进，切到哪边就该显示哪边的 tab。
 */
const tabs = computed<TabItem[]>(() => (userStore.tabMode === "kitchen" ? CHEF_TABS : EATER_TABS));

const activeColor = "#FF6B35";
const normalColor = "#8b93a7";

function iconUrl(item: TabItem): string {
  return svgIcon(item.icon, item.key === props.active ? activeColor : normalColor);
}

function switchTo(item: TabItem) {
  if (item.key === props.active) {
    return;
  }
  uni.reLaunch({ url: item.url });
}
</script>

<template>
  <view class="tabbar glass glass--strong">
    <view
      v-for="item in tabs"
      :key="item.key"
      class="tab"
      :class="{ 'tab--on': item.key === active }"
      @click="switchTo(item)"
    >
      <image class="tab__icon" :src="iconUrl(item)" />
      <text class="tab__text">{{ item.text }}</text>
      <text v-if="item.key === 'cart' && cartStore.totalCount > 0" class="tab__badge">
        {{ cartStore.totalCount }}
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 悬浮玻璃胶囊：底部导航整体做成一块磨砂玻璃，浮在内容之上 */
.tabbar {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: calc(16rpx + env(safe-area-inset-bottom));
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-around;
  height: 108rpx;
  border-radius: 44rpx;
  padding: 0 12rpx;
}

.tab {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  height: 88rpx;
  border-radius: 30rpx;
  font-size: 21rpx;
  color: $lg-ink-3;
}

.tab--on {
  color: $lg-accent;
  font-weight: 600;
  background: $lg-accent-soft;
}

.tab__icon {
  width: 42rpx;
  height: 42rpx;
}

.tab__badge {
  position: absolute;
  top: 10rpx;
  left: 50%;
  margin-left: 12rpx;
  min-width: 30rpx;
  height: 30rpx;
  line-height: 30rpx;
  text-align: center;
  padding: 0 6rpx;
  border-radius: 999rpx;
  background-color: $meal-danger;
  color: #fff;
  font-size: 18rpx;
  font-weight: 700;
}
</style>
