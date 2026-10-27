<script setup lang="ts">
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { listOrderAssignees, submitOrder, type SubmitOrderItem } from "@/api/order";
import GlassNavBar from "@/components/GlassNavBar.vue";
import { useCartStore } from "@/store/cart";
import { useOrderNotifierLifecycle } from "@/utils/notify";
import type { OrderAssignee } from "@/types";

const ORDER_REMARK_KEY = "meal-order-remark";

const cartStore = useCartStore();
useOrderNotifierLifecycle();

const orderRemark = ref("");
const now = ref("");
const submitting = ref(false);
/** 可指派的厨师；空数组表示家里还没有厨师，禁止下单 */
const assignees = ref<OrderAssignee[]>([]);
/** 选中的厨师下标；-1 表示不指派（谁有空谁做） */
const assignIndex = ref(-1);
/** 可指派列表是否仍在加载，避免把「加载中」误判成「没有厨师」 */
const assigneesLoading = ref(true);

onLoad(() => {
  const saved = uni.getStorageSync(ORDER_REMARK_KEY);
  orderRemark.value = typeof saved === "string" ? saved : "";
  now.value = formatNow();
  loadAssignees();
});

/** 拉取本家庭可指派的厨师；失败时按「没有厨师」处理，不允许提交 */
async function loadAssignees() {
  assigneesLoading.value = true;
  try {
    assignees.value = (await listOrderAssignees()) || [];
  } catch (e) {
    assignees.value = [];
  } finally {
    assigneesLoading.value = false;
  }
}

/** 指派选择器的展示文案：不指派 + 每位厨师 */
const assignOptions = computed(() => [
  "不指派（谁有空谁做）",
  ...assignees.value.map((item) => item.nickName),
]);

/** 没有可指派厨师时不允许下单，避免产生永远没人接的单 */
const noChef = computed(() => !assigneesLoading.value && assignees.value.length === 0);

function pickAssignee(index: number) {
  assignIndex.value = index;
}

const totalCount = computed(() => cartStore.totalCount);
const dishKinds = computed(() => cartStore.dishKinds);

function formatNow(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

async function submit() {
  if (cartStore.isEmpty) {
    uni.showToast({ title: "购物车是空的", icon: "none" });
    return;
  }
  if (noChef.value) {
    uni.showToast({ title: "家里还没有厨师，暂时无法下单", icon: "none" });
    return;
  }
  if (submitting.value) {
    return;
  }
  submitting.value = true;
  try {
    const items: SubmitOrderItem[] = cartStore.lines.map((line) => ({
      dishId: line.dishId,
      count: line.count,
      remark: line.remark,
    }));
    // 下标 0 是「不指派」，其余对应 assignees 中的厨师
    const assignUserId =
      assignIndex.value > 0 ? assignees.value[assignIndex.value - 1]?.userId ?? null : null;
    const orderId = await submitOrder({
      items,
      orderRemark: orderRemark.value,
      assignUserId,
    });
    cartStore.clear();
    uni.removeStorageSync(ORDER_REMARK_KEY);
    // 拿到订单号后立刻跳详情，不再等 700ms 的提示动画；
    // 「下单成功」由详情页在数据加载完成后提示（created=1）。
    uni.redirectTo({ url: `/pages/order/detail?orderId=${orderId}&created=1` });
  } catch (e) {
    // 失败提示已由请求层统一弹出
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="确认下单" />

    <view class="card">
      <view class="row-between">
        <text class="muted">下单时间</text>
        <text class="value">{{ now }}</text>
      </view>
    </view>

    <view class="card">
      <text class="section-title">点餐明细</text>
      <view v-for="line in cartStore.lines" :key="line.dishId" class="item">
        <view class="item__main">
          <text class="item__name">{{ line.dishName }}</text>
          <text v-if="line.remark" class="tiny">{{ line.remark }}</text>
        </view>
        <text class="muted">× {{ line.count }}</text>
      </view>
      <view class="hr"></view>
      <view class="row-between">
        <text class="muted">共 {{ totalCount }} 份</text>
        <text class="tiny">{{ dishKinds }} 道菜</text>
      </view>
    </view>

    <view class="card">
      <text class="section-title">指派厨师</text>
      <view v-if="assigneesLoading" class="assign-hint">正在加载可指派的厨师…</view>
      <view v-else-if="noChef" class="assign-hint assign-hint--warn">
        家里还没有厨师，暂时无法下单
      </view>
      <view v-else class="assign-options">
        <view
          v-for="(label, index) in assignOptions"
          :key="index"
          class="assign-option"
          :class="{ 'assign-option--on': assignIndex === index }"
          @click="pickAssignee(index)"
        >
          <text class="assign-option__text">{{ label }}</text>
          <view v-if="assignIndex === index" class="assign-option__check"></view>
        </view>
      </view>
    </view>

    <view class="card">
      <text class="section-title">备注</text>
      <input
        v-model="orderRemark"
        class="remark-input"
        placeholder="口味 / 忌口，如：红烧肉少放糖，饭多一点"
        placeholder-class="ph"
      />
    </view>

    <view class="note">提交后厨师会收到通知，制作完成后可在订单详情评价</view>

    <view
      class="submit"
      :class="{ 'submit--disabled': submitting || noChef }"
      @click="submit"
    >
      <view v-if="submitting" class="submit__spinner"></view>
      {{ submitting ? "正在提交…" : noChef ? "暂无厨师可接单" : "提交订单" }}
    </view>
  </view>
</template>

<style lang="scss" scoped>
.value {
  font-size: 26rpx;
  color: $lg-ink;
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid $lg-line;
}

.item:last-of-type {
  border-bottom: none;
}

.item__main {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.item__name {
  font-size: 26rpx;
  color: $lg-ink;
}

.hr {
  height: 1rpx;
  background-color: $lg-line;
  margin: 16rpx 0;
}

.remark-input {
  font-size: 26rpx;
  color: $lg-ink;
}

.ph {
  color: $lg-ink-3;
}

.assign-hint {
  font-size: 26rpx;
  color: $lg-ink-2;
}

.assign-hint--warn {
  color: $meal-warning;
}

.assign-options {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 16rpx;
}

.assign-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  border: 1rpx solid $lg-line;
  background-color: $lg-fill-2;
}

.assign-option--on {
  border-color: $lg-accent;
  background-color: $lg-accent-soft;
}

.assign-option__text {
  font-size: 26rpx;
  color: $lg-ink;
}

.assign-option__check {
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
}

.note {
  margin-top: 24rpx;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  background-color: $lg-accent-soft;
  color: $lg-accent;
  font-size: 24rpx;
  line-height: 1.5;
}

.submit {
  margin-top: 40rpx;
  height: 96rpx;
  line-height: 96rpx;
  text-align: center;
  border-radius: 999rpx;
  color: #fff;
  font-size: 32rpx;
  font-weight: 700;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 24rpx 52rpx $lg-accent-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

/* 提交中的细环转圈：与按钮文字同排，给网络请求一个明确反馈 */
.submit__spinner {
  display: inline-block;
  width: 30rpx;
  height: 30rpx;
  margin-right: 12rpx;
  vertical-align: -5rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
  border-radius: 50%;
  animation: submit-spin 0.8s linear infinite;
}

@keyframes submit-spin {
  to {
    transform: rotate(360deg);
  }
}

.submit--disabled {
  opacity: 0.55;
}
</style>
