<script setup lang="ts">
/**
 * 液态玻璃卡片
 *
 * 统一「半透明磨砂底 + 亮描边 + 柔和内外阴影」的玻璃质感，
 * 供点餐端各页面复用。不支持 backdrop-filter 的端会降级为半透明白底。
 */
withDefaults(
  defineProps<{
    /** 玻璃强度：normal 普通卡片 / strong 强玻璃（浮层）/ weak 弱玻璃（分类栏、内嵌区） */
    variant?: "normal" | "strong" | "weak";
    /** 自定义圆角，带单位（如 '26rpx'），不传用默认 24rpx */
    radius?: string;
    /** 是否使用默认内边距（24rpx），传 false 由使用方自行控制 */
    pad?: boolean;
  }>(),
  { variant: "normal", radius: "", pad: true },
);
</script>

<template>
  <view
    class="glass-card"
    :class="[`glass-card--${variant}`, { 'glass-card--pad': pad }]"
    :style="radius ? { borderRadius: radius } : undefined"
  >
    <slot />
  </view>
</template>

<style lang="scss" scoped>
.glass-card {
  border: 1px solid $lg-border;
  box-shadow: $lg-shadow, $lg-edge;
  border-radius: 24rpx;
  /* 降级底：不支持 backdrop-filter 时仍保证可读 */
  background: $lg-fill;
}

.glass-card--pad {
  padding: 24rpx;
}

.glass-card--strong {
  background: $lg-fill-4;
}

.glass-card--weak {
  background: $lg-fill-2;
  box-shadow: $lg-shadow-sm, $lg-edge;
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-card {
    background: $lg-glass;
    backdrop-filter: blur($lg-blur) saturate($lg-sat);
    -webkit-backdrop-filter: blur($lg-blur) saturate($lg-sat);
  }
  .glass-card--strong {
    background: $lg-glass-strong;
  }
  .glass-card--weak {
    background: $lg-glass-weak;
  }
}
</style>
