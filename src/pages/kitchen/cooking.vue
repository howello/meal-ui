<script setup lang="ts">
import { onShow, onUnload } from "@dcloudio/uni-app";
import { computed, reactive, ref } from "vue";
import { listDish } from "@/api/dish";
import { cancelCookingOrder, editCookingOrder, finishOrder, kitchenOrders } from "@/api/order";
import AppDialog from "@/components/AppDialog.vue";
import CachedImage from "@/components/CachedImage.vue";
import KitchenMenuShortcut from "@/components/KitchenMenuShortcut.vue";
import TabBar from "@/components/TabBar.vue";
import { confirm } from "@/composables/useDialog";
import { useUserStore } from "@/store/user";
import { createOrderRefreshThrottle, useOrderNotifierLifecycle } from "@/utils/notify";
import { ORDER_STATUS, type Dish, type Order, type OrderItem, type OrderNotification } from "@/types";

const COOK_DONE_KEY = "meal-cook-done";

const userStore = useUserStore();

const orders = ref<Order[]>([]);
const loading = ref(false);
const refreshing = ref(false);
/** 勾选绑定当前菜品和份数；数字兼容之前只存 itemId 的记录。 */
const doneMap = reactive<Record<number, (string | number)[]>>({});
let loadSequence = 0;

interface DraftItem extends OrderItem {
  itemId: number;
  dishId: number;
  removed: boolean;
}

const editingOrder = ref<Order | null>(null);
const draft = ref<DraftItem[]>([]);
const remainingItems = computed(() => draft.value.filter((item) => !item.removed));
const activeMutation = ref<number | null>(null);
const replacementItemId = ref<number | null>(null);
const dishOptions = ref<Dish[]>([]);
const dishLoading = ref(false);
const dishSearchFailed = ref(false);
const dishKeyword = ref("");
const visibleDishes = computed(() => {
  const keyword = dishKeyword.value.trim().toLowerCase();
  const currentDishId = draft.value.find((item) => item.itemId === replacementItemId.value)?.dishId;
  return dishOptions.value
    .filter((dish) => dish.dishId !== currentDishId && dish.name.toLowerCase().includes(keyword))
    .slice(0, 30);
});

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
  const sequence = ++loadSequence;
  loading.value = true;
  try {
    const res = await kitchenOrders({ status: ORDER_STATUS.COOKING, pageSize: 50 });
    if (sequence === loadSequence) {
      orders.value = res.rows;
      res.rows.forEach(refreshDoneMarks);
      if (editingOrder.value && !res.rows.some((order) => order.orderId === editingOrder.value?.orderId)) {
        closeEdit();
      }
    }
  } catch (e) {
    if (sequence === loadSequence) {
      orders.value = [];
    }
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
    }
  }
}

/** 制作状态变化通知到达后合并刷新制作中列表 */
const refreshOrders = createOrderRefreshThrottle(loadOrders);

/** 只响应可能改变制作中列表的订单流转通知 */
function handleNotifications(notifications: OrderNotification[]) {
  const affectsCooking = notifications.some((item) =>
    item.type === "ORDER_ACCEPTED" || item.type === "ORDER_COMPLETED" || item.type === "ORDER_RATED",
  );
  if (affectsCooking) {
    refreshOrders.trigger();
  }
}

useOrderNotifierLifecycle({ onNotifications: handleNotifications });
onUnload(refreshOrders.dispose);

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
  const marks = doneMap[order.orderId] || [];
  return !!item.itemId && (marks.includes(doneKey(item)) || marks.includes(item.itemId));
}

/** 菜品或份数变化后，旧勾选不再匹配。 */
function doneKey(item: OrderItem): string {
  return `${item.itemId}:${item.dishId}:${item.count}`;
}

/** 升级旧勾选并清理当前订单中已经换菜、改份数或取消的勾选。 */
function refreshDoneMarks(order: Order) {
  const marks = doneMap[order.orderId];
  if (!marks?.length) {
    return;
  }
  const current = (order.items || []).filter((item) => isDone(order, item)).map(doneKey);
  if (current.length !== marks.length || current.some((mark, index) => mark !== marks[index])) {
    doneMap[order.orderId] = current;
    persistDoneMap();
  }
}

function doneCount(order: Order): number {
  return (order.items || []).filter((item) => isDone(order, item)).length;
}

function totalCount(order: Order): number {
  return (order.items || []).length;
}

async function toggleDone(order: Order, item: OrderItem) {
  if (!item.itemId || activeMutation.value !== null || editingOrder.value) {
    return;
  }
  const marks = (doneMap[order.orderId] || []).filter((mark) => mark !== item.itemId && mark !== doneKey(item));
  if (!isDone(order, item)) {
    marks.push(doneKey(item));
  }
  doneMap[order.orderId] = marks;
  persistDoneMap();

  if (totalCount(order) > 0 && doneCount(order) === totalCount(order)) {
    await completeOrder(order);
  }
}

/** 出餐使用当前列表的订单版本，避免按过期菜品误出餐。 */
async function completeOrder(order: Order) {
  if (activeMutation.value !== null) {
    return;
  }
  activeMutation.value = order.orderId;
  try {
    await finishOrder(order.orderId, order.dataVersion);
    delete doneMap[order.orderId];
    persistDoneMap();
    uni.showToast({ title: "整单完成，已通知点餐人", icon: "none" });
  } catch {
    // 请求层已提示，保留勾选以便再次出餐。
  } finally {
    await loadOrders();
    activeMutation.value = null;
  }
}

/** 在当前订单卡片内编辑，保存前只修改草稿。 */
function startEdit(order: Order) {
  if (activeMutation.value !== null) {
    return;
  }
  const items = order.items || [];
  if (order.dataVersion == null || !items.length || items.some((item) => !item.itemId || !item.dishId)) {
    uni.showToast({ title: "订单明细不可用，请刷新后重试", icon: "none" });
    return;
  }
  draft.value = items.map((item) => ({ ...item, itemId: item.itemId!, dishId: item.dishId!, removed: false }));
  replacementItemId.value = null;
  editingOrder.value = order;
}

/** 退出编辑并丢弃未保存的菜品草稿。 */
function closeEdit() {
  editingOrder.value = null;
  draft.value = [];
  replacementItemId.value = null;
}

/** 换菜使用现有家庭菜单。 */
async function openReplacement(item: DraftItem) {
  replacementItemId.value = item.itemId;
  dishKeyword.value = "";
  dishSearchFailed.value = false;
  dishLoading.value = true;
  dishOptions.value = [];
  try {
    const { rows } = await listDish({});
    dishOptions.value = rows;
  } catch {
    dishSearchFailed.value = true;
  } finally {
    dishLoading.value = false;
  }
}

/** 将所选菜品写入草稿，保留当前份数。 */
function pickReplacement(item: DraftItem, dish: Dish) {
  item.dishId = dish.dishId;
  item.dishName = dish.name;
  item.dishCover = dish.cover;
  replacementItemId.value = null;
}

/** 一次提交本单所有菜品变更。 */
async function saveEdit() {
  const order = editingOrder.value;
  if (!order || order.dataVersion == null || activeMutation.value !== null) {
    return;
  }
  if (!remainingItems.value.length) {
    await confirmCancel(order);
    return;
  }
  const items = remainingItems.value.map(({ itemId, dishId, count }) => ({ itemId, dishId, count: Number(count) }));
  if (items.some(({ count }) => !Number.isInteger(count) || count < 1 || count > 99)) {
    uni.showToast({ title: "份数须为 1 至 99 的整数", icon: "none" });
    return;
  }
  activeMutation.value = order.orderId;
  try {
    const updated = await editCookingOrder(order.orderId, order.dataVersion, items);
    refreshDoneMarks(updated);
    closeEdit();
    uni.showToast({ title: updated.dataVersion === order.dataVersion ? "菜品没有变化" : "菜品已更新", icon: "none" });
    await loadOrders();
  } catch {
    // 请求失败保留草稿，方便修正后重试。
    await loadOrders();
  } finally {
    activeMutation.value = null;
  }
}

/** 整单取消需要确认，取消最后一道菜也走同一个入口。 */
async function confirmCancel(order: Order) {
  if (order.dataVersion == null || activeMutation.value !== null) {
    return;
  }
  activeMutation.value = order.orderId;
  try {
    if (!await confirm("确认后，这张订单将取消，并通知点餐人。", "取消整张订单")) {
      return;
    }
    await cancelCookingOrder(order.orderId, order.dataVersion);
    delete doneMap[order.orderId];
    persistDoneMap();
    closeEdit();
    uni.showToast({ title: "订单已取消", icon: "none" });
    await loadOrders();
  } catch {
    // 请求层已提示。
    await loadOrders();
  } finally {
    activeMutation.value = null;
  }
}

function openDish(item: OrderItem) {
  if (!item.dishId) {
    return;
  }
  uni.navigateTo({ url: `/pages/menu/detail?dishId=${item.dishId}&readonly=1` });
}

/** 进入该订单的备菜清单页：汇总用料、可勾选已买完 */
function goPrep(order: Order) {
  uni.navigateTo({ url: `/pages/kitchen/prep?orderId=${order.orderId}` });
}

/** 已制作时长由后端计算返回，前端不自己计时 */
function cookText(order: Order): string {
  const minutes = order.cookMinutes ?? 0;
  return `已做 ${minutes} 分钟`;
}
</script>

<template>
  <view class="app-fixed" :class="themeRootClass">
    <view class="header">
      <view class="header__row">
        <text class="header__title">制作中 · {{ orders.length }} 单</text>
        <KitchenMenuShortcut />
      </view>
      <text class="header__sub">逐道菜点完成，全部备好自动出餐</text>
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
          <text class="order__who">{{ order.userName || "家人" }} 的订单</text>
          <text class="timer">{{ cookText(order) }}</text>
        </view>

        <template v-if="editingOrder?.orderId !== order.orderId">
          <view
            v-for="item in order.items || []"
            :key="item.itemId"
            class="item"
            :class="{ 'item--done': isDone(order, item) }"
            @click="openDish(item)"
          >
            <CachedImage v-if="item.dishCover" class="item__cover" :src="item.dishCover" mode="aspectFill" />
            <view v-else class="item__cover item__cover--ph">{{ item.dishName }}</view>
            <view class="item__main">
              <text class="item__name">{{ item.dishName }} × {{ item.count }}</text>
              <text v-if="item.remark" class="item__remark">备注：{{ item.remark }}</text>
            </view>
            <view
              class="item__done"
              :class="{ 'item__done--on': isDone(order, item) }"
              @click.stop="toggleDone(order, item)"
            >
              <text class="item__done-text">{{ isDone(order, item) ? "✓ 已完成" : "标记完成" }}</text>
            </view>
          </view>

          <view class="note">整体备注：{{ order.orderRemark || "无" }}</view>

          <view class="order__actions">
            <view class="order__progress">已备 {{ doneCount(order) }}/{{ totalCount(order) }}</view>
            <view class="prep-btn" @click="goPrep(order)">一键备菜</view>
            <button
              v-if="totalCount(order) > 0 && doneCount(order) === totalCount(order)"
              class="action-button action-button--primary"
              :disabled="activeMutation !== null || !!editingOrder"
              @click="completeOrder(order)"
            >确认出餐</button>
          </view>
          <view class="edit-actions">
            <button class="action-button" :disabled="activeMutation !== null || !!editingOrder" @click="startEdit(order)">
              编辑菜品
            </button>
            <button class="action-button action-button--danger" :disabled="activeMutation !== null || !!editingOrder"
              @click="confirmCancel(order)">取消订单</button>
          </view>
        </template>

        <view v-else class="order-editor">
          <view v-for="item in draft" :key="item.itemId" class="edit-item">
            <text class="item__name" :class="{ 'edit-item--removed': item.removed }">{{ item.dishName }}</text>
            <view v-if="!item.removed" class="edit-actions">
              <label class="quantity">
                <text>份数</text>
                <input v-model="item.count" type="number" maxlength="2" :disabled="activeMutation !== null" />
              </label>
              <button class="action-button" :disabled="activeMutation !== null"
                @click="replacementItemId === item.itemId ? replacementItemId = null : openReplacement(item)">
                {{ replacementItemId === item.itemId ? "收起" : "换菜" }}
              </button>
              <button class="action-button action-button--danger" :disabled="activeMutation !== null"
                @click="item.removed = true">取消这道菜</button>
            </view>
            <view v-else class="edit-actions">
              <text class="order__progress">待取消</text>
              <button class="action-button" :disabled="activeMutation !== null" @click="item.removed = false">恢复</button>
            </view>
            <view v-if="!item.removed && replacementItemId === item.itemId" class="dish-picker">
              <input v-model="dishKeyword" class="dish-search" placeholder="搜索替换菜品" :disabled="activeMutation !== null" />
              <text v-if="dishLoading" class="order__progress">加载中…</text>
              <button v-else-if="dishSearchFailed" class="action-button" @click="openReplacement(item)">重新加载菜品</button>
              <scroll-view v-else-if="visibleDishes.length" scroll-y class="dish-options">
                <button v-for="dish in visibleDishes" :key="dish.dishId" class="dish-option"
                  :disabled="activeMutation !== null" @click="pickReplacement(item, dish)">{{ dish.name }}</button>
              </scroll-view>
              <text v-else class="order__progress">没有可替换的菜品</text>
            </view>
          </view>
          <text v-if="editingOrder.dataVersion !== order.dataVersion" class="order__progress">
            订单已更新，请退出编辑后重新打开。
          </text>
          <view class="edit-actions">
            <button class="action-button" :disabled="activeMutation !== null" @click="closeEdit">退出编辑</button>
            <button class="action-button" :class="remainingItems.length ? 'action-button--primary' : 'action-button--danger'"
              :disabled="activeMutation !== null || editingOrder.dataVersion !== order.dataVersion" @click="saveEdit">
              {{ remainingItems.length ? "保存变更" : "取消整单" }}
            </button>
          </view>
        </view>
      </view>

      <view v-if="!orders.length" class="empty">{{ loading ? "加载中…" : "暂时没有制作中的订单" }}</view>
    </scroll-view>

    <TabBar active="kitchen-cooking" />
    <AppDialog />
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

/* 已完成的菜只弱化图片与文字，操作按钮保持清晰可点 */
.item--done .item__cover,
.item--done .item__main {
  opacity: 0.5;
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

/* 单道菜的完成按钮：未完成是描边胶囊，完成后变实心绿并带对勾 */
.item__done {
  flex: 0 0 auto;
  min-width: 128rpx;
  height: 60rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  border: 2rpx solid $lg-accent-border;
  background: $lg-fill-2;
}

.item__done-text {
  font-size: 22rpx;
  font-weight: 600;
  color: $lg-accent;
  white-space: nowrap;
}

.item__done--on {
  background: $meal-success;
  border-color: $meal-success;
  box-shadow: 0 10rpx 22rpx rgba(0, 0, 0, 0.12);
}

.item__done--on .item__done-text {
  color: #fff;
}

.order__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-top: 20rpx;
}

.order__progress {
  font-size: 22rpx;
  color: $lg-ink-2;
}

/* 一键备菜：次级按钮（玻璃底 + 主题色描边），与整单完成的主操作区分 */
.prep-btn {
  flex: 0 0 auto;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 32rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: $lg-accent;
  background: $lg-fill-2;
  border: 1rpx solid $lg-accent-border;
}

.order-editor,
.edit-item,
.dish-picker {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.order-editor {
  margin-top: 20rpx;
}

.edit-item {
  padding: 16rpx 0;
  border-bottom: 1rpx solid $lg-border;
}

.edit-item--removed {
  text-decoration: line-through;
  color: $lg-ink-2;
}

.edit-actions,
.quantity {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}

.order > .edit-actions {
  margin-top: 16rpx;
}

.quantity {
  font-size: 24rpx;
  color: $lg-ink;
}

.quantity input,
.dish-search {
  height: 64rpx;
  padding: 0 16rpx;
  border: 1rpx solid $lg-border;
  border-radius: 14rpx;
  color: $lg-ink;
  background: $lg-fill-2;
  font-size: 26rpx;
}

.quantity input {
  width: 76rpx;
  text-align: center;
}

.action-button,
.dish-option {
  margin: 0;
  padding: 0 20rpx;
  min-height: 64rpx;
  line-height: 62rpx;
  border: 1rpx solid $lg-accent-border;
  border-radius: 18rpx;
  background: $lg-fill-2;
  color: $lg-accent;
  font-size: 24rpx;
}

.action-button::after,
.dish-option::after {
  border: 0;
}

.action-button--primary {
  background: $lg-accent;
  color: #fff;
}

.action-button--danger {
  color: $meal-danger;
  border-color: $meal-danger;
}

.dish-options {
  max-height: 300rpx;
}

.dish-option {
  width: 100%;
  text-align: left;
}
</style>
