<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { submitOrder, type SubmitOrderItem } from "@/api/order";
import { useCartStore } from "@/store/cart";

const ORDER_REMARK_KEY = "meal-order-remark";

const cartStore = useCartStore();

const orderRemark = ref("");
const now = ref("");
const submitting = ref(false);

onLoad(() => {
  const saved = uni.getStorageSync(ORDER_REMARK_KEY);
  orderRemark.value = typeof saved === "string" ? saved : "";
  now.value = formatNow();
});

const totalCount = computed(() => cartStore.totalCount);
const dishKinds = computed(() => cartStore.dishKinds);

function formatNow(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

async function submit() {
  if (cartStore.isEmpty) {
    uni.showToast({ title: "购物车是空的", icon: "none" });
    return;
  }
  if (submitting.value) {
    return;
  }
  submitting.value = true;
  try {
    const items: SubmitOrderItem[] = cartStore.lines.map((line) => ({
      dishId: line.dishId,
      count: line.count,
      remark: line.remark,
    }));
    const orderId = await submitOrder({ items, orderRemark: orderRemark.value });
    cartStore.clear();
    uni.removeStorageSync(ORDER_REMARK_KEY);
    uni.showToast({ title: "下单成功", icon: "none" });
    setTimeout(() => {
      uni.redirectTo({ url: `/pages/order/detail?orderId=${orderId}` });
    }, 700);
  } catch (e) {
    // 失败提示已由请求层统一弹出
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="page-body">
    <view class="card">
      <view class="row-between">
        <text class="muted">下单时间</text>
        <text class="value">{{ now }}</text>
      </view>
    </view>

    <view class="card">
      <text class="section-title">点餐明细</text>
      <view v-for="line in cartStore.lines" :key="line.dishId" class="item">
        <view class="item__main">
          <text class="item__name">{{ line.dishName }}</text>
          <text v-if="line.remark" class="tiny">{{ line.remark }}</text>
        </view>
        <text class="muted">× {{ line.count }}</text>
      </view>
      <view class="hr"></view>
      <view class="row-between">
        <text class="muted">共 {{ totalCount }} 份</text>
        <text class="tiny">{{ dishKinds }} 道菜</text>
      </view>
    </view>

    <view class="card">
      <text class="section-title">备注</text>
      <input
        v-model="orderRemark"
        class="remark-input"
        placeholder="口味 / 忌口，如：红烧肉少放糖，饭多一点"
        placeholder-class="ph"
      />
    </view>

    <view class="note">提交后厨师会收到通知，制作完成后可在订单详情评价</view>

    <view class="submit" :class="{ 'submit--disabled': submitting }" @click="submit">
      {{ submitting ? "提交中…" : "提交订单" }}
    </view>
  </view>
</template>

<style lang="scss" scoped>
.value {
  font-size: 26rpx;
  color: $meal-text;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid $meal-line;
}

.item:last-of-type {
  border-bottom: none;
}

.item__main {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.item__name {
  font-size: 26rpx;
  color: $meal-text;
}

.hr {
  height: 1rpx;
  background-color: $meal-line;
  margin: 16rpx 0;
}

.remark-input {
  font-size: 26rpx;
  color: $meal-text;
}

.ph {
  color: $meal-text-2;
}

.note {
  margin-top: 24rpx;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  background-color: $meal-primary-soft;
  color: $meal-primary;
  font-size: 24rpx;
  line-height: 1.5;
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
