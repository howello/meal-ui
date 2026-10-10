<script setup lang="ts">
/**
 * 全局确认/提示弹窗的渲染层
 *
 * 必须挂在「调用 confirm()/alert() 的页面」自己的模板里（放在页面根节点之外作为同级节点），
 * 不能挂在 App.vue：uni-app 会把 App 根组件的渲染替换成内置布局（H5），App 端页面也不渲染它，
 * 挂在那里的弹窗永远不会出现，confirm() 的 Promise 也就永远等不到结果。
 */
import { onBeforeUnmount } from "vue";
import { dialogState, handleConfirm, handleCancel } from "@/composables/useDialog";

// 所在页面被关闭（返回、reLaunch）时弹窗还开着，按「取消」收掉，避免遗留到别的页面
onBeforeUnmount(() => {
  if (dialogState.visible) {
    handleCancel();
  }
});
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
/* 遮罩：轻微磨砂，突出玻璃弹窗又不喧宾夺主 */
.app-dialog__mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: $lg-mask;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.app-dialog {
  width: 560rpx;
  border-radius: 40rpx;
  padding: 44rpx 36rpx 28rpx;
  border: 1px solid $lg-border;
  box-shadow: $lg-shadow, $lg-edge;
  /* 弹窗需要更实的底以保证文字可读，仍叠加背景模糊 */
  background: $lg-fill;
  backdrop-filter: blur($lg-blur) saturate(180%);
  -webkit-backdrop-filter: blur($lg-blur) saturate(180%);
}

.app-dialog__title {
  display: block;
  text-align: center;
  font-size: 32rpx;
  font-weight: 700;
  color: $lg-ink;
  margin-bottom: 18rpx;
}

.app-dialog__msg {
  display: block;
  text-align: center;
  font-size: 28rpx;
  color: $lg-ink;
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
  background: $lg-fill-3;
  border: 1px solid $lg-border;
  color: $lg-ink-2;
}

.app-dialog__btn--confirm {
  color: #fff;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 16rpx 34rpx $lg-accent-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
</style>
