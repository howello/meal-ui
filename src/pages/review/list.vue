<script setup lang="ts">
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { myReviews } from "@/api/review";
import CachedImage from "@/components/CachedImage.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import type { Review } from "@/types";
import { useOrderNotifierLifecycle } from "@/utils/notify";

const reviews = ref<Review[]>([]);
const loading = ref(false);
/** 视角：空为点餐人（自己写的评价），chef 为厨师（自己收到的评价） */
const scope = ref("");
const isChefScope = computed(() => scope.value === "chef");
const title = computed(() => (isChefScope.value ? "收到的评价" : "我的评价"));
useOrderNotifierLifecycle();

onLoad((options) => {
  scope.value = options?.scope === "chef" ? "chef" : "";
});

onShow(() => {
  loadReviews();
});

async function loadReviews() {
  loading.value = true;
  try {
    const res = await myReviews({ pageSize: 50, scope: scope.value || undefined });
    reviews.value = res.rows;
  } catch (e) {
    reviews.value = [];
  } finally {
    loading.value = false;
  }
}

function stars(score: number): string {
  const value = Math.max(0, Math.min(5, score));
  return "★".repeat(value) + "☆".repeat(5 - value);
}

function imageList(review: Review): string[] {
  if (!review.images) {
    return [];
  }
  try {
    const parsed = JSON.parse(review.images);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar :title="title" />

    <view v-for="review in reviews" :key="review.reviewId" class="card">
      <text class="dish-names">{{ review.dishNames || "菜品已删除" }}</text>
      <view class="row-between">
        <text class="tiny">{{ review.orderNo || "" }}</text>
        <text class="tiny">{{ review.createTime }}</text>
      </view>
      <view class="stars">{{ stars(review.score) }}</view>
      <text class="content">{{ review.content || "—" }}</text>
      <view v-if="imageList(review).length" class="images">
        <CachedImage
          v-for="(image, index) in imageList(review)"
          :key="index"
          class="images__item"
          :src="image"
          mode="aspectFill"
        />
      </view>
    </view>

    <view v-if="!reviews.length" class="empty">{{ loading ? "加载中…" : "还没有评价" }}</view>
  </view>
</template>

<style lang="scss" scoped>
.dish-names {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: $lg-ink;
  margin-bottom: 8rpx;
}

.stars {
  font-size: 30rpx;
  color: #ffb020;
  letter-spacing: 4rpx;
  margin: 12rpx 0 8rpx;
}

.content {
  display: block;
  font-size: 26rpx;
  line-height: 1.6;
  color: $lg-ink;
}

.images {
  display: flex;
  gap: 12rpx;
  margin-top: 16rpx;
}

.images__item {
  width: 140rpx;
  height: 140rpx;
  border-radius: 16rpx;
}
</style>
