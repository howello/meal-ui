<script setup lang="ts">
import { onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { ref } from "vue";
import AppDialog from "@/components/AppDialog.vue";
import GlassButton from "@/components/GlassButton.vue";
import GlassCard from "@/components/GlassCard.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import TabBar from "@/components/TabBar.vue";
import { confirm } from "@/composables/useDialog";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";
import { useOrderNotifierLifecycle } from "@/utils/notify";
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
useOrderNotifierLifecycle();

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
  <view class="app-fixed app-fixed--topnav" :class="themeRootClass">
    <GlassNavBar title="购物车">
      <template #right>
        <text v-if="!cartStore.isEmpty" class="nav-clear" @click="clearAll">清空</text>
      </template>
    </GlassNavBar>

    <view class="app-fixed__scroll cart-scroll">
      <template v-if="!cartStore.isEmpty">
        <GlassCard v-for="line in cartStore.lines" :key="line.dishId" class="line">
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
        </GlassCard>

        <GlassCard>
          <text class="section-title">整体备注</text>
          <input
            v-model="orderRemark"
            class="remark-input"
            placeholder="口味 / 忌口，如：爸爸不吃香菜"
            placeholder-class="ph"
            @blur="saveOrderRemark"
          />
        </GlassCard>
      </template>

      <view v-else class="empty">购物车还是空的，去点餐区看看</view>
    </view>

    <view v-if="!cartStore.isEmpty" class="bottombar glass glass--strong">
      <view class="row-between bottombar__sum">
        <text class="muted">合计 <text class="sum">{{ cartStore.totalCount }}</text> 份菜</text>
        <text class="tiny">共 {{ cartStore.dishKinds }} 道</text>
      </view>
      <GlassButton class="bottombar__btn" @click="goConfirm">去下单</GlassButton>
    </view>

    <TabBar active="cart" />
  </view>

  <AppDialog :class="themeRootClass" />
</template>

<style lang="scss" scoped>
/* 导航栏右侧「清空」：负外边距抵消内边距，视觉位置不变，点击区域放大到 68rpx 高 */
.nav-clear {
  display: inline-block;
  padding: 18rpx 24rpx;
  margin: -18rpx -24rpx -18rpx 0;
  line-height: 32rpx;
  font-size: 24rpx;
  color: $lg-ink-2;
}

/* 行卡片：玻璃底由 GlassCard 提供，这里只负责内部横向布局 */
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
  background: linear-gradient(135deg, $lg-accent-2, $lg-accent);
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
  font-weight: 700;
  color: $lg-ink;
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
  color: $lg-ink-3;
  font-size: 26rpx;
}

.line__remark {
  display: block;
  font-size: 22rpx;
  color: $lg-ink-2;
  margin: 10rpx 0 16rpx;
}

/* 备注编辑器（快捷标签 + 自定义输入）：弱玻璃内嵌区 */
.remark-editor {
  background: $lg-fill-3;
  border: 1px solid $lg-border;
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
  background: $lg-fill-2;
  color: $lg-ink-2;
  border: 1rpx solid $lg-border;
}

.remark-tag--on {
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  border-color: transparent;
  color: #fff;
  font-weight: 600;
}

.remark-editor__input {
  font-size: 24rpx;
  color: $lg-ink;
  background: $lg-fill-2;
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
  color: #fff;
  font-weight: 600;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 10rpx 22rpx $lg-accent-shadow;
}

.remark-editor__btn--line {
  background: transparent;
  border: 1rpx solid $lg-border;
  color: $lg-ink-2;
  box-shadow: none;
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
  border: 1rpx solid $lg-accent-border;
  color: $lg-accent;
  background: $lg-fill-2;
  font-size: 28rpx;
}

.stepper__btn--plus {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 10rpx 22rpx $lg-accent-shadow;
}

.stepper__count {
  font-size: 28rpx;
  font-weight: 700;
  min-width: 36rpx;
  text-align: center;
  color: $lg-ink;
}

.remark-input {
  font-size: 26rpx;
  color: $lg-ink;
}

.ph {
  color: $lg-ink-3;
}

/* 悬浮玻璃结算条：浮在 TabBar 之上 */
.bottombar {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: calc(140rpx + env(safe-area-inset-bottom));
  padding: 20rpx 24rpx;
  border-radius: 28rpx;
  z-index: 8;
}

.bottombar__sum {
  margin-bottom: 16rpx;
}

.sum {
  font-size: 32rpx;
  font-weight: 700;
  color: $lg-ink;
}

/* 结算按钮高度由本页覆盖，用后代选择器提高权重避免被 .gbtn 覆盖 */
.bottombar .bottombar__btn {
  height: 80rpx;
  font-size: 30rpx;
}

/* 购物车滚动区：卡片纵向排布 + 底部给结算条与 TabBar 让位 */
.cart-scroll {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 24rpx 24rpx calc(360rpx + env(safe-area-inset-bottom));
}
</style>
