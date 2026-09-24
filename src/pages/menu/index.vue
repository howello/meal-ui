<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { listCategory, listDish } from "@/api/dish";
import TabBar from "@/components/TabBar.vue";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";
import { svgIcon } from "@/utils/icons";
import type { Category, Dish } from "@/types";

const userStore = useUserStore();
const cartStore = useCartStore();

const categories = ref<Category[]>([]);
const dishes = ref<Dish[]>([]);
const activeCategory = ref<number | undefined>(undefined);
const keyword = ref("");
const loading = ref(false);

const cartIcon = svgIcon("cart", "#FFFFFF");

onShow(async () => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  // 进了点餐区，底部导航就该是点餐那一套
  userStore.setViewMode("eater");
  if (!userStore.user) {
    try {
      await userStore.fetchInfo();
    } catch (e) {
      return;
    }
  }
  await loadCategories();
  await loadDishes();
});

const refreshing = ref(false);

/** 下拉刷新：重新拉取分类与菜品列表 */
async function onRefresh() {
  refreshing.value = true;
  try {
    await Promise.all([loadCategories(), loadDishes()]);
  } finally {
    refreshing.value = false;
  }
}

async function loadCategories() {
  try {
    const res = await listCategory();
    categories.value = res.rows;
  } catch (e) {
    categories.value = [];
  }
}

async function loadDishes() {
  loading.value = true;
  try {
    const res = await listDish({
      categoryId: activeCategory.value,
      keyword: keyword.value || undefined,
    });
    dishes.value = res.rows;
  } catch (e) {
    dishes.value = [];
  } finally {
    loading.value = false;
  }
}

function pickCategory(categoryId?: number) {
  activeCategory.value = categoryId;
  loadDishes();
}

function onSearch() {
  loadDishes();
}

function openDish(dish: Dish) {
  uni.navigateTo({ url: `/pages/menu/detail?dishId=${dish.dishId}` });
}

/** 一键加购：不进详情页，直接落一份进购物车 */
function addToCart(dish: Dish) {
  cartStore.add(dish, 1);
  uni.showToast({ title: `已加入 ${dish.name}`, icon: "none" });
}

function goCart() {
  uni.navigateTo({ url: "/pages/cart/index" });
}

function tagList(dish: Dish): string[] {
  if (!dish.tags) {
    return [];
  }
  return dish.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => !!tag)
    .slice(0, 2);
}
</script>

<template>
  <view class="app-fixed">
    <view class="app-fixed__head">
      <view class="search">
        <input
          v-model="keyword"
          class="search__input"
          placeholder="搜索菜名 / 食材"
          placeholder-class="search__ph"
          confirm-type="search"
          @confirm="onSearch"
        />
        <text class="search__btn" @click="onSearch">搜索</text>
      </view>

      <scroll-view scroll-x class="chips">
        <view class="chips__inner">
          <view class="chip" :class="{ 'chip--on': activeCategory === undefined }" @click="pickCategory(undefined)">
            全部
          </view>
          <view
            v-for="item in categories"
            :key="item.categoryId"
            class="chip"
            :class="{ 'chip--on': activeCategory === item.categoryId }"
            @click="pickCategory(item.categoryId)"
          >
            {{ item.name }}
          </view>
        </view>
      </scroll-view>
    </view>

    <scroll-view
      class="app-fixed__scroll app-fixed__scroll--tabbed"
      :scroll-y="true"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <view v-if="dishes.length" class="grid">
        <view v-for="dish in dishes" :key="dish.dishId" class="dish" @click="openDish(dish)">
          <image v-if="dish.cover" class="dish__cover" :src="dish.cover" mode="aspectFill" />
          <view v-else class="dish__cover dish__cover--ph">{{ dish.name }}</view>
          <view class="dish__body">
            <text class="dish__name">{{ dish.name }}</text>
            <text class="dish__desc">{{ dish.description || "—" }}</text>
            <view class="dish__meta">
              <view class="dish__meta-left">
                <text v-for="tag in tagList(dish)" :key="tag" class="tag">{{ tag }}</text>
                <text class="tiny">{{ dish.duration || "" }}</text>
              </view>
              <view class="dish__add" @click.stop="addToCart(dish)">＋</view>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="!loading" class="empty">还没有菜，去管理端点几道吧</view>

      <view v-else class="skeleton-grid">
        <view v-for="n in 6" :key="n" class="skeleton-card">
          <view class="skeleton-card__cover shimmer"></view>
          <view class="skeleton-card__line shimmer"></view>
          <view class="skeleton-card__line skeleton-card__line--w40 shimmer"></view>
        </view>
      </view>
    </scroll-view>

    <TabBar active="menu" />

    <view v-if="cartStore.totalCount > 0" class="cart-fab" @click="goCart">
      <image class="cart-fab__icon" :src="cartIcon" />
      <text class="cart-fab__badge">{{ cartStore.totalCount }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.search {
  display: flex;
  align-items: center;
  gap: 16rpx;
  background-color: $meal-card;
  border-radius: 999rpx;
  padding: 16rpx 24rpx;
  margin-bottom: 20rpx;
}

.search__input {
  flex: 1;
  font-size: 26rpx;
  color: $meal-text;
}

.search__ph {
  color: $meal-text-2;
}

.search__btn {
  font-size: 26rpx;
  color: $meal-primary;
  font-weight: 600;
}

.chips {
  white-space: nowrap;
  margin-bottom: 20rpx;
}

.chips__inner {
  display: inline-flex;
  gap: 16rpx;
}

.chip {
  display: inline-block;
  padding: 10rpx 28rpx;
  border-radius: 999rpx;
  background-color: $meal-card;
  border: 1rpx solid $meal-line;
  color: $meal-text-2;
  font-size: 24rpx;
}

.chip--on {
  background-color: $meal-primary;
  border-color: $meal-primary;
  color: #fff;
  font-weight: 600;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}

.dish {
  width: 48.5%;
  background-color: $meal-card;
  border-radius: 24rpx;
  overflow: hidden;
  margin-bottom: 20rpx;
  box-shadow: 0 6rpx 20rpx rgba(30, 33, 38, 0.06);
}

.dish__cover {
  width: 100%;
  height: 190rpx;
  display: block;
}

.dish__cover--ph {
  background: linear-gradient(135deg, #ffc49b, #ff7a45);
  color: #fff;
  font-size: 24rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dish__body {
  padding: 18rpx;
}

.dish__name {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: $meal-text;
}

.dish__desc {
  display: block;
  font-size: 22rpx;
  color: $meal-text-2;
  margin: 8rpx 0 12rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dish__meta {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

/* 左侧标签与耗时允许被压缩，保证右侧加购按钮永远完整 */
.dish__meta-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8rpx;
  overflow: hidden;
}

/* 一键加购：贴住卡片右下角 */
.dish__add {
  flex: 0 0 auto;
  width: 48rpx;
  height: 48rpx;
  line-height: 46rpx;
  text-align: center;
  border-radius: 50%;
  background-color: $meal-primary;
  color: #fff;
  font-size: 32rpx;
  font-weight: 700;
}

.tag {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  background-color: $meal-primary-soft;
  color: $meal-primary;
  font-weight: 600;
}

/* 右下角购物车浮动按钮 */
.cart-fab {
  position: fixed;
  right: 30rpx;
  bottom: 170rpx;
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, $meal-primary, $meal-primary-2);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10rpx 30rpx rgba(255, 107, 53, 0.45);
  z-index: 90;
}

.cart-fab__icon {
  width: 52rpx;
  height: 52rpx;
}

.cart-fab__badge {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
  min-width: 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background-color: $meal-danger;
  color: #fff;
  font-size: 20rpx;
  font-weight: 700;
}

/* 骨架屏 */
.skeleton-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}

.skeleton-card {
  width: 48.5%;
  background-color: $meal-card;
  border-radius: 24rpx;
  overflow: hidden;
  margin-bottom: 20rpx;
  padding-bottom: 18rpx;
}

.skeleton-card__cover {
  width: 100%;
  height: 190rpx;
}

.skeleton-card__line {
  height: 22rpx;
  border-radius: 8rpx;
  margin: 16rpx 18rpx 0;
}

.skeleton-card__line--w40 {
  width: 40%;
}

.shimmer {
  background: linear-gradient(90deg, #eee 25%, #f5f5f5 37%, #eee 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
