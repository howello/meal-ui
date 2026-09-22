<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { finishOrder, kitchenOrders } from "@/api/order";
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
    const res = await kitchenOrders({ status: ORDER_STATUS.COOKING, pageSize: 50 });
    orders.value = res.rows;
  } catch (e) {
    orders.value = [];
  } finally {
    loading.value = false;
  }
}

async function doFinish(order: Order) {
  if (acting.value) {
    return;
  }
  acting.value = order.orderId;
  try {
    await finishOrder(order.orderId);
    uni.showToast({ title: "已完成", icon: "none" });
    loadOrders();
  } catch (e) {
    // 提示已由请求层给出
  } finally {
    acting.value = 0;
  }
}

/** 已制作时长由后端计算返回，前端不自己计时 */
function cookText(order: Order): string {
  const minutes = order.cookMinutes ?? 0;
  return `已做 ${minutes} 分钟`;
}
</script>

<template>
  <view class="kitchen">
    <view class="header">
      <text class="header__title">制作中 · {{ orders.length }} 单</text>
      <text class="header__sub">做完记得点「完成」，点餐人会收到提醒</text>
    </view>

    <view class="kitchen__body">
      <view v-for="order in orders" :key="order.orderId" class="card order">
        <view class="row-between">
          <text class="order__who">{{ order.userName || "家人" }} 的订单</text>
          <text class="timer">{{ cookText(order) }}</text>
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
          <view class="btn" @click="doFinish(order)">标记完成</view>
        </view>
      </view>

      <view v-if="!orders.length" class="empty">{{ loading ? "加载中…" : "暂时没有制作中的订单" }}</view>
    </view>

    <TabBar active="kitchen-cooking" />
  </view>
</template>

<style lang="scss" scoped>
.kitchen {
  min-height: 100vh;
  background-color: $meal-bg;
  padding-bottom: 200rpx;
}

.header {
  background: linear-gradient(120deg, $meal-primary, $meal-primary-2);
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

.order {
  border-left: 6rpx solid $meal-primary;
}

.order__who {
  font-size: 28rpx;
  font-weight: 700;
  color: $meal-text;
}

.timer {
  font-size: 22rpx;
  color: $meal-primary;
  background-color: $meal-primary-soft;
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
  margin-top: 24rpx;
}

.btn {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: $meal-primary;
  color: #fff;
  font-size: 26rpx;
  font-weight: 600;
}
</style>
