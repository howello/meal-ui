<script setup lang="ts">
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { myReviews } from "@/api/review";
import CachedImage from "@/components/CachedImage.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import { ORDER_STATUS_TEXT, type Review } from "@/types";
import { useOrderNotifierLifecycle } from "@/utils/notify";
import { previewImages } from "@/utils/preview";

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

/** 星级文案：实心星 + 空心星，保持等宽便于对齐 */
function stars(score: number): string {
  const value = Math.max(0, Math.min(5, score));
  return "★".repeat(value) + "☆".repeat(5 - value);
}

/** 评价图片 JSON 解析，格式异常时按无图处理 */
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

/** 预览当前评价的图片，支持左右滑动 */
function openImages(review: Review, current: string) {
  previewImages(imageList(review), current);
}

/** 订单状态文案 */
function orderStatusText(review: Review): string {
  return ORDER_STATUS_TEXT[review.orderStatus || ""] || "";
}

/** 打开对应订单详情，方便回看整单 */
function openOrder(review: Review) {
  if (!review.orderId) {
    return;
  }
  uni.navigateTo({ url: `/pages/order/detail?orderId=${review.orderId}` });
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar :title="title" />

    <view v-for="review in reviews" :key="review.reviewId" class="card">
      <!-- 评价头部：评分 + 评价时间 -->
      <view class="row-between">
        <text class="stars">{{ stars(review.score) }}</text>
        <text class="tiny">{{ review.createTime }}</text>
      </view>

      <text class="content">{{ review.content || "—" }}</text>

      <view v-if="imageList(review).length" class="images">
        <CachedImage
          v-for="(image, index) in imageList(review)"
          :key="index"
          class="images__item"
          :src="image"
          mode="aspectFill"
          @click="openImages(review, image)"
        />
      </view>

      <!-- 这顿饭的细节：菜品快照 + 厨师 + 订单信息 -->
      <view class="dish-block">
        <view class="dish-block__head">
          <text class="section-title dish-block__title">本次菜品</text>
          <text v-if="review.orderTotalCount" class="tiny">共 {{ review.orderTotalCount }} 份</text>
        </view>

        <view v-if="review.items && review.items.length" class="dishes">
          <view v-for="item in review.items" :key="item.itemId" class="dish">
            <CachedImage
              v-if="item.dishCover"
              class="dish__cover"
              :src="item.dishCover"
              mode="aspectFill"
            />
            <view v-else class="dish__cover dish__cover--ph">{{ item.dishName }}</view>
            <view class="dish__main">
              <text class="dish__name">{{ item.dishName }}</text>
              <text v-if="item.remark" class="dish__remark">备注：{{ item.remark }}</text>
            </view>
            <text class="muted dish__count">× {{ item.count }}</text>
          </view>
        </view>
        <text v-else class="dish-names">{{ review.dishNames || "菜品已删除" }}</text>
      </view>

      <view class="meta">
        <view class="meta__row">
          <text class="muted">谁做的</text>
          <text class="meta__value">
            {{ review.acceptBy || "—" }}
            <template v-if="review.acceptTime"> · {{ review.acceptTime }}</template>
          </text>
        </view>
        <view class="meta__row">
          <text class="muted">订单号</text>
          <text class="meta__value">{{ review.orderNo || "—" }}</text>
        </view>
        <view class="meta__row">
          <text class="muted">下单时间</text>
          <text class="meta__value">{{ review.orderCreateTime || "—" }}</text>
        </view>
        <view v-if="review.finishTime" class="meta__row">
          <text class="muted">完成时间</text>
          <text class="meta__value">{{ review.finishTime }}</text>
        </view>
        <view v-if="review.orderStatus" class="meta__row">
          <text class="muted">订单状态</text>
          <text class="meta__value">{{ orderStatusText(review) }}</text>
        </view>
        <view v-if="review.orderRemark" class="meta__row">
          <text class="muted">整单备注</text>
          <text class="meta__value">{{ review.orderRemark }}</text>
        </view>
        <view v-if="isChefScope" class="meta__row">
          <text class="muted">评价人</text>
          <text class="meta__value">
            {{ review.anonymous === "1" ? "匿名" : review.userName || "—" }}
          </text>
        </view>
      </view>

      <view class="order-link" @click="openOrder(review)">
        查看订单详情 <text class="order-link__chev">›</text>
      </view>
    </view>

    <view v-if="!reviews.length" class="empty">{{ loading ? "加载中…" : "还没有评价" }}</view>
  </view>
</template>

<style lang="scss" scoped>
.stars {
  font-size: 30rpx;
  color: #ffb020;
  letter-spacing: 4rpx;
}

.content {
  display: block;
  margin-top: 16rpx;
  font-size: 27rpx;
  line-height: 1.6;
  color: $lg-ink;
}

.images {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

.images__item {
  width: 160rpx;
  height: 160rpx;
  border-radius: 16rpx;
  overflow: hidden;
}

/* 菜品细节区：与评价正文用细线分隔，视觉上归为「订单信息」 */
.dish-block {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid $lg-line;
}

.dish-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dish-block__head .dish-block__title {
  margin-bottom: 0;
  font-size: 26rpx;
}

.dishes {
  margin-top: 8rpx;
}

.dish {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx solid $lg-line;
}

.dish:last-child {
  border-bottom: none;
}

.dish__cover {
  width: 110rpx;
  height: 110rpx;
  flex: 0 0 110rpx;
  border-radius: 18rpx;
  overflow: hidden;
}

.dish__cover--ph {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6rpx;
  box-sizing: border-box;
  text-align: center;
  font-size: 20rpx;
  color: #fff;
  background: linear-gradient(135deg, $lg-accent-2, $lg-accent);
}

.dish__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.dish__name {
  font-size: 26rpx;
  font-weight: 600;
  color: $lg-ink;
}

.dish__remark {
  font-size: 22rpx;
  color: $lg-ink-3;
}

.dish__count {
  flex: 0 0 auto;
}

.dish-names {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: $lg-ink;
}

.meta {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid $lg-line;
}

.meta__row {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  padding: 6rpx 0;
}

.meta__value {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 24rpx;
  color: $lg-ink;
  word-break: break-all;
}

/* 卡片底部的订单入口 */
.order-link {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid $lg-line;
  text-align: right;
  font-size: 24rpx;
  color: $lg-accent;
  font-weight: 600;
}

.order-link__chev {
  font-size: 26rpx;
}
</style>
