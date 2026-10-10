<script setup lang="ts">
/**
 * 液态玻璃按钮
 *
 * primary：暖橙渐变强调按钮（主操作）；
 * ghost：半透明玻璃描边按钮（次要操作）。
 * 高度/字号可由使用方通过外部 class 覆盖。
 */
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** 按钮样式：primary 暖橙渐变 / ghost 玻璃描边 */
    variant?: "primary" | "ghost";
    /** 是否禁用（禁用时置灰且不派发点击） */
    disabled?: boolean;
  }>(),
  { variant: "primary", disabled: false },
);

const emit = defineEmits<{ (e: "click"): void }>();

const classes = computed(() => [`gbtn--${props.variant}`, { "gbtn--disabled": props.disabled }]);

/** 点击：禁用态直接吞掉事件，避免误触发 */
function onClick() {
  if (!props.disabled) {
    emit("click");
  }
}
</script>

<template>
  <view class="gbtn" :class="classes" @click="onClick">
    <slot />
  </view>
</template>

<style lang="scss" scoped>
.gbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  border-radius: 999rpx;
  font-size: 30rpx;
  font-weight: 700;
}

.gbtn--primary {
  color: #fff;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 24rpx 52rpx $lg-accent-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.gbtn--ghost {
  color: $lg-ink-2;
  background: $lg-fill-2;
  border: 1px solid $lg-border;
}

.gbtn--disabled {
  opacity: 0.55;
}
</style>
