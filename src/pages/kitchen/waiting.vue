<script setup lang="ts">
import { onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { ref } from "vue";
import { acceptOrder, kitchenOrders } from "@/api/order";
import TabBar from "@/components/TabBar.vue";
import { useUserStore } from "@/store/user";
import { useOrderNotifierLifecycle } from "@/utils/notify";
import { ORDER_STATUS, type Order } from "@/types";

const userStore = useUserStore();
useOrderNotifierLifecycle();

const orders = ref<Order[]>([]);
const loading = ref(false);
const acting = ref(0);

onShow(async () => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  // 进了工作台，底部导航就该是厨师那一套
  userStore.setViewMode("kitchen");
  if (!userStore.user) {
    try {
      await userStore.fetchInfo();
    } catch (e) {
      return;
    }
  }
  loadOrders();
});

const refreshing = ref(false);

/** 下拉刷新：重新拉取待接单列表 */
async function onRefresh() {
  refreshing.value = true;
  try {
    await loadOrders();
  } finally {
    refreshing.value = false;
  }
}

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
  <view class="app-fixed">
    <view class="header">
      <text class="header__title">待接单 · {{ orders.length }} 单</text>
      <text class="header__sub">{{ userStore.nickName }}，今天辛苦了</text>
    </view>

    <scroll-view
      class="app-fixed__scroll kitchen-scroll"
      :scroll-y="true"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <view v-for="order in orders" :key="order.orderId" class="card order">
        <view class="row-between">
          <text class="order__who">{{ order.userName || "家人" }} 点的单</text>
          <text class="timer">{{ waitText(order) }}</text>
        </view>

        <view v-for="item in order.items || []" :key="item.itemId" class="item">
          <view class="item__cover">{{ item.dishName }}</view>
          <view class="item__main">
            <text class="item__name">{{ item.dishName }} × {{ item.count }}</text>
            <text v-if="item.remark" class="item__remark">备注：{{ item.remark }}</text>
          </view>
        </view>

        <view class="note">整体备注：{{ order.orderRemark || "无" }}</view>

        <view class="order__actions">
          <view class="btn btn--line" @click="loadOrders">暂不接</view>
          <view class="btn" @click="doAccept(order)">接 单</view>
        </view>
      </view>

      <view v-if="loading && !orders.length" class="skeleton-grid">
        <view v-for="n in 3" :key="n" class="skeleton-card">
          <view class="skeleton-card__cover shimmer"></view>
          <view class="skeleton-card__line shimmer"></view>
          <view class="skeleton-card__line skeleton-card__line--w40 shimmer"></view>
        </view>
      </view>
      <view v-else-if="!orders.length" class="empty">暂时没有待接单的订单</view>
    </scroll-view>

    <TabBar active="kitchen-waiting" />
  </view>
</template>

<style lang="scss" scoped>
/* 顶部工作台标题：玻璃条（自定义导航栏，App 端给状态栏留高度） */
.header {
  flex: 0 0 auto;
  padding: calc(60rpx + var(--status-bar-height)) 28rpx 32rpx;
  border-radius: 0 0 36rpx 36rpx;
  border-bottom: 1rpx solid $lg-border;
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur($lg-blur) saturate($lg-sat);
  -webkit-backdrop-filter: blur($lg-blur) saturate($lg-sat);
}

.header__title {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: $lg-ink;
}

.header__sub {
  display: block;
  font-size: 24rpx;
  color: $lg-ink-2;
  margin-top: 8rpx;
}

.kitchen-scroll {
  padding: 24rpx 24rpx 200rpx;
}

.order__who {
  font-size: 28rpx;
  font-weight: 700;
  color: $lg-ink;
}

.timer {
  font-size: 22rpx;
  color: $meal-warning;
  background-color: #fff4e5;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
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
  background: linear-gradient(135deg, $lg-accent-2, $lg-accent);
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
  color: $lg-ink;
}

/* 菜品备注：与制作中页一致的醒目样式 */
.item__remark {
  display: inline-block;
  align-self: flex-start;
  font-size: 22rpx;
  color: $lg-accent;
  background-color: $lg-accent-soft;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
}

.note {
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  background-color: $lg-accent-soft;
  color: $lg-accent;
  font-size: 24rpx;
  font-weight: 600;
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
  color: #fff;
  font-size: 26rpx;
  font-weight: 700;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 16rpx 36rpx $lg-accent-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.btn--line {
  flex: 1;
  background: rgba(255, 255, 255, 0.6);
  border: 1rpx solid $lg-line;
  color: $lg-ink-2;
  font-weight: 400;
  box-shadow: none;
}

/* 骨架屏：半透明占位，贴合玻璃风格 */
.skeleton-grid {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.skeleton-card {
  background: rgba(255, 255, 255, 0.5);
  border-radius: 24rpx;
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.skeleton-card__cover {
  width: 100%;
  height: 80rpx;
  border-radius: 16rpx;
}

.skeleton-card__line {
  height: 22rpx;
  border-radius: 8rpx;
}

.skeleton-card__line--w40 {
  width: 40%;
}

.shimmer {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.45) 25%, rgba(255, 255, 255, 0.15) 37%, rgba(255, 255, 255, 0.45) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
