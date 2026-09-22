<script setup lang="ts">
import { onLoad, onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { cancelOrder, orderDetail } from "@/api/order";
import { ORDER_STATUS, ORDER_STATUS_TEXT, type Order } from "@/types";

const orderId = ref(0);
const order = ref<Order | null>(null);
const loading = ref(true);

onLoad((options) => {
  orderId.value = Number(options?.orderId || 0);
});

onShow(() => {
  if (orderId.value) {
    loadDetail();
  }
});

async function loadDetail() {
  loading.value = true;
  try {
    order.value = await orderDetail(orderId.value);
  } catch (e) {
    order.value = null;
  } finally {
    loading.value = false;
  }
}

/** 状态时间轴：已下单 → 已接单 → 制作中 → 已完成 */
const timeline = computed(() => {
  const status = order.value?.status || ORDER_STATUS.WAITING;
  const steps = [
    { key: "created", text: "已下单" },
    { key: "accepted", text: "已接单" },
    { key: "cooking", text: "制作中" },
    { key: "finished", text: "已完成" },
  ];
  let reached = 1;
  if (status === ORDER_STATUS.COOKING) {
    reached = 3;
  } else if (status === ORDER_STATUS.FINISHED) {
    reached = 4;
  } else if (status === ORDER_STATUS.CANCELED) {
    reached = 1;
  }
  return steps.map((step, index) => ({ ...step, done: index < reached }));
});

const statusHint = computed(() => {
  const current = order.value;
  if (!current) {
    return "";
  }
  if (current.status === ORDER_STATUS.WAITING) {
    return "已提交，等待厨师接单";
  }
  if (current.status === ORDER_STATUS.COOKING) {
    return `${current.acceptBy || "厨师"} ${current.acceptTime || ""} 已接单，正在制作`;
  }
  if (current.status === ORDER_STATUS.FINISHED) {
    return `${current.finishBy || "厨师"} ${current.finishTime || ""} 已完成`;
  }
  return "订单已取消";
});

function statusText(status: string): string {
  return ORDER_STATUS_TEXT[status] || "未知";
}

function doCancel() {
  if (!order.value) {
    return;
  }
  uni.showModal({
    title: "取消订单",
    content: "确定取消这张订单吗？",
    success: async (res) => {
      if (!res.confirm) {
        return;
      }
      try {
        await cancelOrder(orderId.value);
        uni.showToast({ title: "已取消", icon: "none" });
        loadDetail();
      } catch (e) {
        // 提示已由请求层给出
      }
    },
  });
}

function goReview() {
  uni.navigateTo({ url: `/pages/review/edit?orderId=${orderId.value}` });
}
</script>

<template>
  <view v-if="order" class="page-body">
    <view class="card status">
      <text class="status__text">{{ statusText(order.status) }}</text>
      <text class="tiny status__hint">{{ statusHint }}</text>
      <view class="timeline">
        <view v-for="step in timeline" :key="step.key" class="timeline__node" :class="{ 'timeline__node--done': step.done }">
          <view class="timeline__bar"></view>
          <text class="timeline__label">{{ step.text }}</text>
        </view>
      </view>
    </view>

    <view class="card">
      <view v-for="item in order.items || []" :key="item.itemId" class="item">
        <image v-if="item.dishCover" class="item__cover" :src="item.dishCover" mode="aspectFill" />
        <view v-else class="item__cover item__cover--ph">{{ item.dishName }}</view>
        <view class="item__main">
          <text class="item__name">{{ item.dishName }}</text>
          <text v-if="item.remark" class="tiny">{{ item.remark }}</text>
        </view>
        <text class="muted">× {{ item.count }}</text>
      </view>
    </view>

    <view class="card">
      <view class="row-between info">
        <text class="muted">订单号</text>
        <text class="value">{{ order.orderNo }}</text>
      </view>
      <view class="row-between info">
        <text class="muted">下单时间</text>
        <text class="value">{{ order.createTime }}</text>
      </view>
      <view class="row-between info">
        <text class="muted">点餐人</text>
        <text class="value">{{ order.userName || "—" }}</text>
      </view>
      <view class="row-between info">
        <text class="muted">备注</text>
        <text class="value">{{ order.orderRemark || "—" }}</text>
      </view>
    </view>

    <view class="actions">
      <view v-if="order.status === ORDER_STATUS.WAITING" class="actions__btn actions__btn--line" @click="doCancel">
        取消订单
      </view>
      <view v-if="order.status === ORDER_STATUS.FINISHED" class="actions__btn" @click="goReview">去评价</view>
      <view v-if="order.status === ORDER_STATUS.COOKING" class="actions__btn actions__btn--disabled">
        待完成后评价
      </view>
    </view>
  </view>

  <view v-else class="empty">{{ loading ? "加载中…" : "订单不存在" }}</view>
</template>

<style lang="scss" scoped>
.status {
  text-align: center;
}

.status__text {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: $meal-primary;
}

.status__hint {
  display: block;
  margin-top: 8rpx;
}

.timeline {
  display: flex;
  margin-top: 32rpx;
}

.timeline__node {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.timeline__bar {
  width: 100%;
  height: 6rpx;
  border-radius: 4rpx;
  background-color: $meal-line;
}

.timeline__node--done .timeline__bar {
  background-color: $meal-primary;
}

.timeline__label {
  font-size: 21rpx;
  color: $meal-text-2;
}

.timeline__node--done .timeline__label {
  color: $meal-primary;
  font-weight: 600;
}

.item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid $meal-line;
}

.item:last-child {
  border-bottom: none;
}

.item__cover {
  width: 96rpx;
  height: 96rpx;
  border-radius: 18rpx;
  flex: 0 0 96rpx;
}

.item__cover--ph {
  background: linear-gradient(135deg, #ffc49b, #ff7a45);
  color: #fff;
  font-size: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.item__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.item__name {
  font-size: 26rpx;
  font-weight: 600;
  color: $meal-text;
}

.info {
  padding: 10rpx 0;
}

.value {
  font-size: 26rpx;
  color: $meal-text;
}

.actions {
  display: flex;
  gap: 20rpx;
  margin-top: 40rpx;
}

.actions__btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: $meal-primary;
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}

.actions__btn--line {
  background-color: transparent;
  border: 1rpx solid $meal-line;
  color: $meal-text-2;
}

.actions__btn--disabled {
  opacity: 0.45;
}
</style>
