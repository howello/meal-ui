<script setup lang="ts">
import { onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { ref } from "vue";
import { cancelOrder, myOrders } from "@/api/order";
import AppDialog from "@/components/AppDialog.vue";
import { confirm } from "@/composables/useDialog";
import { ORDER_STATUS, ORDER_STATUS_TEXT, type Order } from "@/types";
import { useOrderNotifierLifecycle } from "@/utils/notify";

const FILTERS = [
  { key: "", text: "全部" },
  { key: ORDER_STATUS.WAITING, text: "待接单" },
  { key: ORDER_STATUS.COOKING, text: "制作中" },
  { key: ORDER_STATUS.FINISHED, text: "已完成" },
];

const orders = ref<Order[]>([]);
const activeStatus = ref("");
const loading = ref(false);
useOrderNotifierLifecycle();

onShow(() => {
  loadOrders();
});

async function loadOrders() {
  loading.value = true;
  try {
    const res = await myOrders({
      status: activeStatus.value || undefined,
      pageSize: 50,
    });
    orders.value = res.rows;
  } catch (e) {
    orders.value = [];
  } finally {
    loading.value = false;
  }
}

function pickFilter(key: string) {
  activeStatus.value = key;
  loadOrders();
}

function statusText(status: string): string {
  return ORDER_STATUS_TEXT[status] || "未知";
}

function statusClass(status: string): string {
  if (status === ORDER_STATUS.WAITING) {
    return "tag tag--warn";
  }
  if (status === ORDER_STATUS.COOKING) {
    return "tag tag--primary";
  }
  if (status === ORDER_STATUS.FINISHED) {
    return "tag tag--ok";
  }
  return "tag tag--gray";
}

function openDetail(order: Order) {
  uni.navigateTo({ url: `/pages/order/detail?orderId=${order.orderId}` });
}

function goReview(order: Order) {
  uni.navigateTo({ url: `/pages/review/edit?orderId=${order.orderId}` });
}

function doCancel(order: Order) {
  confirm("确定取消这张订单吗？", "取消订单").then(async (ok) => {
    if (!ok) {
      return;
    }
    try {
      await cancelOrder(order.orderId);
      uni.showToast({ title: "已取消", icon: "none" });
      loadOrders();
    } catch (e) {
      // 提示已由请求层给出
    }
  });
}
</script>

<template>
  <view class="page-body">
    <view class="filters">
      <view
        v-for="item in FILTERS"
        :key="item.key"
        class="chip"
        :class="{ 'chip--on': activeStatus === item.key }"
        @click="pickFilter(item.key)"
      >
        {{ item.text }}
      </view>
    </view>

    <view v-for="order in orders" :key="order.orderId" class="card order" @click="openDetail(order)">
      <view class="row-between">
        <text class="tiny">{{ order.orderNo }} · {{ order.createTime }}</text>
        <text :class="statusClass(order.status)">{{ statusText(order.status) }}</text>
      </view>

      <view class="thumbs">
        <view v-for="item in order.items || []" :key="item.itemId" class="thumb">
          <image v-if="item.dishCover" class="thumb__img" :src="item.dishCover" mode="aspectFill" />
          <text v-else class="thumb__text">{{ item.dishName }}</text>
        </view>
      </view>

      <view class="row-between">
        <text class="tiny">{{ order.totalCount }} 份 · {{ (order.items || []).length }} 道菜</text>
        <view class="order__actions">
          <text
            v-if="order.status === ORDER_STATUS.WAITING"
            class="btn btn--cancel"
            @click.stop="doCancel(order)"
          >
            取消订单
          </text>
          <text
            v-else-if="order.status === ORDER_STATUS.FINISHED && !order.reviewed"
            class="btn"
            @click.stop="goReview(order)"
          >
            去评价
          </text>
          <text v-else-if="order.status === ORDER_STATUS.FINISHED" class="tiny">已评价</text>
          <text v-else-if="order.status === ORDER_STATUS.COOKING" class="tiny">厨师已接单 ›</text>
        </view>
      </view>
    </view>

    <view v-if="!orders.length" class="empty">{{ loading ? "加载中…" : "还没有订单" }}</view>
  </view>

  <AppDialog />
</template>

<style lang="scss" scoped>
.filters {
  display: flex;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

/* 筛选 chip：玻璃胶囊，选中态暖橙渐变 */
.chip {
  padding: 10rpx 28rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.6);
  border: 1rpx solid $lg-border;
  color: $lg-ink-2;
  font-size: 24rpx;
}

.chip--on {
  color: #fff;
  font-weight: 700;
  border-color: transparent;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 10rpx 22rpx $lg-accent-shadow;
}

.order {
  display: block;
}

.thumbs {
  display: flex;
  gap: 12rpx;
  margin: 18rpx 0;
}

.thumb {
  width: 92rpx;
  height: 92rpx;
  border-radius: 18rpx;
  overflow: hidden;
  background: linear-gradient(135deg, $lg-accent-2, $lg-accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb__img {
  width: 92rpx;
  height: 92rpx;
}

.thumb__text {
  color: #fff;
  font-size: 20rpx;
  text-align: center;
  padding: 0 6rpx;
}

.order__actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.btn {
  padding: 10rpx 28rpx;
  border-radius: 999rpx;
  color: #fff;
  font-size: 24rpx;
  font-weight: 700;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 10rpx 22rpx $lg-accent-shadow;
}

/* 取消订单：玻璃底 + 危险色描边，和订单详情页一致 */
.btn--cancel {
  background: rgba(255, 255, 255, 0.6);
  border: 2rpx solid $meal-danger;
  color: $meal-danger;
  box-shadow: none;
}

.tag {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  font-weight: 600;
}

.tag--warn {
  background-color: #fff4e5;
  color: $meal-warning;
}

.tag--primary {
  background-color: $lg-accent-soft;
  color: $lg-accent;
}

.tag--ok {
  background-color: #e7f8f0;
  color: $meal-success;
}

.tag--gray {
  background-color: $lg-line;
  color: $lg-ink-2;
}
</style>
