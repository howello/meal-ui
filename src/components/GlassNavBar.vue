<script setup lang="ts">
import { onMounted, ref } from "vue";

withDefaults(defineProps<{ title?: string }>(), { title: "" });

/**
 * 是否显示返回键：跟随页面栈，和原生导航栏一致。
 *
 * 根页（reLaunch 进来的 tab、登录后首页）栈长为 1，不显示；
 * navigateTo 进来的二级页栈长 > 1，显示。每次导航都会新建页面实例，
 * onMounted 时页面栈已就绪，取一次即可。
 */
const showBack = ref(false);

onMounted(() => {
  showBack.value = getCurrentPages().length > 1;
});

function goBack() {
  uni.navigateBack({ delta: 1 });
}
</script>

<template>
  <view class="gnb">
    <view class="gnb__row">
      <view class="gnb__side">
        <view v-if="showBack" class="gnb__back" @click="goBack">
          <text class="gnb__back-ic">‹</text>
        </view>
      </view>
      <text class="gnb__title">{{ title }}</text>
      <view class="gnb__side gnb__side--right">
        <slot name="right" />
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 自定义玻璃导航栏：和厨师端 header 同一套液态玻璃材质（半透明白 + 背景模糊 + 高光描边）。
   固定顶部，页面内容由 App.vue 里的留位规则下移让位。 */
.gnb {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding-top: var(--status-bar-height);
  border-radius: 0 0 36rpx 36rpx;
  border-bottom: 1rpx solid $lg-border;
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur($lg-blur) saturate($lg-sat);
  -webkit-backdrop-filter: blur($lg-blur) saturate($lg-sat);
}

.gnb__row {
  height: 88rpx;
  display: flex;
  align-items: center;
  padding: 0 24rpx;
}

.gnb__side {
  flex: 0 0 96rpx;
  display: flex;
  align-items: center;
}

.gnb__side--right {
  justify-content: flex-end;
}

.gnb__back {
  width: 64rpx;
  height: 64rpx;
  margin-left: -14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gnb__back-ic {
  font-size: 52rpx;
  line-height: 1;
  color: $lg-ink;
}

.gnb__title {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 32rpx;
  font-weight: 600;
  color: $lg-ink;
}
</style>
