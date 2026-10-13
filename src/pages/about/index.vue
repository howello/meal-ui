<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import GlassCard from "@/components/GlassCard.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import { getAppInfo, readWidgetVersion } from "@/utils/appInfo";

const info = reactive(getAppInfo());

// App 端优先显示当前运行的 wgt 资源版本：热更新重启后「关于」页应反映新版本号
onMounted(() => {
  void readWidgetVersion().then((widget) => {
    if (widget?.versionName) {
      info.version = widget.versionName;
      info.versionCode = String(widget.versionCode);
    }
  });
});

/** 信息行：标签 + 值 */
const rows = computed(() => [
  { label: "版本号", value: info.version },
  { label: "构建号", value: info.versionCode },
  { label: "包名", value: info.packageName },
  { label: "应用标识", value: info.appId },
  { label: "运行平台", value: info.platform },
  { label: "系统", value: info.system },
  { label: "设备", value: info.device },
]);

const year = new Date().getFullYear();
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="关于" />

    <GlassCard class="hero">
      <view class="hero__logo">{{ info.name.slice(0, 1) }}</view>
      <text class="hero__name">{{ info.name }}</text>
      <text class="hero__desc">{{ info.description }}</text>
      <view class="hero__ver">v{{ info.version }}</view>
    </GlassCard>

    <GlassCard :pad="false" class="info">
      <view v-for="row in rows" :key="row.label" class="info__item">
        <text class="info__label">{{ row.label }}</text>
        <text class="info__value">{{ row.value }}</text>
      </view>
    </GlassCard>

    <text class="footer">© {{ year }} {{ info.name }} · 保留所有权利</text>
  </view>
</template>

<style lang="scss" scoped>
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 24rpx;
}

.hero__logo {
  width: 140rpx;
  height: 140rpx;
  border-radius: 36rpx;
  background: linear-gradient(135deg, $lg-accent-2, $lg-accent);
  color: #fff;
  font-size: 64rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 20rpx 40rpx $lg-accent-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.hero__name {
  margin-top: 24rpx;
  font-size: 38rpx;
  font-weight: 700;
  color: $lg-ink;
}

.hero__desc {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: $lg-ink-3;
}

.hero__ver {
  margin-top: 20rpx;
  padding: 6rpx 22rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: $lg-accent;
  background: $lg-accent-soft;
  border: 1px solid $lg-accent-border;
}

/* 分组信息：一张玻璃卡内多行，行间用细分隔线 */
.info {
  margin-top: 24rpx;
  padding: 8rpx 10rpx;
}

.info__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 26rpx 22rpx;
}

.info__item + .info__item {
  border-top: 1px solid $lg-line;
}

.info__label {
  font-size: 28rpx;
  color: $lg-ink-2;
  flex: 0 0 auto;
}

.info__value {
  font-size: 28rpx;
  color: $lg-ink;
  text-align: right;
  word-break: break-all;
}

.footer {
  display: block;
  margin-top: 48rpx;
  text-align: center;
  font-size: 22rpx;
  color: $lg-ink-3;
}
</style>
