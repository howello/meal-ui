<script setup lang="ts">
import { onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { ref } from "vue";
import { acceptOrder, kitchenOrders, skipKitchenOrder } from "@/api/order";
import CachedImage from "@/components/CachedImage.vue";
import KitchenMenuShortcut from "@/components/KitchenMenuShortcut.vue";
import TabBar from "@/components/TabBar.vue";
import { useUserStore } from "@/store/user";
import { useOrderNotifierLifecycle } from "@/utils/notify";
import { ORDER_STATUS, type Order } from "@/types";

const userStore = useUserStore();
useOrderNotifierLifecycle();

const orders = ref<Order[]>([]);
const loading = ref(false);
/** 正在接单的订单ID；与暂不接分开，避免两个按钮互相显示加载态 */
const acceptingId = ref(0);
/** 正在暂不接的订单ID */
const skippingId = ref(0);

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
  } else {
    // 已从本地缓存恢复身份：先渲染，再后台刷新一次，token 失效由请求层踢回登录
    userStore.refreshInfo();
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

/**
 * 接单：先锁按钮并即时移除本单，再以服务端结果校准列表。
 *
 * <p>接口是原子状态流转，两个厨师同时抢时只有一个成功；
 * 失败时恢复该单并让请求层提示具体原因，避免用户误以为按钮没反应。</p>
 */
async function doAccept(order: Order) {
  if (acceptingId.value || skippingId.value) {
    return;
  }
  acceptingId.value = order.orderId;
  const snapshot = [...orders.value];
  orders.value = orders.value.filter((item) => item.orderId !== order.orderId);
  try {
    await acceptOrder(order.orderId);
    uni.showToast({ title: "已接单，去制作中查看", icon: "none" });
    void loadOrders();
  } catch (e) {
    orders.value = snapshot;
  } finally {
    acceptingId.value = 0;
  }
}

/**
 * 暂不接：持久记录到当前厨师的跳过集合，再即时从列表移除。
 *
 * 该记录不影响其他厨师；App 重启后由服务端继续过滤。失败时恢复卡片并保留请求层提示。
 *
 * @param order 要跳过的订单
 */
async function deferOrder(order: Order) {
  if (acceptingId.value || skippingId.value) {
    return;
  }
  skippingId.value = order.orderId;
  const snapshot = [...orders.value];
  orders.value = orders.value.filter((item) => item.orderId !== order.orderId);
  try {
    await skipKitchenOrder(order.orderId);
    uni.showToast({ title: "已从我的待接单中隐藏", icon: "none" });
  } catch (e) {
    orders.value = snapshot;
  } finally {
    skippingId.value = 0;
  }
}

/** 等待时长由后端计算返回，前端不自己计时 */
function waitText(order: Order): string {
  const minutes = order.waitMinutes ?? 0;
  return `等待 ${minutes} 分钟`;
}
</script>

<template>
  <view class="app-fixed" :class="themeRootClass">
    <view class="header">
      <view class="header__row">
        <text class="header__title">待接单 · {{ orders.length }} 单</text>
        <KitchenMenuShortcut />
      </view>
      <text class="header__sub">{{ userStore.nickName }}，今天辛苦了</text>
    </view>

    <scroll-view
      class="app-fixed__scroll kitchen-scroll"
      :scroll-y="true"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      refresher-background="transparent"
      @refresherrefresh="onRefresh"
    >
      <view v-for="order in orders" :key="order.orderId" class="card order">
        <view class="row-between">
          <text class="order__who">{{ order.userName || "家人" }} 点的单</text>
          <text class="timer">{{ waitText(order) }}</text>
        </view>

        <view v-for="item in order.items || []" :key="item.itemId" class="item">
          <CachedImage v-if="item.dishCover" class="item__cover" :src="item.dishCover" mode="aspectFill" />
          <view v-else class="item__cover item__cover--ph">{{ item.dishName }}</view>
          <view class="item__main">
            <text class="item__name">{{ item.dishName }} × {{ item.count }}</text>
            <text v-if="item.remark" class="item__remark">备注：{{ item.remark }}</text>
          </view>
        </view>

        <view class="note">整体备注：{{ order.orderRemark || "无" }}</view>

        <view class="order__actions">
          <view
            class="btn btn--line"
            :class="{ 'btn--acting': skippingId === order.orderId }"
            @click="deferOrder(order)"
          >
            {{ skippingId === order.orderId ? "处理中…" : "暂不接" }}
          </view>
          <view class="btn" :class="{ 'btn--acting': acceptingId === order.orderId }" @click="doAccept(order)">
            {{ acceptingId === order.orderId ? "接单中…" : "接 单" }}
          </view>
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
  background: $lg-fill-bar;
  backdrop-filter: blur($lg-blur) saturate($lg-sat);
  -webkit-backdrop-filter: blur($lg-blur) saturate($lg-sat);
}

.header__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.header__title {
  flex: 1;
  min-width: 0;
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
  background-color: $lg-warn-soft;
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
  width: 190rpx;
  height: 190rpx;
  flex: 0 0 190rpx;
  border-radius: 24rpx;
  overflow: hidden;
}

/* 无封面时的渐变占位：沿用原有「色块 + 菜名」样式 */
.item__cover--ph {
  background: linear-gradient(135deg, $lg-accent-2, $lg-accent);
  color: #fff;
  font-size: 20rpx;
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

.btn--acting {
  opacity: 0.7;
  pointer-events: none;
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
  background: $lg-fill-2;
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
  background: $lg-fill-3;
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
  background: linear-gradient(90deg, $lg-shimmer-1 25%, $lg-shimmer-2 37%, $lg-shimmer-1 63%);
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
