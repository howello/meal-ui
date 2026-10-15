<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import GlassCard from "@/components/GlassCard.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import { getAppInfo, readWidgetVersion } from "@/utils/appInfo";
import { checkAppUpdateManually } from "@/utils/update";

const info = reactive(getAppInfo());
/** 手动检查更新进行中：防重复点击，同时驱动按钮文案 */
const checking = ref(false);

// App 端优先显示当前运行的 wgt 资源版本：热更新重启后「关于」页应反映新版本号
onMounted(() => {
  void readWidgetVersion().then((widget) => {
    if (widget?.versionName) {
      info.version = widget.versionName;
      info.versionCode = String(widget.versionCode);
    }
  });
});

/** 手动检查更新（仅 App 端展示入口） */
async function onCheckUpdate(): Promise<void> {
  if (checking.value) {
    return;
  }
  checking.value = true;
  try {
    await checkAppUpdateManually();
  } finally {
    checking.value = false;
  }
}

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
      <view class="hero__logo">
        <image class="hero__logo-img" src="/static/logo.png" mode="aspectFit" />
      </view>
      <text class="hero__name">{{ info.name }}</text>
      <text class="hero__desc">{{ info.description }}</text>
      <view class="hero__ver">v{{ info.version }}</view>
      <!-- #ifdef APP-PLUS -->
      <view class="hero__check" :class="{ 'hero__check--busy': checking }" @click="onCheckUpdate">
        {{ checking ? "正在检查更新…" : "检查更新" }}
      </view>
      <!-- #endif -->
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
  /* logo 自带白色底，做成圆角白色磁贴（App 图标观感），与登录页 logo 保持一致 */
  overflow: hidden;
  box-shadow: 0 20rpx 40rpx $lg-accent-shadow;
}

.hero__logo-img {
  width: 140rpx;
  height: 140rpx;
  display: block;
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

/* 手动检查更新：仅 App 端渲染（模板里用 #ifdef APP-PLUS 控制） */
.hero__check {
  margin-top: 28rpx;
  padding: 12rpx 44rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: $lg-accent;
  background: $lg-accent-soft;
  border: 1px solid $lg-accent-border;
}

.hero__check--busy {
  opacity: 0.6;
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
