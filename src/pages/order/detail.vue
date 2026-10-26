<script setup lang="ts">
import { onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { cancelOrder, orderDetail } from "@/api/order";
import AppDialog from "@/components/AppDialog.vue";
import CachedImage from "@/components/CachedImage.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import { confirm } from "@/composables/useDialog";
import { useUserStore } from "@/store/user";
import { ORDER_STATUS, ORDER_STATUS_TEXT, type Order, type OrderNotification } from "@/types";
import { createOrderRefreshThrottle, useOrderNotifierLifecycle } from "@/utils/notify";
import { previewImage } from "@/utils/preview";

const userStore = useUserStore();
const orderId = ref(0);
const order = ref<Order | null>(null);
const loading = ref(true);
/** 是否本人下的订单：厨师查看自己制作过的订单时，不显示点餐人的取消/评价操作 */
const isMine = computed(() => !!order.value && order.value.userId === userStore.user?.userId);

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

/** 当前详情页的通知刷新节流器 */
const refreshDetail = createOrderRefreshThrottle(loadDetail);

/** 只有当前订单的状态通知才需要刷新详情 */
function handleNotifications(notifications: OrderNotification[]) {
  if (notifications.some((item) => item.orderId === orderId.value)) {
    refreshDetail.trigger();
  }
}

useOrderNotifierLifecycle({ onNotifications: handleNotifications });
onUnload(refreshDetail.dispose);

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
  } else if (status === ORDER_STATUS.CANCELED || status === ORDER_STATUS.UNACCEPTED) {
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
    return deadlineHint(current) || "已提交，等待厨师接单";
  }
  if (current.status === ORDER_STATUS.COOKING) {
    return `${current.acceptBy || "厨师"} ${current.acceptTime || ""} 已接单，正在制作`;
  }
  if (current.status === ORDER_STATUS.FINISHED) {
    return `${current.finishBy || "厨师"} ${current.finishTime || ""} 已完成`;
  }
  if (current.status === ORDER_STATUS.UNACCEPTED) {
    return current.closeReason === "2"
      ? "超过接单时间仍无人接单，可以重新下单"
      : "没有人接这张单，可以重新下单";
  }
  return "订单已取消";
});

/**
 * 待接单时的补充说明：指派对象与剩余时间
 *
 * @param order 当前订单
 * @returns 提示文案，非待接单或无附加信息时返回空串
 */
function deadlineHint(order: Order): string {
  const parts: string[] = [];
  if (order.assignMode === "1" && order.assignUserName) {
    parts.push(`已指派给 ${order.assignUserName}`);
  } else if (order.assignMode === "2") {
    parts.push("已转为公开抢单");
  }
  const remaining = remainingText(order.deadlineTime);
  if (remaining) {
    parts.push(remaining);
  }
  return parts.join("，");
}

/**
 * 把截止时间换算成「还剩 X 分钟」；已过期或时间缺失时返回空串
 *
 * @param deadline 截止时间字符串
 * @returns 剩余时间文案
 */
function remainingText(deadline?: string): string {
  if (!deadline) {
    return "";
  }
  const target = new Date(deadline.replace(/-/g, "/")).getTime();
  if (!Number.isFinite(target)) {
    return "";
  }
  const minutes = Math.floor((target - Date.now()) / 60000);
  if (minutes <= 0) {
    return "";
  }
  if (minutes >= 60) {
    return `还剩约 ${Math.floor(minutes / 60)} 小时`;
  }
  return `还剩约 ${minutes} 分钟`;
}

function statusText(status: string): string {
  return ORDER_STATUS_TEXT[status] || "未知";
}

function doCancel() {
  if (!order.value) {
    return;
  }
  confirm("确定取消这张订单吗？", "取消订单").then(async (ok) => {
    if (!ok) {
      return;
    }
    try {
      await cancelOrder(orderId.value);
      uni.showToast({ title: "已取消", icon: "none" });
      loadDetail();
    } catch (e) {
      // 提示已由请求层给出
    }
  });
}

function goReview() {
  uni.navigateTo({ url: `/pages/review/edit?orderId=${orderId.value}` });
}
</script>

<template>
  <view class="theme-page" :class="themeRootClass">
    <GlassNavBar title="订单详情" />

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
          <CachedImage
            v-if="item.dishCover"
            class="item__cover"
            :src="item.dishCover"
            mode="aspectFill"
            @click="previewImage(item.dishCover)"
          />
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

      <view v-if="isMine" class="actions">
        <view v-if="order.status === ORDER_STATUS.WAITING" class="actions__btn actions__btn--cancel" @click="doCancel">
          取消订单
        </view>
        <view
          v-else-if="order.status === ORDER_STATUS.FINISHED && !order.reviewed"
          class="actions__btn"
          @click="goReview"
        >
          去评价
        </view>
        <view v-else-if="order.status === ORDER_STATUS.FINISHED" class="actions__btn actions__btn--disabled">
          已评价
        </view>
        <view v-else-if="order.status === ORDER_STATUS.COOKING" class="actions__btn actions__btn--disabled">
          待完成后评价
        </view>
      </view>
    </view>

    <view v-else class="empty">{{ loading ? "加载中…" : "订单不存在" }}</view>

    <AppDialog />
  </view>
</template>

<style lang="scss" scoped>
.status {
  text-align: center;
}

.status__text {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: $lg-accent;
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
  background-color: $lg-line;
}

.timeline__node--done .timeline__bar {
  background: linear-gradient(90deg, $lg-accent, $lg-accent-2);
}

.timeline__label {
  font-size: 21rpx;
  color: $lg-ink-2;
}

.timeline__node--done .timeline__label {
  color: $lg-accent;
  font-weight: 600;
}

.item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid $lg-line;
}

.item:last-child {
  border-bottom: none;
}

.item__cover {
  width: 208rpx;
  height: 208rpx;
  border-radius: 26rpx;
  flex: 0 0 208rpx;
}

.item__cover--ph {
  background: linear-gradient(135deg, $lg-accent-2, $lg-accent);
  color: #fff;
  font-size: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 8rpx;
  box-sizing: border-box;
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
  color: $lg-ink;
}

.info {
  padding: 10rpx 0;
}

.value {
  font-size: 26rpx;
  color: $lg-ink;
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
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 20rpx 44rpx $lg-accent-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

/* 取消订单：半透明玻璃底 + 危险色描边，一眼能看出是按钮 */
.actions__btn--cancel {
  box-sizing: border-box;
  background: $lg-fill-2;
  border: 2rpx solid $meal-danger;
  color: $meal-danger;
  box-shadow: none;
}

.actions__btn--disabled {
  opacity: 0.45;
}
</style>
