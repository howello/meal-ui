<script setup lang="ts">
import { onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { reactive, ref } from "vue";
import { finishOrder, kitchenOrders } from "@/api/order";
import TabBar from "@/components/TabBar.vue";
import { useUserStore } from "@/store/user";
import { useOrderNotifierLifecycle } from "@/utils/notify";
import { ORDER_STATUS, type Order, type OrderItem } from "@/types";

const COOK_DONE_KEY = "meal-cook-done";

const userStore = useUserStore();
useOrderNotifierLifecycle();

const orders = ref<Order[]>([]);
const loading = ref(false);
const refreshing = ref(false);
/** orderId -> 已标记完成的 itemId 列表（仅存本地） */
const doneMap = reactive<Record<number, number[]>>({});

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
  loadDoneMap();
  loadOrders();
});

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
    const res = await kitchenOrders({ status: ORDER_STATUS.COOKING, pageSize: 50 });
    orders.value = res.rows;
  } catch (e) {
    orders.value = [];
  } finally {
    loading.value = false;
  }
}

function loadDoneMap() {
  const raw = uni.getStorageSync(COOK_DONE_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    Object.assign(doneMap, parsed && typeof parsed === "object" ? parsed : {});
  } catch (e) {
    // 损坏则忽略，当作尚未标记
  }
}

function persistDoneMap() {
  uni.setStorageSync(COOK_DONE_KEY, JSON.stringify(doneMap));
}

function isDone(order: Order, item: OrderItem): boolean {
  const list = doneMap[order.orderId];
  return !!list && !!item.itemId && list.includes(item.itemId);
}

function doneCount(order: Order): number {
  const list = doneMap[order.orderId] || [];
  const ids = new Set((order.items || []).map((i) => i.itemId).filter(Boolean) as number[]);
  return list.filter((id) => ids.has(id)).length;
}

function totalCount(order: Order): number {
  return (order.items || []).length;
}

async function toggleDone(order: Order, item: OrderItem) {
  if (!item.itemId) {
    return;
  }
  const list = doneMap[order.orderId] ? [...doneMap[order.orderId]] : [];
  const idx = list.indexOf(item.itemId);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(item.itemId);
  }
  doneMap[order.orderId] = list;
  persistDoneMap();

  // 整单所有菜品都标记完成，自动提交完成（仅本地判断，不逐菜调接口）
  if (totalCount(order) > 0 && doneCount(order) === totalCount(order)) {
    try {
      await finishOrder(order.orderId);
      uni.showToast({ title: "整单完成，已通知点餐人", icon: "none" });
      delete doneMap[order.orderId];
      persistDoneMap();
      loadOrders();
    } catch (e) {
      // 提交失败不影响本地标记，提示已由请求层给出
    }
  }
}

function openDish(item: OrderItem) {
  if (!item.dishId) {
    return;
  }
  uni.navigateTo({ url: `/pages/menu/detail?dishId=${item.dishId}&readonly=1` });
}

/** 已制作时长由后端计算返回，前端不自己计时 */
function cookText(order: Order): string {
  const minutes = order.cookMinutes ?? 0;
  return `已做 ${minutes} 分钟`;
}
</script>

<template>
  <view class="app-fixed">
    <view class="header">
      <text class="header__title">制作中 · {{ orders.length }} 单</text>
      <text class="header__sub">逐道菜点完成，全部备好自动出餐</text>
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
          <text class="order__who">{{ order.userName || "家人" }} 的订单</text>
          <text class="timer">{{ cookText(order) }}</text>
        </view>

        <view
          v-for="item in order.items || []"
          :key="item.itemId"
          class="item"
          :class="{ 'item--done': isDone(order, item) }"
          @click="openDish(item)"
        >
          <view class="item__cover">{{ item.dishName }}</view>
          <view class="item__main">
            <text class="item__name">{{ item.dishName }} × {{ item.count }}</text>
            <text v-if="item.remark" class="item__remark">备注：{{ item.remark }}</text>
          </view>
          <view
            class="item__done"
            :class="{ 'item__done--on': isDone(order, item) }"
            @click.stop="toggleDone(order, item)"
          >
            <text v-if="isDone(order, item)">✓</text>
          </view>
        </view>

        <view class="note">整体备注：{{ order.orderRemark || "无" }}</view>

        <view class="order__progress">已备 {{ doneCount(order) }}/{{ totalCount(order) }}</view>
      </view>

      <view v-if="!orders.length" class="empty">{{ loading ? "加载中…" : "暂时没有制作中的订单" }}</view>
    </scroll-view>

    <TabBar active="kitchen-cooking" />
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

/* 左侧暖橙竖条标识「制作中」 */
.order {
  border-left: 6rpx solid $lg-accent;
}

.order__who {
  font-size: 28rpx;
  font-weight: 700;
  color: $lg-ink;
}

.timer {
  font-size: 22rpx;
  color: $lg-accent;
  background-color: $lg-accent-soft;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  font-weight: 600;
}

.item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 18rpx;
  padding: 8rpx;
  border-radius: 16rpx;
}

.item--done {
  opacity: 0.55;
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

/* 菜品备注：主题浅色底 + 主题色文字，从普通 tiny 提亮 */
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

/* 单道菜的完成勾选 */
.item__done {
  flex: 0 0 auto;
  width: 48rpx;
  height: 48rpx;
  line-height: 48rpx;
  text-align: center;
  border-radius: 50%;
  border: 1rpx solid $lg-line;
  color: #fff;
  font-size: 28rpx;
}

.item__done--on {
  background-color: $meal-success;
  border-color: $meal-success;
}

.order__progress {
  margin-top: 20rpx;
  font-size: 22rpx;
  color: $lg-ink-2;
  text-align: right;
}
</style>
