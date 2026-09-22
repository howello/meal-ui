<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { getDish } from "@/api/dish";
import { useCartStore } from "@/store/cart";
import type { Dish, Ingredient } from "@/types";

const cartStore = useCartStore();

const dish = ref<Dish | null>(null);
const remark = ref("");
const count = ref(1);
const loading = ref(true);

onLoad(async (options) => {
  const dishId = Number(options?.dishId || 0);
  if (!dishId) {
    uni.showToast({ title: "菜品不存在", icon: "none" });
    return;
  }
  try {
    dish.value = await getDish(dishId);
  } catch (e) {
    dish.value = null;
  } finally {
    loading.value = false;
  }
});

const ingredients = computed<Ingredient[]>(() => parseJson<Ingredient[]>(dish.value?.ingredients, []));
const steps = computed<string[]>(() => parseJson<string[]>(dish.value?.steps, []));
const tips = computed<string[]>(() => parseJson<string[]>(dish.value?.tips, []));
const tagList = computed<string[]>(() =>
  (dish.value?.tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => !!tag),
);

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function changeCount(delta: number) {
  const next = count.value + delta;
  if (next < 1) {
    return;
  }
  count.value = next;
}

function addToCart() {
  if (!dish.value) {
    return;
  }
  cartStore.add(dish.value, count.value, remark.value);
  uni.showToast({ title: "已加入购物车", icon: "none" });
  setTimeout(() => {
    uni.navigateBack();
  }, 600);
}
</script>

<template>
  <view v-if="dish" class="detail">
    <view class="hero">
      <image v-if="dish.cover" class="hero__img" :src="dish.cover" mode="aspectFill" />
      <view v-else class="hero__img hero__img--ph"></view>
      <view class="hero__mask">
        <text v-if="dish.categoryName" class="hero__tag">{{ dish.categoryName }}</text>
        <text class="hero__name">{{ dish.name }}</text>
        <text class="hero__desc">{{ dish.description || "" }}</text>
      </view>
    </view>

    <view class="detail__body">
      <view class="card specs">
        <view class="spec">
          <text class="spec__value">{{ dish.duration || "—" }}</text>
          <text class="tiny">耗时</text>
        </view>
        <view class="spec">
          <text class="spec__value">{{ dish.level || "—" }}</text>
          <text class="tiny">难度</text>
        </view>
        <view class="spec">
          <text class="spec__value">{{ dish.serve || "—" }}</text>
          <text class="tiny">份量</text>
        </view>
        <view class="spec">
          <text class="spec__value">{{ dish.kcal || "—" }}</text>
          <text class="tiny">热量</text>
        </view>
      </view>

      <view v-if="tagList.length" class="detail__tags">
        <text v-for="tag in tagList" :key="tag" class="tag">{{ tag }}</text>
      </view>

      <view v-if="ingredients.length" class="card">
        <text class="section-title">用料</text>
        <view v-for="(item, index) in ingredients" :key="index" class="ingredient">
          <text class="ingredient__name">{{ item.name }}</text>
          <text class="muted">{{ item.amount }}</text>
        </view>
      </view>

      <view v-if="steps.length" class="card">
        <text class="section-title">做法</text>
        <view v-for="(step, index) in steps" :key="index" class="step">
          <text class="step__index">{{ index + 1 }}</text>
          <text class="step__text">{{ step }}</text>
        </view>
      </view>

      <view v-if="tips.length" class="card">
        <text class="section-title">小贴士</text>
        <view v-for="(tip, index) in tips" :key="index" class="tip">{{ tip }}</view>
      </view>

      <view class="card">
        <text class="section-title">单项备注</text>
        <input v-model="remark" class="remark-input" placeholder="如：不要放辣" placeholder-class="search__ph" />
      </view>
    </view>

    <view class="bottombar">
      <view class="stepper">
        <text class="stepper__btn" @click="changeCount(-1)">−</text>
        <text class="stepper__count">{{ count }}</text>
        <text class="stepper__btn stepper__btn--plus" @click="changeCount(1)">+</text>
      </view>
      <view class="bottombar__btn" @click="addToCart">加入购物车</view>
    </view>
  </view>

  <view v-else class="empty">{{ loading ? "加载中…" : "菜品不存在或已下架" }}</view>
</template>

<style lang="scss" scoped>
.detail {
  padding-bottom: 160rpx;
}

.hero {
  position: relative;
  height: 420rpx;
  background: linear-gradient(150deg, #ffc49b, #ff7a45);
}

.hero__img {
  width: 100%;
  height: 420rpx;
  display: block;
}

.hero__img--ph {
  background: linear-gradient(150deg, #ffc49b, #ff7a45);
}

.hero__mask {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 32rpx 28rpx 28rpx;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55), transparent);
  display: flex;
  flex-direction: column;
}

.hero__tag {
  align-self: flex-start;
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  background-color: rgba(255, 255, 255, 0.25);
  color: #fff;
  margin-bottom: 12rpx;
}

.hero__name {
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
}

.hero__desc {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.9);
  margin-top: 8rpx;
}

.detail__body {
  padding: 24rpx;
}

.specs {
  display: flex;
  justify-content: space-between;
}

.spec {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.spec__value {
  font-size: 28rpx;
  font-weight: 700;
  color: $meal-text;
}

.detail__tags {
  display: flex;
  gap: 12rpx;
  margin-top: 24rpx;
}

.tag {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
  background-color: $meal-primary-soft;
  color: $meal-primary;
  font-weight: 600;
}

.ingredient {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 26rpx;
  padding: 12rpx 0;
  border-bottom: 1rpx solid $meal-line;
}

.ingredient:last-child {
  border-bottom: none;
}

.ingredient__name {
  color: $meal-text;
}

.step {
  display: flex;
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.step__index {
  flex: 0 0 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  border-radius: 50%;
  background-color: $meal-primary;
  color: #fff;
  font-size: 20rpx;
  font-weight: 700;
  margin-top: 4rpx;
}

.step__text {
  flex: 1;
  font-size: 26rpx;
  line-height: 1.6;
  color: $meal-text;
}

.tip {
  font-size: 26rpx;
  line-height: 1.6;
  color: $meal-text;
  margin-bottom: 10rpx;
}

.remark-input {
  font-size: 26rpx;
  color: $meal-text;
}

.search__ph {
  color: $meal-text-2;
}

.bottombar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background-color: $meal-card;
  border-top: 1rpx solid $meal-line;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.stepper__btn {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  text-align: center;
  border-radius: 50%;
  border: 1rpx solid $meal-line;
  color: $meal-text-2;
  font-size: 32rpx;
}

.stepper__btn--plus {
  background-color: $meal-primary;
  border-color: $meal-primary;
  color: #fff;
}

.stepper__count {
  font-size: 30rpx;
  font-weight: 600;
  min-width: 40rpx;
  text-align: center;
}

.bottombar__btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: $meal-primary;
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
}
</style>
