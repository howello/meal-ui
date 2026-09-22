<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import TabBar from "@/components/TabBar.vue";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";

const ORDER_REMARK_KEY = "meal-order-remark";

const cartStore = useCartStore();
const userStore = useUserStore();

const orderRemark = ref("");

onShow(() => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  cartStore.restore();
  const saved = uni.getStorageSync(ORDER_REMARK_KEY);
  orderRemark.value = typeof saved === "string" ? saved : "";
});

function changeCount(dishId: number, delta: number) {
  const line = cartStore.lines.find((item) => item.dishId === dishId);
  if (!line) {
    return;
  }
  cartStore.updateCount(dishId, line.count + delta);
}

function editRemark(dishId: number, current: string) {
  uni.showModal({
    title: "单项备注",
    editable: true,
    placeholderText: "如：不要放辣",
    content: current || "",
    success: (res) => {
      if (res.confirm) {
        cartStore.updateRemark(dishId, res.content || "");
      }
    },
  });
}

function removeLine(dishId: number) {
  uni.showModal({
    title: "提示",
    content: "确定要从购物车移除这道菜吗？",
    success: (res) => {
      if (res.confirm) {
        cartStore.remove(dishId);
      }
    },
  });
}

function clearAll() {
  if (cartStore.isEmpty) {
    return;
  }
  uni.showModal({
    title: "提示",
    content: "确定清空购物车吗？",
    success: (res) => {
      if (res.confirm) {
        cartStore.clear();
      }
    },
  });
}

function saveRemark() {
  uni.setStorageSync(ORDER_REMARK_KEY, orderRemark.value);
}

function goConfirm() {
  if (cartStore.isEmpty) {
    uni.showToast({ title: "购物车是空的", icon: "none" });
    return;
  }
  saveRemark();
  uni.navigateTo({ url: "/pages/order/confirm" });
}
</script>

<template>
  <view class="page-body page-body--tabbed">
    <view class="row-between head">
      <text class="section-title">购物车</text>
      <text v-if="!cartStore.isEmpty" class="tiny" @click="clearAll">清空</text>
    </view>

    <template v-if="!cartStore.isEmpty">
      <view v-for="line in cartStore.lines" :key="line.dishId" class="card line">
        <image v-if="line.dishCover" class="line__cover" :src="line.dishCover" mode="aspectFill" />
        <view v-else class="line__cover line__cover--ph">{{ line.dishName }}</view>
        <view class="line__body">
          <view class="row-between">
            <text class="line__name">{{ line.dishName }}</text>
            <text class="line__del" @click="removeLine(line.dishId)">✕</text>
          </view>
          <text class="line__remark" @click="editRemark(line.dishId, line.remark || '')">
            {{ line.remark || "加备注" }}
          </text>
          <view class="row-between">
            <view class="stepper">
              <text class="stepper__btn" @click="changeCount(line.dishId, -1)">−</text>
              <text class="stepper__count">{{ line.count }}</text>
              <text class="stepper__btn stepper__btn--plus" @click="changeCount(line.dishId, 1)">+</text>
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
          @blur="saveRemark"
        />
      </view>
    </template>

    <view v-else class="empty">购物车还是空的，去点餐区看看</view>

    <view v-if="!cartStore.isEmpty" class="bottombar">
      <view class="row-between bottombar__sum">
        <text class="muted">合计 <text class="sum">{{ cartStore.totalCount }}</text> 份菜</text>
        <text class="tiny">共 {{ cartStore.dishKinds }} 道</text>
      </view>
      <view class="bottombar__btn" @click="goConfirm">去下单</view>
    </view>

    <TabBar active="cart" />
  </view>
</template>

<style lang="scss" scoped>
.head {
  margin-bottom: 20rpx;
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

.line__del {
  color: $meal-text-2;
  font-size: 26rpx;
  padding: 0 8rpx;
}

.line__remark {
  display: block;
  font-size: 22rpx;
  color: $meal-text-2;
  margin: 10rpx 0 16rpx;
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
  bottom: 108rpx;
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
</style>
