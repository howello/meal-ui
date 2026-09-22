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

const tabs = computed<TabItem[]>(() => (userStore.isChef ? CHEF_TABS : EATER_TABS));

const activeColor = "#FF6B35";
const normalColor = "#8B9199";

function iconUrl(item: TabItem): string {
  return svgIcon(item.icon, item.key === props.active ? activeColor : normalColor);
}

function switchTo(item: TabItem) {
  if (item.key === props.active) {
    return;
  }
  uni.switchTab({ url: item.url });
}
</script>

<template>
  <view class="tabbar">
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
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  height: 108rpx;
  background-color: $meal-card;
  border-top: 1rpx solid $meal-line;
  padding-bottom: env(safe-area-inset-bottom);
}

.tab {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  font-size: 21rpx;
  color: $meal-text-2;
}

.tab--on {
  color: $meal-primary;
  font-weight: 600;
}

.tab__icon {
  width: 42rpx;
  height: 42rpx;
}

.tab__badge {
  position: absolute;
  top: 8rpx;
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
