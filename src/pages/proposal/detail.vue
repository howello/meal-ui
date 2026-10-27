<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { proposalDetail } from "@/api/proposal";
import CachedImage from "@/components/CachedImage.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import { PROPOSAL_STATUS_TEXT, type Ingredient, type Proposal } from "@/types";
import { useOrderNotifierLifecycle } from "@/utils/notify";
import { previewImage } from "@/utils/preview";

const proposal = ref<Proposal | null>(null);
const loading = ref(true);
const proposalId = ref(0);
useOrderNotifierLifecycle();

onLoad(async (options) => {
  proposalId.value = Number(options?.proposalId || 0);
  if (!proposalId.value) {
    loading.value = false;
    uni.showToast({ title: "提案不存在", icon: "none" });
    return;
  }
  await loadDetail();
});

/** 拉取提案详情：含提交内容、AI 补齐的菜谱字段与审核信息 */
async function loadDetail() {
  loading.value = true;
  try {
    proposal.value = await proposalDetail(proposalId.value);
  } catch (e) {
    proposal.value = null;
  } finally {
    loading.value = false;
  }
}

const statusText = computed(() => {
  const status = proposal.value?.status || "0";
  return PROPOSAL_STATUS_TEXT[status] || "未知";
});

const statusClass = computed(() => {
  const status = proposal.value?.status;
  if (status === "1") {
    return "tag tag--ok";
  }
  if (status === "2") {
    return "tag tag--err";
  }
  return "tag tag--warn";
});

/** 解析 JSON 数组字段（用料 / 做法 / 备注），格式异常时返回空数组 */
function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (e) {
    return fallback;
  }
}

const ingredients = computed<Ingredient[]>(() =>
  parseJson<Ingredient[]>(proposal.value?.ingredients, []),
);
const steps = computed<string[]>(() => parseJson<string[]>(proposal.value?.steps, []));
const tips = computed<string[]>(() => parseJson<string[]>(proposal.value?.tips, []));
const tagList = computed<string[]>(() =>
  (proposal.value?.tags || "")
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter((tag) => !!tag),
);

/** 审核结论：已审核时展示审核人与时间，未审核时给出当前进度提示 */
const auditHint = computed(() => {
  const current = proposal.value;
  if (!current) {
    return "";
  }
  if (current.status === "1") {
    return "已通过，可在点餐区看到这道菜";
  }
  if (current.status === "2") {
    return "未通过，可以补充细节后重新提交";
  }
  return "等待审核中，通过后会自动上架并补齐菜谱";
});

/** 打开参考图大图 */
function openImage() {
  if (proposal.value?.image) {
    previewImage(proposal.value.image);
  }
}

/** 已通过时跳转生成的菜品详情 */
function openDish() {
  if (!proposal.value?.dishId) {
    return;
  }
  uni.navigateTo({ url: `/pages/menu/detail?dishId=${proposal.value.dishId}` });
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="提案详情" />

    <view v-if="proposal" class="detail">
      <view class="card head">
        <view class="head__row">
          <text class="head__name">{{ proposal.name }}</text>
          <text :class="statusClass">{{ statusText }}</text>
        </view>
        <text class="tiny head__meta">
          提交于 {{ proposal.createTime || "—" }}
          <template v-if="proposal.categoryNames"> · 主类 {{ proposal.categoryNames }}</template>
        </text>
        <text class="head__hint">{{ auditHint }}</text>
      </view>

      <view v-if="proposal.image" class="card image-card">
        <CachedImage class="image" :src="proposal.image" mode="aspectFill" @click="openImage" />
        <text class="tiny image-card__hint">点击查看大图</text>
      </view>

      <view v-if="proposal.reason" class="card">
        <text class="section-title">想吃的理由</text>
        <text class="text">{{ proposal.reason }}</text>
      </view>

      <view v-if="proposal.description" class="card">
        <text class="section-title">菜品介绍</text>
        <text class="text">{{ proposal.description }}</text>
      </view>

      <view v-if="tips.length" class="card">
        <text class="section-title">我填写的备注</text>
        <view v-for="(tip, index) in tips" :key="index" class="tip">{{ tip }}</view>
      </view>

      <view v-if="tagList.length" class="card">
        <text class="section-title">标签</text>
        <view class="tags">
          <text v-for="tag in tagList" :key="tag" class="tag-chip">{{ tag }}</text>
        </view>
      </view>

      <view v-if="proposal.duration || proposal.level" class="card specs">
        <view v-if="proposal.duration" class="spec">
          <text class="spec__value">{{ proposal.duration }}</text>
          <text class="tiny">耗时</text>
        </view>
        <view v-if="proposal.level" class="spec">
          <text class="spec__value">{{ proposal.level }}</text>
          <text class="tiny">难度</text>
        </view>
      </view>

      <view v-if="ingredients.length" class="card">
        <text class="section-title">用料</text>
        <view v-for="(item, index) in ingredients" :key="index" class="ingredient">
          <text class="ingredient__name">{{ item.name }}</text>
          <text class="muted">{{ item.amount }}</text>
        </view>
      </view>

      <view v-if="steps.length" class="card">
        <text class="section-title">做法</text>
        <view v-for="(step, index) in steps" :key="index" class="step">
          <text class="step__index">{{ index + 1 }}</text>
          <text class="step__text">{{ step }}</text>
        </view>
      </view>

      <!-- 审核信息：谁审的、什么时候、结论是什么 -->
      <view class="card audit">
        <text class="section-title">审核信息</text>
        <view class="audit__row">
          <text class="muted">审核结果</text>
          <text class="value">{{ statusText }}</text>
        </view>
        <view class="audit__row">
          <text class="muted">审核人</text>
          <text class="value">{{ proposal.auditBy || "待审核" }}</text>
        </view>
        <view class="audit__row">
          <text class="muted">审核时间</text>
          <text class="value">{{ proposal.auditTime || "—" }}</text>
        </view>
        <view v-if="proposal.auditRemark" class="audit__remark">
          <text class="audit__remark-label">审核意见</text>
          <text class="audit__remark-text">{{ proposal.auditRemark }}</text>
        </view>
      </view>

      <view v-if="proposal.status === '1' && proposal.dishId" class="actions">
        <view class="actions__btn" @click="openDish">去点餐区看看这道菜</view>
      </view>
    </view>

    <view v-else class="empty">{{ loading ? "加载中…" : "提案不存在或已删除" }}</view>
  </view>
</template>

<style lang="scss" scoped>
.head__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.head__name {
  flex: 1;
  min-width: 0;
  font-size: 34rpx;
  font-weight: 700;
  color: $lg-ink;
}

.head__meta {
  display: block;
  margin-top: 10rpx;
}

.head__hint {
  display: block;
  margin-top: 16rpx;
  padding: 14rpx 18rpx;
  border-radius: 16rpx;
  background-color: $lg-accent-soft;
  color: $lg-accent;
  font-size: 23rpx;
  line-height: 1.5;
}

.image-card {
  padding: 0;
  overflow: hidden;
}

.image {
  display: block;
  width: 100%;
  height: 380rpx;
}

.image-card__hint {
  display: block;
  padding: 12rpx 20rpx;
}

.text {
  display: block;
  font-size: 26rpx;
  line-height: 1.7;
  color: $lg-ink;
  white-space: pre-wrap;
}

.tip {
  font-size: 26rpx;
  line-height: 1.7;
  color: $lg-ink;
  white-space: pre-wrap;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.tag-chip {
  font-size: 22rpx;
  font-weight: 600;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  color: $lg-accent;
  background-color: $lg-accent-soft;
}

.specs {
  display: flex;
  gap: 24rpx;
}

.spec {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.spec__value {
  font-size: 28rpx;
  font-weight: 700;
  color: $lg-ink;
}

.ingredient {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 26rpx;
  padding: 12rpx 0;
  border-bottom: 1rpx solid $lg-line;
}

.ingredient:last-child {
  border-bottom: none;
}

.ingredient__name {
  color: $lg-ink;
}

.step {
  display: flex;
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.step:last-child {
  margin-bottom: 0;
}

.step__index {
  flex: 0 0 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  border-radius: 50%;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  color: #fff;
  font-size: 20rpx;
  font-weight: 700;
  margin-top: 4rpx;
}

.step__text {
  flex: 1;
  font-size: 26rpx;
  line-height: 1.6;
  color: $lg-ink;
}

.audit__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 0;
}

.value {
  font-size: 25rpx;
  color: $lg-ink;
}

.audit__remark {
  margin-top: 14rpx;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  background-color: $lg-fill-2;
  border: 1rpx solid $lg-border;
}

.audit__remark-label {
  display: block;
  font-size: 22rpx;
  color: $lg-ink-3;
  margin-bottom: 8rpx;
}

.audit__remark-text {
  display: block;
  font-size: 25rpx;
  line-height: 1.6;
  color: $lg-ink;
  white-space: pre-wrap;
}

.actions {
  margin-top: 32rpx;
}

.actions__btn {
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 999rpx;
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 20rpx 44rpx $lg-accent-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.tag {
  flex: 0 0 auto;
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  font-weight: 600;
}

.tag--warn {
  background-color: $lg-warn-soft;
  color: $meal-warning;
}

.tag--ok {
  background-color: $lg-ok-soft;
  color: $meal-success;
}

.tag--err {
  background-color: $lg-danger-soft;
  color: $lg-danger;
}
</style>
