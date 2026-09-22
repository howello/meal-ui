<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { orderDetail } from "@/api/order";
import { submitReview } from "@/api/review";
import { uploadImage } from "@/api/upload";
import type { Order } from "@/types";

const SCORE_TEXT: Record<number, string> = {
  1: "不太行",
  2: "一般",
  3: "还行",
  4: "不错",
  5: "好吃",
};

const orderId = ref(0);
const order = ref<Order | null>(null);
const score = ref(5);
const content = ref("");
const images = ref<string[]>([]);
const anonymous = ref(false);
const submitting = ref(false);

onLoad(async (options) => {
  orderId.value = Number(options?.orderId || 0);
  if (!orderId.value) {
    return;
  }
  try {
    order.value = await orderDetail(orderId.value);
  } catch (e) {
    order.value = null;
  }
});

const scoreText = computed(() => SCORE_TEXT[score.value] || "");
const stars = computed(() => [1, 2, 3, 4, 5]);

async function pickImage() {
  if (images.value.length >= 3) {
    uni.showToast({ title: "最多上传 3 张", icon: "none" });
    return;
  }
  uni.chooseImage({
    count: 3 - images.value.length,
    success: async (res) => {
      const paths = res.tempFilePaths as string[];
      for (const path of paths) {
        try {
          const url = await uploadImage(path);
          if (url) {
            images.value.push(url);
          }
        } catch (e) {
          // 上传失败已提示
        }
      }
    },
  });
}

function removeImage(index: number) {
  images.value.splice(index, 1);
}

async function submit() {
  if (!orderId.value) {
    return;
  }
  if (!content.value.trim()) {
    uni.showToast({ title: "说点什么吧", icon: "none" });
    return;
  }
  if (submitting.value) {
    return;
  }
  submitting.value = true;
  try {
    await submitReview({
      orderId: orderId.value,
      score: score.value,
      content: content.value,
      images: images.value.length ? JSON.stringify(images.value) : undefined,
      anonymous: anonymous.value ? "1" : "0",
    });
    uni.showToast({ title: "评价已发布", icon: "none" });
    setTimeout(() => {
      uni.redirectTo({ url: "/pages/review/list" });
    }, 700);
  } catch (e) {
    // 提示已由请求层给出
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="page-body">
    <view v-if="order" class="card head">
      <view class="head__cover">{{ order.items?.[0]?.dishName || "订单" }}</view>
      <view class="head__main">
        <text class="head__no">{{ order.orderNo }}</text>
        <text class="tiny">{{ order.createTime }} · {{ order.totalCount }} 份 · {{ (order.items || []).length }} 道菜</text>
      </view>
    </view>

    <view class="card score">
      <text class="tiny">这顿饭怎么样？</text>
      <view class="stars">
        <text
          v-for="star in stars"
          :key="star"
          class="stars__item"
          :class="{ 'stars__item--on': star <= score }"
          @click="score = star"
        >
          ★
        </text>
      </view>
      <text class="score__text">{{ scoreText }}</text>
    </view>

    <view class="card">
      <textarea
        v-model="content"
        class="content"
        maxlength="500"
        placeholder="说说这顿饭的味道…"
        placeholder-class="ph"
      />
      <text class="tiny content__count">{{ content.length }}/500</text>
    </view>

    <view class="card">
      <text class="section-title">添加图片</text>
      <view class="upl">
        <view v-for="(image, index) in images" :key="index" class="upl__box">
          <image class="upl__img" :src="image" mode="aspectFill" @click="removeImage(index)" />
        </view>
        <view v-if="images.length < 3" class="upl__box upl__box--add" @click="pickImage">＋</view>
      </view>
    </view>

    <view class="card row-between">
      <text class="menu__text">匿名评价</text>
      <switch :checked="anonymous" color="#FF6B35" @change="anonymous = ($event.detail as any).value" />
    </view>

    <view class="submit" :class="{ 'submit--disabled': submitting }" @click="submit">
      {{ submitting ? "发布中…" : "发布评价" }}
    </view>
  </view>
</template>

<style lang="scss" scoped>
.head {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.head__cover {
  width: 88rpx;
  height: 88rpx;
  flex: 0 0 88rpx;
  border-radius: 18rpx;
  background: linear-gradient(135deg, #ffc49b, #ff7a45);
  color: #fff;
  font-size: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 6rpx;
}

.head__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.head__no {
  font-size: 26rpx;
  font-weight: 600;
  color: $meal-text;
}

.score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 36rpx 24rpx;
}

.stars {
  display: flex;
  gap: 16rpx;
}

.stars__item {
  font-size: 56rpx;
  color: $meal-line;
}

.stars__item--on {
  color: #ffb020;
}

.score__text {
  font-size: 26rpx;
  color: $meal-primary;
  font-weight: 600;
}

.content {
  width: 100%;
  min-height: 180rpx;
  font-size: 26rpx;
  color: $meal-text;
}

.content__count {
  display: block;
  text-align: right;
}

.ph {
  color: $meal-text-2;
}

.upl {
  display: flex;
  gap: 16rpx;
}

.upl__box {
  width: 150rpx;
  height: 150rpx;
  border-radius: 18rpx;
  overflow: hidden;
}

.upl__img {
  width: 150rpx;
  height: 150rpx;
}

.upl__box--add {
  border: 2rpx dashed $meal-line;
  color: $meal-text-2;
  font-size: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu__text {
  font-size: 28rpx;
  color: $meal-text;
}

.submit {
  margin-top: 40rpx;
  height: 96rpx;
  line-height: 96rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: $meal-primary;
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
}

.submit--disabled {
  opacity: 0.6;
}
</style>
