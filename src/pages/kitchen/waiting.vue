<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { acceptOrder, kitchenOrders } from "@/api/order";
import TabBar from "@/components/TabBar.vue";
import { useUserStore } from "@/store/user";
import { ORDER_STATUS, type Order } from "@/types";

const userStore = useUserStore();

const orders = ref<Order[]>([]);
const loading = ref(false);
const acting = ref(0);

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
  loadOrders();
});

async function loadOrders() {
  loading.value = true;
  try {
    const res = await kitchenOrders({ status: ORDER_STATUS.WAITING, pageSize: 50 });
    orders.value = res.rows;
  } catch (e) {
    orders.value = [];
  } finally {
    loading.value = false;
  }
}

async function doAccept(order: Order) {
  if (acting.value) {
    return;
  }
  acting.value = order.orderId;
  try {
    await acceptOrder(order.orderId);
    uni.showToast({ title: "已接单", icon: "none" });
    loadOrders();
  } catch (e) {
    // 提示已由请求层给出
  } finally {
    acting.value = 0;
  }
}

/** 等待时长由后端计算返回，前端不自己计时 */
function waitText(order: Order): string {
  const minutes = order.waitMinutes ?? 0;
  return `等待 ${minutes} 分钟`;
}
</script>

<template>
  <view class="kitchen">
    <view class="header">
      <text class="header__title">待接单 · {{ orders.length }} 单</text>
      <text class="header__sub">{{ userStore.nickName }}，今天辛苦了</text>
    </view>

    <view class="kitchen__body">
      <view v-for="order in orders" :key="order.orderId" class="card order">
        <view class="row-between">
          <text class="order__who">{{ order.userName || "家人" }} 点的单</text>
          <text class="timer">{{ waitText(order) }}</text>
        </view>

        <view v-for="item in order.items || []" :key="item.itemId" class="item">
          <view class="item__cover">{{ item.dishName }}</view>
          <view class="item__main">
            <text class="item__name">{{ item.dishName }} × {{ item.count }}</text>
            <text v-if="item.remark" class="tiny">{{ item.remark }}</text>
          </view>
        </view>

        <view v-if="order.orderRemark" class="note">整体备注：{{ order.orderRemark }}</view>

        <view class="order__actions">
          <view class="btn btn--line" @click="loadOrders">暂不接</view>
          <view class="btn" @click="doAccept(order)">接 单</view>
        </view>
      </view>

      <view v-if="!orders.length" class="empty">{{ loading ? "加载中…" : "暂时没有待接单的订单" }}</view>
    </view>

    <TabBar active="kitchen-waiting" />
  </view>
</template>

<style lang="scss" scoped>
.kitchen {
  min-height: 100vh;
  background-color: $meal-bg;
  padding-bottom: 200rpx;
}

.header {
  background-color: $meal-primary;
  color: #fff;
  padding: 60rpx 28rpx 32rpx;
  border-radius: 0 0 36rpx 36rpx;
}

.header__title {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
}

.header__sub {
  display: block;
  font-size: 24rpx;
  opacity: 0.9;
  margin-top: 8rpx;
}

.kitchen__body {
  padding: 24rpx;
}

.order__who {
  font-size: 28rpx;
  font-weight: 700;
  color: $meal-text;
}

.timer {
  font-size: 22rpx;
  color: $meal-warning;
  background-color: #fff4e5;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
  font-weight: 600;
}

.item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 18rpx;
}

.item__cover {
  width: 76rpx;
  height: 76rpx;
  flex: 0 0 76rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #ffc49b, #ff7a45);
  color: #fff;
  font-size: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 6rpx;
}

.item__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.item__name {
  font-size: 26rpx;
  color: $meal-text;
}

.note {
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  background-color: $meal-primary-soft;
  color: $meal-primary;
  font-size: 24rpx;
}

.order__actions {
  display: flex;
  gap: 20rpx;
  margin-top: 24rpx;
}

.btn {
  flex: 1.4;
  height: 76rpx;
  line-height: 76rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: $meal-primary;
  color: #fff;
  font-size: 26rpx;
  font-weight: 600;
}

.btn--line {
  flex: 1;
  background-color: transparent;
  border: 1rpx solid $meal-line;
  color: $meal-text-2;
  font-weight: 400;
}
</style>
