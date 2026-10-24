<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { ref } from "vue";
import { listCategory } from "@/api/dish";
import { submitProposal } from "@/api/proposal";
import GlassNavBar from "@/components/GlassNavBar.vue";
import type { Category } from "@/types";
import { useOrderNotifierLifecycle } from "@/utils/notify";

const categories = ref<Category[]>([]);
const selectedCategoryIds = ref<number[]>([]);
const name = ref("");
const reason = ref("");
/** 备注：对应后端 tips（小贴士），提交时序列化为 JSON 数组 */
const remark = ref("");
const submitting = ref(false);
useOrderNotifierLifecycle();

onLoad(async () => {
  try {
    const res = await listCategory();
    categories.value = res.rows;
  } catch (e) {
    categories.value = [];
  }
});

/** 分类单选：点一下选中该主类；再次点击不取消（避免误清空） */
function selectCategory(categoryId: number) {
  selectedCategoryIds.value = [categoryId];
}

function isSelected(categoryId: number): boolean {
  return selectedCategoryIds.value.includes(categoryId);
}

/** 备注序列化为后端 tips 需要的 JSON 数组；为空返回空串 */
function serializeRemark(): string {
  const text = remark.value.trim();
  return text ? JSON.stringify([text]) : "";
}

async function submit() {
  if (!name.value.trim()) {
    uni.showToast({ title: "请填写菜名", icon: "none" });
    return;
  }
  if (submitting.value) {
    return;
  }
  submitting.value = true;
  try {
    await submitProposal({
      name: name.value.trim(),
      reason: reason.value,
      categoryIds: selectedCategoryIds.value.length ? selectedCategoryIds.value : undefined,
      tips: serializeRemark() || undefined,
    });
    uni.showToast({ title: "提案已提交，AI 将自动审核", icon: "none" });
    setTimeout(() => {
      uni.redirectTo({ url: "/pages/proposal/list" });
    }, 700);
  } catch (e) {
    // 提示已由请求层给出
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="提交新菜" />

    <view class="note">想吃什么就提，AI 会自动审核；通过后会出现在点餐区</view>

    <view class="field">
      <text class="field__label">菜名</text>
      <input v-model="name" class="field__input" placeholder="如：水煮牛肉" placeholder-class="ph" />
    </view>

    <view class="card">
      <text class="section-title">想吃的理由</text>
      <textarea
        v-model="reason"
        class="textarea"
        maxlength="500"
        placeholder="这周想吃点辣的…"
        placeholder-class="ph"
      />
    </view>

    <view class="field field--col">
      <text class="field__label">主类（选填）</text>
      <view class="cats">
        <text
          v-for="cat in categories"
          :key="cat.categoryId"
          class="cat"
          :class="{ 'cat--on': isSelected(cat.categoryId) }"
          @click="selectCategory(cat.categoryId)"
        >{{ cat.name }}</text>
      </view>
      <text v-if="!categories.length" class="sub-block__empty">暂无分类，可留空由 AI 自动归类</text>
      <text v-else class="sub-block__empty">一道菜只能归一个主类；留空则由 AI 自动归类</text>
    </view>

    <view class="card">
      <text class="section-title">备注（选填）</text>
      <textarea
        v-model="remark"
        class="textarea"
        maxlength="2000"
        placeholder="可粘贴菜谱，或写明必须/不要添加的食材、指定厨具等制作要求"
        placeholder-class="ph"
      />
    </view>

    <view class="submit" :class="{ 'submit--disabled': submitting }" @click="submit">
      {{ submitting ? "提交中…" : "提交提案" }}
    </view>
  </view>
</template>

<style lang="scss" scoped>
.note {
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  background-color: $lg-accent-soft;
  color: $lg-accent;
  font-size: 24rpx;
  line-height: 1.5;
  margin-bottom: 24rpx;
}

/* 输入行：玻璃底 + 亮描边 */
.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: $lg-fill-2;
  border: 1rpx solid $lg-border;
  border-radius: 20rpx;
  padding: 28rpx 24rpx;
  margin-bottom: 16rpx;
}

.field__label {
  font-size: 28rpx;
  color: $lg-ink;
}

.field__input {
  flex: 1;
  text-align: right;
  font-size: 28rpx;
  color: $lg-ink;
}

.field--col {
  flex-direction: column;
  align-items: flex-start;
  gap: 16rpx;
}

.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.cat {
  font-size: 26rpx;
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  background-color: $lg-accent-soft;
  color: $lg-ink-2;
  border: 1rpx solid transparent;
}

.cat--on {
  color: #fff;
  font-weight: 700;
  border-color: transparent;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 10rpx 22rpx $lg-accent-shadow;
}

.ph {
  color: $lg-ink-3;
}

.textarea {
  width: 100%;
  min-height: 150rpx;
  font-size: 26rpx;
  color: $lg-ink;
}

.sub-block__empty {
  display: block;
  font-size: 22rpx;
  color: $lg-ink-3;
  padding: 8rpx 0;
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

.submit--disabled {
  opacity: 0.55;
}
</style>
