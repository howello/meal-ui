<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { listCategory, listDish } from "@/api/dish";
import TabBar from "@/components/TabBar.vue";
import { useUserStore } from "@/store/user";
import type { Category, Dish } from "@/types";

const userStore = useUserStore();

const categories = ref<Category[]>([]);
const dishes = ref<Dish[]>([]);
const activeCategory = ref<number | undefined>(undefined);
const keyword = ref("");
const loading = ref(false);

onShow(async () => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
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
  <view class="page-body page-body--tabbed">
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

    <scroll-view class="chips" scroll-x>
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

    <view v-if="dishes.length" class="grid">
      <view v-for="dish in dishes" :key="dish.dishId" class="dish" @click="openDish(dish)">
        <image v-if="dish.cover" class="dish__cover" :src="dish.cover" mode="aspectFill" />
        <view v-else class="dish__cover dish__cover--ph">{{ dish.name }}</view>
        <view class="dish__body">
          <text class="dish__name">{{ dish.name }}</text>
          <text class="dish__desc">{{ dish.description || "—" }}</text>
          <view class="dish__meta">
            <text v-for="tag in tagList(dish)" :key="tag" class="tag">{{ tag }}</text>
            <text class="tiny">{{ dish.duration || "" }}</text>
          </view>
        </view>
      </view>
    </view>

    <view v-else class="empty">{{ loading ? "加载中…" : "还没有菜，去管理端点几道吧" }}</view>

    <TabBar active="menu" />
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
  justify-content: space-between;
  gap: 8rpx;
}

.tag {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  background-color: $meal-primary-soft;
  color: $meal-primary;
  font-weight: 600;
}
</style>
