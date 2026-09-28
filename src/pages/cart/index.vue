<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import AppDialog from "@/components/AppDialog.vue";
import TabBar from "@/components/TabBar.vue";
import { confirm } from "@/composables/useDialog";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";
import type { CartLine } from "@/store/cart";

const ORDER_REMARK_KEY = "meal-order-remark";

/** 备注默认快捷标签池（样式不变，每次打开按随机顺序展示） */
const REMARK_TAGS = [
  "不要香菜",
  "不要葱蒜",
  "不辣",
  "微辣",
  "中辣",
  "重辣",
  "超级辣",
  "变态辣",
  "少油",
  "少盐",
  "不要糖",
  "多放饭",
  "不要姜",
  "趁热吃",
  "常温",
];

/** 当前展示的标签顺序（每次打开备注编辑器随机打乱） */
const remarkTags = ref<string[]>([]);

/** Fisher–Yates 洗牌，返回新数组，不改动原数组 */
function shuffle<T>(arr: T[]): T[] {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

const cartStore = useCartStore();
const userStore = useUserStore();

const orderRemark = ref("");
const editingId = ref<number | null>(null);
const draftRemark = ref("");

onShow(() => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  userStore.setViewMode("eater");
  cartStore.restore();
  const saved = uni.getStorageSync(ORDER_REMARK_KEY);
  orderRemark.value = typeof saved === "string" ? saved : "";
});

function changeCount(line: CartLine, delta: number) {
  const next = line.count + delta;
  if (next <= 0) {
    confirm(`是否去掉「${line.dishName}」菜品？`, "移除菜品").then((ok) => {
      if (ok) {
        cartStore.updateCount(line.dishId, 0);
        if (editingId.value === line.dishId) {
          editingId.value = null;
        }
      }
    });
    return;
  }
  cartStore.updateCount(line.dishId, next);
}

function openRemark(line: CartLine) {
  editingId.value = line.dishId;
  draftRemark.value = line.remark || "";
  remarkTags.value = shuffle(REMARK_TAGS);
}

function remarkActive(tag: string): boolean {
  return draftRemark.value
    .split(/[、,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(tag);
}

function toggleTag(tag: string) {
  const parts = draftRemark.value
    ? draftRemark.value.split(/[、,]/).map((s) => s.trim()).filter(Boolean)
    : [];
  const idx = parts.indexOf(tag);
  if (idx >= 0) {
    parts.splice(idx, 1);
  } else {
    parts.push(tag);
  }
  draftRemark.value = parts.join("、");
}

function saveRemark(line: CartLine) {
  cartStore.updateRemark(line.dishId, draftRemark.value.trim());
  editingId.value = null;
}

function removeLine(dishId: number) {
  confirm("确定要从购物车移除这道菜吗？", "移除菜品").then((ok) => {
    if (ok) {
      cartStore.remove(dishId);
    }
  });
}

function clearAll() {
  if (cartStore.isEmpty) {
    return;
  }
  confirm("确定清空购物车吗？", "清空购物车").then((ok) => {
    if (ok) {
      cartStore.clear();
    }
  });
}

function saveOrderRemark() {
  uni.setStorageSync(ORDER_REMARK_KEY, orderRemark.value);
}

function goConfirm() {
  if (cartStore.isEmpty) {
    uni.showToast({ title: "购物车是空的", icon: "none" });
    return;
  }
  // 备注编辑器还开着就去下单：先把草稿存进该菜，避免没点「保存」导致备注丢失
  if (editingId.value !== null) {
    const editing = cartStore.lines.find((line) => line.dishId === editingId.value);
    if (editing) {
      saveRemark(editing);
    } else {
      editingId.value = null;
    }
  }
  saveOrderRemark();
  uni.navigateTo({ url: "/pages/order/confirm" });
}
</script>

<template>
  <view class="app-fixed">
    <view class="app-fixed__head">
      <view class="row-between head">
        <text class="section-title">购物车</text>
        <text v-if="!cartStore.isEmpty" class="head__clear" @click="clearAll">清空</text>
      </view>
    </view>

    <view class="app-fixed__scroll cart-scroll">
      <template v-if="!cartStore.isEmpty">
        <view v-for="line in cartStore.lines" :key="line.dishId" class="card line">
          <image v-if="line.dishCover" class="line__cover" :src="line.dishCover" mode="aspectFill" />
          <view v-else class="line__cover line__cover--ph">{{ line.dishName }}</view>
          <view class="line__body">
            <view class="row-between">
              <text class="line__name">{{ line.dishName }}</text>
              <text class="line__del" @click="removeLine(line.dishId)">✕</text>
            </view>
            <view class="line__remark" @click="openRemark(line)">
              {{ line.remark || "加备注" }}
            </view>

            <view v-if="editingId === line.dishId" class="remark-editor">
              <view class="remark-editor__tags">
                <text
                  v-for="t in remarkTags"
                  :key="t"
                  class="remark-tag"
                  :class="{ 'remark-tag--on': remarkActive(t) }"
                  @click="toggleTag(t)"
                >
                  {{ t }}
                </text>
              </view>
              <input
                v-model="draftRemark"
                class="remark-editor__input"
                placeholder="其他备注，如：少放盐"
                placeholder-class="ph"
              />
              <view class="remark-editor__btns">
                <text class="remark-editor__btn remark-editor__btn--line" @click="editingId = null">取消</text>
                <text class="remark-editor__btn" @click="saveRemark(line)">保存</text>
              </view>
            </view>

            <view class="row-between">
              <view class="stepper">
                <text class="stepper__btn" @click="changeCount(line, -1)">−</text>
                <text class="stepper__count">{{ line.count }}</text>
                <text class="stepper__btn stepper__btn--plus" @click="changeCount(line, 1)">＋</text>
              </view>
              <text class="tiny">共 {{ line.count }} 份</text>
            </view>
          </view>
        </view>

        <view class="card">
          <text class="section-title">整体备注</text>
          <input
            v-model="orderRemark"
            class="remark-input"
            placeholder="口味 / 忌口，如：爸爸不吃香菜"
            placeholder-class="ph"
            @blur="saveOrderRemark"
          />
        </view>
      </template>

      <view v-else class="empty">购物车还是空的，去点餐区看看</view>
    </view>

    <view v-if="!cartStore.isEmpty" class="bottombar">
      <view class="row-between bottombar__sum">
        <text class="muted">合计 <text class="sum">{{ cartStore.totalCount }}</text> 份菜</text>
        <text class="tiny">共 {{ cartStore.dishKinds }} 道</text>
      </view>
      <view class="bottombar__btn" @click="goConfirm">去下单</view>
    </view>

    <TabBar active="cart" />
  </view>

  <AppDialog />
</template>

<style lang="scss" scoped>
.head {
  margin-bottom: 20rpx;
}

/* 「清空」：负外边距抵消内边距，视觉位置不变，点击区域放大到 68rpx 高 */
.head__clear {
  display: inline-block;
  padding: 18rpx 24rpx;
  margin: -18rpx -24rpx -18rpx 0;
  line-height: 32rpx;
  font-size: 24rpx;
  color: $meal-text-2;
}

.line {
  display: flex;
  gap: 20rpx;
}

.line__cover {
  width: 130rpx;
  height: 130rpx;
  border-radius: 20rpx;
  flex: 0 0 130rpx;
}

.line__cover--ph {
  background: linear-gradient(135deg, #ffc49b, #ff7a45);
  color: #fff;
  font-size: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.line__body {
  flex: 1;
  min-width: 0;
}

.line__name {
  font-size: 28rpx;
  font-weight: 600;
  color: $meal-text;
}

/* 删除 ✕：点击区域 68rpx 见方，负外边距让图标仍贴在卡片右上角 */
.line__del {
  display: inline-block;
  flex: 0 0 auto;
  width: 68rpx;
  height: 68rpx;
  line-height: 68rpx;
  text-align: center;
  margin: -18rpx -18rpx -18rpx 0;
  color: $meal-text-2;
  font-size: 26rpx;
}

.line__remark {
  display: block;
  font-size: 22rpx;
  color: $meal-text-2;
  margin: 10rpx 0 16rpx;
}

/* 备注编辑器（快捷标签 + 自定义输入） */
.remark-editor {
  background-color: $meal-primary-soft;
  border-radius: 16rpx;
  padding: 16rpx;
  margin-bottom: 16rpx;
}

.remark-editor__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 14rpx;
}

.remark-tag {
  font-size: 22rpx;
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  background-color: #fff;
  color: $meal-text-2;
  border: 1rpx solid $meal-line;
}

.remark-tag--on {
  background-color: $meal-primary;
  border-color: $meal-primary;
  color: #fff;
  font-weight: 600;
}

.remark-editor__input {
  font-size: 24rpx;
  color: $meal-text;
  background-color: #fff;
  border-radius: 12rpx;
  padding: 14rpx 16rpx;
}

.remark-editor__btns {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin-top: 14rpx;
}

.remark-editor__btn {
  font-size: 24rpx;
  padding: 10rpx 28rpx;
  border-radius: 999rpx;
  background-color: $meal-primary;
  color: #fff;
  font-weight: 600;
}

.remark-editor__btn--line {
  background-color: transparent;
  border: 1rpx solid $meal-line;
  color: $meal-text-2;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.stepper__btn {
  width: 48rpx;
  height: 48rpx;
  line-height: 48rpx;
  text-align: center;
  border-radius: 50%;
  border: 1rpx solid $meal-line;
  color: $meal-text-2;
  font-size: 28rpx;
}

.stepper__btn--plus {
  background-color: $meal-primary;
  border-color: $meal-primary;
  color: #fff;
}

.stepper__count {
  font-size: 28rpx;
  font-weight: 600;
  min-width: 36rpx;
  text-align: center;
}

.remark-input {
  font-size: 26rpx;
  color: $meal-text;
}

.ph {
  color: $meal-text-2;
}

.bottombar {
  position: fixed;
  left: 0;
  right: 0;
  /* 固定在 TabBar 上方，TabBar 自身会加底部安全区高度，这里同步让位 */
  bottom: calc(108rpx + env(safe-area-inset-bottom));
  padding: 20rpx 24rpx;
  background-color: $meal-card;
  border-top: 1rpx solid $meal-line;
}

.bottombar__sum {
  margin-bottom: 16rpx;
}

.sum {
  font-size: 32rpx;
  font-weight: 700;
  color: $meal-text;
}

.bottombar__btn {
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: $meal-primary;
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
}

/* 购物车滚动区底部给结算条 + TabBar 让位 */
.cart-scroll {
  padding: 24rpx 24rpx calc(260rpx + env(safe-area-inset-bottom));
}
</style>
