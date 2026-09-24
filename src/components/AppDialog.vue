<script setup lang="ts">
import { dialogState, handleConfirm, handleCancel } from "@/composables/useDialog";
</script>

<template>
  <view v-if="dialogState.visible" class="app-dialog__mask" @click.self="dialogState.showCancel && handleCancel()">
    <view class="app-dialog">
      <text v-if="dialogState.title" class="app-dialog__title">{{ dialogState.title }}</text>
      <text class="app-dialog__msg">{{ dialogState.message }}</text>
      <view class="app-dialog__btns">
        <view v-if="dialogState.showCancel" class="app-dialog__btn app-dialog__btn--cancel" @click="handleCancel">
          {{ dialogState.cancelText }}
        </view>
        <view class="app-dialog__btn app-dialog__btn--confirm" @click="handleConfirm">
          {{ dialogState.confirmText }}
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.app-dialog__mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.app-dialog {
  width: 560rpx;
  background-color: #fff;
  border-radius: 28rpx;
  padding: 44rpx 36rpx 28rpx;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.2);
}

.app-dialog__title {
  display: block;
  text-align: center;
  font-size: 32rpx;
  font-weight: 700;
  color: $meal-text;
  margin-bottom: 18rpx;
}

.app-dialog__msg {
  display: block;
  text-align: center;
  font-size: 28rpx;
  color: $meal-text;
  line-height: 1.6;
  margin-bottom: 36rpx;
}

.app-dialog__btns {
  display: flex;
  gap: 20rpx;
}

.app-dialog__btn {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  text-align: center;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 600;
}

.app-dialog__btn--cancel {
  background-color: $meal-bg;
  color: $meal-text-2;
}

.app-dialog__btn--confirm {
  background-color: $meal-primary;
  color: #fff;
}
</style>
