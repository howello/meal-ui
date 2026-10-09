<script setup lang="ts">
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { ref } from "vue";
import { listCategory } from "@/api/dish";
import { aiGenerateDish } from "@/api/ai";
import { submitProposal } from "@/api/proposal";
import { uploadImage } from "@/api/upload";
import type { Category } from "@/types";
import { useOrderNotifierLifecycle } from "@/utils/notify";

const categories = ref<Category[]>([]);
const selectedCategoryIds = ref<number[]>([]);
const name = ref("");
const description = ref("");
const reason = ref("");
const image = ref("");
const tags = ref("");
const duration = ref("");
const level = ref("");
const ingredients = ref("");
const steps = ref("");
const tips = ref("");
const submitting = ref(false);
const aiLoading = ref(false);
useOrderNotifierLifecycle();

onLoad(async () => {
  try {
    const res = await listCategory();
    categories.value = res.rows;
  } catch (e) {
    categories.value = [];
  }
});

/** 分类可多选：点一下切换选中态 */
function toggleCategory(categoryId: number) {
  const idx = selectedCategoryIds.value.indexOf(categoryId);
  if (idx >= 0) {
    selectedCategoryIds.value.splice(idx, 1);
  } else {
    selectedCategoryIds.value.push(categoryId);
  }
}

function isSelected(categoryId: number): boolean {
  return selectedCategoryIds.value.includes(categoryId);
}

function pickImage() {
  uni.chooseImage({
    count: 1,
    success: async (res) => {
      const path = (res.tempFilePaths as string[])[0];
      if (!path) {
        return;
      }
      try {
        image.value = await uploadImage(path);
      } catch (e) {
        // 上传失败已提示
      }
    },
  });
}

/** 一键 AI：只补齐当前为空的字段，已填内容不覆盖 */
async function handleAiGenerate() {
  const dishName = name.value.trim();
  if (!dishName) {
    uni.showToast({ title: "请先填写菜名", icon: "none" });
    return;
  }
  if (aiLoading.value) {
    return;
  }
  aiLoading.value = true;
  try {
    const result = await aiGenerateDish({
      name: dishName,
      current: {
        categoryIds: selectedCategoryIds.value.length ? selectedCategoryIds.value : undefined,
        description: description.value || undefined,
        cover: image.value || undefined,
        tags: tags.value || undefined,
        duration: duration.value || undefined,
        level: level.value || undefined,
        ingredients: ingredients.value || undefined,
        steps: steps.value || undefined,
        tips: tips.value || undefined,
      },
    });
    const fields = result.fields || {};
    if (fields.description && !description.value) description.value = fields.description;
    if (fields.tags && !tags.value) tags.value = fields.tags;
    if (fields.duration && !duration.value) duration.value = fields.duration;
    if (fields.level && !level.value) level.value = fields.level;
    if (fields.ingredients && !ingredients.value) ingredients.value = fields.ingredients;
    if (fields.steps && !steps.value) steps.value = fields.steps;
    if (fields.tips && !tips.value) tips.value = fields.tips;
    if (result.cover && !image.value) image.value = result.cover;
    if (result.matchedCategoryIds && result.matchedCategoryIds.length && !selectedCategoryIds.value.length) {
      selectedCategoryIds.value = result.matchedCategoryIds;
    }
    if (result.unmatchedCategoryNames && result.unmatchedCategoryNames.length) {
      uni.showToast({ title: `未匹配分类：${result.unmatchedCategoryNames.join("、")}`, icon: "none" });
    } else if (result.imageError) {
      uni.showToast({ title: `封面图未生成：${result.imageError}`, icon: "none" });
    } else {
      uni.showToast({ title: "已补齐空字段", icon: "none" });
    }
  } catch (e) {
    // 错误提示已由请求层给出
  } finally {
    aiLoading.value = false;
  }
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
      categoryIds: selectedCategoryIds.value.length ? selectedCategoryIds.value : undefined,
      description: description.value,
      reason: reason.value,
      image: image.value || undefined,
      tags: tags.value || undefined,
      duration: duration.value || undefined,
      level: level.value || undefined,
      ingredients: ingredients.value || undefined,
      steps: steps.value || undefined,
      tips: tips.value || undefined,
    });
    uni.showToast({ title: "提案已提交", icon: "none" });
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
  <view class="page-body">
    <view class="note">想吃什么就提，管理员审核通过后就会出现在点餐区</view>

    <view class="field">
      <text class="field__label">菜名</text>
      <input v-model="name" class="field__input" placeholder="如：水煮牛肉" placeholder-class="ph" />
    </view>

    <view class="ai-row">
      <view class="ai-btn" :class="{ 'ai-btn--disabled': aiLoading }" @click="handleAiGenerate">
        {{ aiLoading ? "AI 生成中…" : "一键 AI 补齐" }}
      </view>
      <text class="ai-hint">填好菜名后点一下，自动补齐空字段</text>
    </view>

    <view class="field field--col">
      <text class="field__label">建议分类（可多选）</text>
      <view class="cats">
        <text
          v-for="cat in categories"
          :key="cat.categoryId"
          class="cat"
          :class="{ 'cat--on': isSelected(cat.categoryId) }"
          @click="toggleCategory(cat.categoryId)"
        >{{ cat.name }}</text>
      </view>
    </view>

    <view class="card">
      <text class="section-title">菜品介绍</text>
      <textarea
        v-model="description"
        class="textarea"
        maxlength="500"
        placeholder="这道菜大概是什么味道、什么做法"
        placeholder-class="ph"
      />
    </view>

    <view class="card">
      <text class="section-title">参考图（选填）</text>
      <view class="upl">
        <view v-if="image" class="upl__box">
          <image class="upl__img" :src="image" mode="aspectFill" @click="image = ''" />
        </view>
        <view v-else class="upl__box upl__box--add" @click="pickImage">＋</view>
      </view>
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

    <view class="card">
      <text class="section-title">更多信息（选填，可由一键 AI 生成）</text>
      <view class="mini-field">
        <text class="mini-field__label">标签</text>
        <input v-model="tags" class="mini-field__input" placeholder="逗号分隔，如 家常,下饭" placeholder-class="ph" />
      </view>
      <view class="mini-field">
        <text class="mini-field__label">耗时</text>
        <input v-model="duration" class="mini-field__input" placeholder="如 90 分钟" placeholder-class="ph" />
      </view>
      <view class="mini-field">
        <text class="mini-field__label">难度</text>
        <input v-model="level" class="mini-field__input" placeholder="如 中等" placeholder-class="ph" />
      </view>
      <textarea v-model="ingredients" class="textarea" placeholder="用料（JSON，一般无需修改）" placeholder-class="ph" />
      <textarea v-model="steps" class="textarea" placeholder="做法（JSON，一般无需修改）" placeholder-class="ph" />
      <textarea v-model="tips" class="textarea" placeholder="小贴士（JSON，一般无需修改）" placeholder-class="ph" />
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
  background: rgba(255, 255, 255, 0.6);
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

.field__value {
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

.upl {
  display: flex;
  gap: 16rpx;
}

.upl__box {
  width: 150rpx;
  height: 150rpx;
  border-radius: 18rpx;
  overflow: hidden;
}

.upl__img {
  width: 150rpx;
  height: 150rpx;
}

.upl__box--add {
  border: 2rpx dashed $lg-line;
  color: $lg-ink-3;
  font-size: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.ai-btn {
  flex-shrink: 0;
  padding: 16rpx 32rpx;
  border-radius: 999rpx;
  background-color: $lg-accent-soft;
  color: $lg-accent;
  font-size: 26rpx;
  font-weight: 600;
}

.ai-btn--disabled {
  opacity: 0.6;
}

.ai-hint {
  flex: 1;
  font-size: 22rpx;
  color: $lg-ink-3;
}

.mini-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid $lg-line;
}

.mini-field__label {
  font-size: 26rpx;
  color: $lg-ink-2;
}

.mini-field__input {
  flex: 1;
  text-align: right;
  font-size: 26rpx;
  color: $lg-ink;
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
