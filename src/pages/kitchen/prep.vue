<script setup lang="ts">
import { onLoad, onUnload } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { prepPlan, regeneratePrepPlan } from "@/api/order";
import GlassNavBar from "@/components/GlassNavBar.vue";
import type { PrepPlan, PrepPlanItem } from "@/types";

const orderId = ref(0);
const loading = ref(true);
/** 后端返回的 AI 清单；未加载完成前为 null */
const plan = ref<PrepPlan | null>(null);
/** 正在提交「重新生成」 */
const regenerating = ref(false);
/** 已买完的食材名集合 */
const checked = ref<Set<string>>(new Set());

/** 本地存储 key：按订单隔离，不同订单互不影响 */
const storageKey = computed(() => `meal-prep-${orderId.value}`);

/** 合并后的全部条目，用于进度统计与勾选 */
const allItems = computed<PrepPlanItem[]>(() =>
  (plan.value?.groups || []).flatMap((group) => group.items || []),
);
const checkedCount = computed(() => allItems.value.filter((item) => checked.value.has(item.name)).length);
const totalCount = computed(() => allItems.value.length);

const isGenerating = computed(() => plan.value?.status === "GENERATING");
/** 已生成且有内容 */
const isReady = computed(() => plan.value?.status === "READY" && totalCount.value > 0);
/** 已生成但没有可用料：正常空态，不提供重新生成 */
const isEmpty = computed(() => plan.value?.status === "READY" && totalCount.value === 0);
/** 订单已结束：清单已清理，隐藏重新生成 */
const isClosed = computed(() => plan.value?.status === "CLOSED");
/** 生成失败或清单已过期：可重新生成 */
const isFailed = computed(
  () => !loading.value && !isGenerating.value && !isReady.value && !isEmpty.value && !isClosed.value,
);

onLoad(async (options) => {
  orderId.value = Number(options?.orderId || 0);
  if (!orderId.value) {
    uni.showToast({ title: "订单不存在", icon: "none" });
    loading.value = false;
    return;
  }
  loadChecked();
  await loadPlan();
});

/** 读取本地已勾选的食材名（损坏则忽略，当作尚未勾选） */
function loadChecked() {
  const names: string[] = [];
  try {
    const raw = uni.getStorageSync(storageKey.value);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      parsed.forEach((name) => {
        if (typeof name === "string") {
          names.push(name);
        }
      });
    }
  } catch (e) {
    // 解析失败按未勾选处理
  }
  checked.value = new Set(names);
}

/** 持久化已勾选的食材名 */
function persistChecked() {
  uni.setStorageSync(storageKey.value, JSON.stringify([...checked.value]));
}

/** 读取该订单的 AI 备菜清单 */
async function loadPlan() {
  loading.value = true;
  try {
    plan.value = await prepPlan(orderId.value);
  } catch (e) {
    plan.value = null;
  } finally {
    loading.value = false;
  }
  schedulePoll();
}

/** 生成中时每 3 秒自动刷新一次，生成完成或失败后停止 */
const POLL_INTERVAL_MS = 3000;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

/** 根据当前状态安排下一次轮询；页面卸载时清理 */
function schedulePoll() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (plan.value?.status !== "GENERATING") {
    return;
  }
  pollTimer = setTimeout(async () => {
    pollTimer = null;
    await loadPlan();
  }, POLL_INTERVAL_MS);
}

/** 页面卸载时清理轮询 */
onUnload(() => {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
});

/** 生成中或失败时刷新当前状态 */
async function refreshStatus() {
  await loadPlan();
}

/** 重新触发后台生成 */
async function regenerate() {
  if (regenerating.value) {
    return;
  }
  regenerating.value = true;
  try {
    plan.value = await regeneratePrepPlan(orderId.value);
    uni.showToast({ title: "已开始重新生成", icon: "none" });
    schedulePoll();
  } catch (e) {
    // 提示由请求层给出
  } finally {
    regenerating.value = false;
  }
}

/** 勾选/取消某食材的「已买完」并持久化 */
function toggle(item: PrepPlanItem) {
  const next = new Set(checked.value);
  if (next.has(item.name)) {
    next.delete(item.name);
  } else {
    next.add(item.name);
  }
  checked.value = next;
  persistChecked();
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="备菜清单" />

    <view class="card head">
      <view class="row-between">
        <text class="head__title">备菜清单</text>
        <text v-if="isReady" class="head__progress">已买 {{ checkedCount }} / 共 {{ totalCount }}</text>
      </view>
      <text class="tiny head__hint">AI 按采购区域汇总，勾选表示已买好</text>
    </view>

    <view v-if="loading" class="empty">加载中…</view>

    <view v-else-if="isGenerating" class="card state">
      <text class="state__title">AI 正在生成备菜清单</text>
      <text class="state__hint">下单后自动生成，通常需要几秒；也可以点下方按钮刷新。</text>
      <view class="state__action" @click="refreshStatus">
        <text class="state__action-text">刷新状态</text>
      </view>
    </view>

    <view v-else-if="isEmpty" class="card state">
      <text class="state__title">{{ plan?.message || "这张订单暂时没有可用的用料清单" }}</text>
      <text class="state__hint">订单菜品没有填写用料，无法生成采购清单。</text>
    </view>

    <view v-else-if="isClosed" class="card state">
      <text class="state__title">{{ plan?.message || "订单已结束，备菜清单已清理" }}</text>
      <text class="state__hint">订单完成、取消或无人接单后不再保留备菜清单。</text>
    </view>

    <view v-else-if="isFailed" class="card state">
      <text class="state__title">{{ plan?.message || "备菜清单尚未生成或已过期" }}</text>
      <text class="state__hint">可以重新生成，生成完成后回到本页刷新即可查看。</text>
      <view class="state__action" :class="{ 'state__action--busy': regenerating }" @click="regenerate">
        <text class="state__action-text">{{ regenerating ? "提交中…" : "重新生成" }}</text>
      </view>
    </view>

    <view v-else class="list">
      <view v-for="group in plan?.groups || []" :key="group.market" class="group">
        <view class="group__head">
          <text class="group__market">{{ group.market }}</text>
          <text class="group__count">{{ group.items.length }} 项</text>
        </view>
        <view
          v-for="item in group.items"
          :key="`${group.market}-${item.name}`"
          class="card item"
          :class="{ 'item--on': checked.has(item.name) }"
          @click="toggle(item)"
        >
          <view class="item__check" :class="{ 'item__check--on': checked.has(item.name) }">
            <text v-if="checked.has(item.name)">✓</text>
          </view>
          <view class="item__main">
            <view class="row-between">
              <text class="item__name">{{ item.name }}</text>
              <text class="item__amount">{{ item.amount }}</text>
            </view>
            <view v-for="(detail, index) in item.details" :key="index" class="source">
              <text class="source__dish">{{ detail.label }}</text>
              <text v-if="detail.amount" class="source__amount">{{ detail.amount }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.head__title {
  font-size: 32rpx;
  font-weight: 700;
  color: $lg-ink;
}

.head__progress {
  font-size: 24rpx;
  font-weight: 600;
  color: $lg-accent;
  background-color: $lg-accent-soft;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
}

.head__hint {
  display: block;
  margin-top: 10rpx;
}

.state {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.state__title {
  font-size: 28rpx;
  font-weight: 600;
  color: $lg-ink;
}

.state__hint {
  font-size: 24rpx;
  color: $lg-ink-3;
}

.state__action {
  align-self: flex-start;
  margin-top: 6rpx;
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background-color: $lg-accent-soft;
}

.state__action--busy {
  opacity: 0.6;
}

.state__action-text {
  font-size: 26rpx;
  font-weight: 600;
  color: $lg-accent;
}

.list {
  margin-top: 24rpx;
}

.group {
  margin-bottom: 28rpx;
}

.group__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 8rpx 12rpx;
}

.group__market {
  font-size: 28rpx;
  font-weight: 700;
  color: $lg-ink;
}

.group__count {
  font-size: 24rpx;
  color: $lg-ink-3;
}

.item {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
}

.item--on {
  opacity: 0.6;
}

.item--on .item__name {
  text-decoration: line-through;
}

/* 勾选框：与制作中页完成勾选一致的视觉语言 */
.item__check {
  flex: 0 0 auto;
  width: 48rpx;
  height: 48rpx;
  line-height: 48rpx;
  text-align: center;
  border-radius: 50%;
  border: 1rpx solid $lg-line;
  color: #fff;
  font-size: 28rpx;
  margin-top: 4rpx;
}

.item__check--on {
  background-color: $meal-success;
  border-color: $meal-success;
}

.item__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.item__name {
  font-size: 28rpx;
  font-weight: 600;
  color: $lg-ink;
}

.item__amount {
  font-size: 26rpx;
  font-weight: 600;
  color: $lg-accent;
}

.source {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}

.source__dish {
  font-size: 24rpx;
  color: $lg-ink-2;
}

.source__amount {
  font-size: 24rpx;
  color: $lg-ink-3;
}
</style>
