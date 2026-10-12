<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { listCategory } from "@/api/dish";
import { aiGenerateDishText, aiGenerateDishCover } from "@/api/ai";
import type { DishAiTextResult } from "@/api/ai";
import { submitProposal } from "@/api/proposal";
import { uploadImage } from "@/api/upload";
import GlassNavBar from "@/components/GlassNavBar.vue";
import CachedImage from "@/components/CachedImage.vue";
import type { Category } from "@/types";
import { useOrderNotifierLifecycle } from "@/utils/notify";

/** 用料行（带本地唯一 key，避免增删时输入框串位） */
interface IngredientRow {
  id: number;
  name: string;
  amount: string;
}

/** 文本行（做法 / 小贴士） */
interface TextRow {
  id: number;
  text: string;
}

const categories = ref<Category[]>([]);
const selectedCategoryIds = ref<number[]>([]);
const name = ref("");
const description = ref("");
const reason = ref("");
const image = ref("");
const tags = ref("");
const duration = ref("");
const level = ref("");
const ingredientRows = ref<IngredientRow[]>([]);
const stepRows = ref<TextRow[]>([]);
const tipRows = ref<TextRow[]>([]);
const submitting = ref(false);
/** AI 两步任务状态：idle 未开始 / loading 进行中 / done 已完成 / error 失败 / skip 已跳过 */
type StepState = "idle" | "loading" | "done" | "error" | "skip";
const textState = ref<StepState>("idle");
const coverState = ref<StepState>("idle");
/** 任一步进行中即视为生成中（用于锁定表单与按钮态） */
const aiLoading = computed(() => textState.value === "loading" || coverState.value === "loading");
useOrderNotifierLifecycle();

/** 行 key 自增序号 */
let rowSeq = 0;

function nextId(): number {
  return ++rowSeq;
}

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
  if (aiLoading.value) return;
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
  if (aiLoading.value) return;
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

function clearImage() {
  if (aiLoading.value) return;
  image.value = "";
}

/* ------- 结构化字段：增删与序列化 ------- */

function addIngredient() {
  if (aiLoading.value) return;
  ingredientRows.value.push({ id: nextId(), name: "", amount: "" });
}

function removeIngredient(index: number) {
  if (aiLoading.value) return;
  ingredientRows.value.splice(index, 1);
}

function addStep() {
  if (aiLoading.value) return;
  stepRows.value.push({ id: nextId(), text: "" });
}

function removeStep(index: number) {
  if (aiLoading.value) return;
  stepRows.value.splice(index, 1);
}

function moveStep(index: number, offset: number) {
  if (aiLoading.value) return;
  const target = index + offset;
  const list = stepRows.value;
  if (target < 0 || target >= list.length) return;
  const tmp = list[index];
  list[index] = list[target];
  list[target] = tmp;
}

function addTip() {
  if (aiLoading.value) return;
  tipRows.value.push({ id: nextId(), text: "" });
}

function removeTip(index: number) {
  if (aiLoading.value) return;
  tipRows.value.splice(index, 1);
}

/** 用料序列化为后端要的 JSON；全空返回空串 */
function serializeIngredients(): string {
  const rows = ingredientRows.value
    .map((r) => ({ name: r.name.trim(), amount: r.amount.trim() }))
    .filter((r) => r.name || r.amount);
  return rows.length ? JSON.stringify(rows) : "";
}

/** 文本行序列化为 JSON 数组；全空返回空串 */
function serializeTextRows(rows: TextRow[]): string {
  const list = rows.map((r) => r.text.trim()).filter(Boolean);
  return list.length ? JSON.stringify(list) : "";
}

/** 用料是否已有实质内容（只有空行不算） */
function hasIngredientContent(): boolean {
  return ingredientRows.value.some((r) => r.name.trim() || r.amount.trim());
}

/** 文本行是否已有实质内容（只有空行不算） */
function hasTextContent(rows: TextRow[]): boolean {
  return rows.some((r) => r.text.trim());
}

/** 解析 AI 返回的用料 JSON（对象数组或字符串数组都能兜底） */
function parseIngredientRows(raw?: string): IngredientRow[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr
        .map((item): { name: string; amount: string } => {
          if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            return { name: String(obj.name ?? ""), amount: String(obj.amount ?? "") };
          }
          return { name: String(item ?? ""), amount: "" };
        })
        .filter((r) => r.name || r.amount)
        .map((r) => ({ id: nextId(), name: r.name, amount: r.amount }));
    }
  } catch (e) {
    // 非 JSON 时忽略
  }
  return [];
}

/** 解析 AI 返回的字符串数组 JSON */
function parseTextRows(raw?: string): TextRow[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
        .map((text) => ({ id: nextId(), text }));
    }
  } catch (e) {
    // 非 JSON 时忽略
  }
  return [];
}

/* ------- 一键 AI：文本与封面两个接口并行 ------- */

/** 把文本补齐结果回填到表单（只填空字段） */
function applyTextResult(result: DishAiTextResult) {
  const fields = result.fields || {};
  if (fields.description && !description.value) description.value = fields.description;
  if (fields.tags && !tags.value) tags.value = fields.tags;
  if (fields.duration && !duration.value) duration.value = fields.duration;
  if (fields.level && !level.value) level.value = fields.level;
  if (fields.ingredients && !hasIngredientContent()) {
    ingredientRows.value = parseIngredientRows(fields.ingredients);
  }
  if (fields.steps && !hasTextContent(stepRows.value)) {
    stepRows.value = parseTextRows(fields.steps);
  }
  if (fields.tips && !hasTextContent(tipRows.value)) {
    tipRows.value = parseTextRows(fields.tips);
  }
  if (result.matchedCategoryIds && result.matchedCategoryIds.length && !selectedCategoryIds.value.length) {
    selectedCategoryIds.value = result.matchedCategoryIds;
  }
  if (result.unmatchedCategoryNames && result.unmatchedCategoryNames.length) {
    uni.showToast({ title: `未匹配分类：${result.unmatchedCategoryNames.join("、")}`, icon: "none" });
  }
}

/** 一键 AI：文本与封面并行请求，各自回填；已填封面时跳过封面请求 */
async function handleAiGenerate() {
  const dishName = name.value.trim();
  if (!dishName) {
    uni.showToast({ title: "请先填写菜名", icon: "none" });
    return;
  }
  if (aiLoading.value) {
    return;
  }

  const payload = {
    name: dishName,
    current: {
      categoryIds: selectedCategoryIds.value.length ? selectedCategoryIds.value : undefined,
      description: description.value || undefined,
      cover: image.value || undefined,
      tags: tags.value || undefined,
      duration: duration.value || undefined,
      level: level.value || undefined,
      ingredients: serializeIngredients() || undefined,
      steps: serializeTextRows(stepRows.value) || undefined,
      tips: serializeTextRows(tipRows.value) || undefined,
    },
  };

  const needCover = !image.value;
  textState.value = "loading";
  coverState.value = needCover ? "loading" : "skip";

  const textTask = aiGenerateDishText(payload)
    .then((result) => {
      applyTextResult(result);
      textState.value = "done";
    })
    .catch(() => {
      textState.value = "error";
    });

  const coverTask = needCover
    ? aiGenerateDishCover(payload)
        .then((result) => {
          if (result.cover) {
            image.value = result.cover;
            coverState.value = "done";
          } else {
            coverState.value = "error";
            if (result.imageError) {
              uni.showToast({ title: `封面图未生成：${result.imageError}`, icon: "none" });
            }
          }
        })
        .catch(() => {
          coverState.value = "error";
        })
    : Promise.resolve();

  await Promise.allSettled([textTask, coverTask]);
  finishAiSummary();
}

/** 两步都结束后汇总提示（放在函数里读取状态，避免 TS 把赋值后的类型收窄） */
function finishAiSummary() {
  if (textState.value === "done" && coverState.value !== "error") {
    uni.showToast({ title: "已补齐空字段", icon: "none" });
  }
}

/** 进度行图标 */
function stepIcon(state: StepState): string {
  if (state === "done") return "✓";
  if (state === "error") return "✕";
  if (state === "skip") return "—";
  return "●";
}

/** 进度行文案 */
function stepText(state: StepState): string {
  const map: Record<StepState, string> = {
    idle: "等待中",
    loading: "进行中",
    done: "已完成",
    error: "失败",
    skip: "已跳过",
  };
  return map[state];
}

/** 进度行样式 */
function stepClass(state: StepState): Record<string, boolean> {
  return {
    "ai-step--active": state === "loading",
    "ai-step--done": state === "done",
    "ai-step--error": state === "error",
  };
}

async function submit() {
  if (aiLoading.value) return;
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
      ingredients: serializeIngredients() || undefined,
      steps: serializeTextRows(stepRows.value) || undefined,
      tips: serializeTextRows(tipRows.value) || undefined,
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
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="提交新菜" />

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

    <!-- 真实进度：文本与封面两个接口并行 -->
    <view v-if="aiLoading" class="ai-progress">
      <text class="ai-progress__title">正在 AI 生成（共 2 项，可并行）</text>
      <view class="ai-step" :class="stepClass(textState)">
        <text class="ai-step__dot">{{ stepIcon(textState) }}</text>
        <text class="ai-step__text">菜品信息</text>
        <text class="ai-step__state">{{ stepText(textState) }}</text>
      </view>
      <view class="ai-step" :class="stepClass(coverState)">
        <text class="ai-step__dot">{{ stepIcon(coverState) }}</text>
        <text class="ai-step__text">封面图</text>
        <text class="ai-step__state">{{ stepText(coverState) }}</text>
      </view>
      <text class="ai-progress__tip">图片生成较慢，请稍候，生成期间请勿修改下方内容</text>
    </view>

    <!-- 下方表单：AI 生成期间整体锁定 -->
    <view class="form-area" :class="{ 'form-area--locked': aiLoading }">
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
          :disabled="aiLoading"
          placeholder="这道菜大概是什么味道、什么做法"
          placeholder-class="ph"
        />
      </view>

      <view class="card">
        <text class="section-title">参考图（选填）</text>
        <view class="upl">
          <view v-if="image" class="upl__box">
            <view class="upl__ph">封面生成中…</view>
            <CachedImage class="upl__img" :src="image" mode="aspectFill" :retry="6" @click="clearImage" />
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
          :disabled="aiLoading"
          placeholder="这周想吃点辣的…"
          placeholder-class="ph"
        />
      </view>

      <view class="card">
        <text class="section-title">更多信息（选填，可由一键 AI 生成）</text>
        <view class="mini-field">
          <text class="mini-field__label">标签</text>
          <input v-model="tags" class="mini-field__input" :disabled="aiLoading" placeholder="逗号分隔，如 家常,下饭" placeholder-class="ph" />
        </view>
        <view class="mini-field">
          <text class="mini-field__label">耗时</text>
          <input v-model="duration" class="mini-field__input" :disabled="aiLoading" placeholder="如 90 分钟" placeholder-class="ph" />
        </view>
        <view class="mini-field">
          <text class="mini-field__label">难度</text>
          <input v-model="level" class="mini-field__input" :disabled="aiLoading" placeholder="如 中等" placeholder-class="ph" />
        </view>

        <!-- 用料：名称 + 用量，可增删 -->
        <view class="sub-block">
          <view class="sub-block__head">
            <text class="sub-block__title">用料</text>
            <text class="sub-block__add" @click="addIngredient">＋ 添加</text>
          </view>
          <view v-for="(row, i) in ingredientRows" :key="row.id" class="ing-row">
            <input v-model="row.name" class="ing-row__name" :disabled="aiLoading" placeholder="名称" placeholder-class="ph" />
            <input v-model="row.amount" class="ing-row__amount" :disabled="aiLoading" placeholder="用量" placeholder-class="ph" />
            <text class="row-del" @click="removeIngredient(i)">✕</text>
          </view>
          <text v-if="!ingredientRows.length" class="sub-block__empty">暂无，可点右上角添加或由 AI 生成</text>
        </view>

        <!-- 做法：有序步骤，可增删、可上下移动 -->
        <view class="sub-block">
          <view class="sub-block__head">
            <text class="sub-block__title">做法</text>
            <text class="sub-block__add" @click="addStep">＋ 添加</text>
          </view>
          <view v-for="(row, i) in stepRows" :key="row.id" class="step-row">
            <text class="step-row__no">{{ i + 1 }}</text>
            <textarea
              v-model="row.text"
              class="step-row__input"
              :disabled="aiLoading"
              auto-height
              placeholder="这一步怎么做"
              placeholder-class="ph"
            />
            <view class="step-row__ops">
              <text class="row-op" @click="moveStep(i, -1)">↑</text>
              <text class="row-op" @click="moveStep(i, 1)">↓</text>
              <text class="row-del" @click="removeStep(i)">✕</text>
            </view>
          </view>
          <text v-if="!stepRows.length" class="sub-block__empty">暂无，可点右上角添加或由 AI 生成</text>
        </view>

        <!-- 小贴士：列表，可增删 -->
        <view class="sub-block">
          <view class="sub-block__head">
            <text class="sub-block__title">小贴士</text>
            <text class="sub-block__add" @click="addTip">＋ 添加</text>
          </view>
          <view v-for="(row, i) in tipRows" :key="row.id" class="tip-row">
            <input v-model="row.text" class="tip-row__input" :disabled="aiLoading" placeholder="小贴士" placeholder-class="ph" />
            <text class="row-del" @click="removeTip(i)">✕</text>
          </view>
          <text v-if="!tipRows.length" class="sub-block__empty">暂无，可点右上角添加或由 AI 生成</text>
        </view>
      </view>

      <view class="submit" :class="{ 'submit--disabled': submitting || aiLoading }" @click="submit">
        {{ submitting ? "提交中…" : "提交提案" }}
      </view>
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
  position: relative;
  width: 150rpx;
  height: 150rpx;
  border-radius: 18rpx;
  overflow: hidden;
  background: $lg-fill-2;
}

/* 占位：AI 封面在上传成功前是 404，图片加载出来后自然盖住它 */
.upl__ph {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12rpx;
  text-align: center;
  font-size: 20rpx;
  line-height: 1.3;
  color: $lg-ink-3;
}

.upl__img {
  position: relative;
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

/* 展示性进度 */
.ai-progress {
  background: $lg-fill-2;
  border: 1rpx solid $lg-border;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
  margin-bottom: 16rpx;
}

.ai-progress__title {
  display: block;
  font-size: 24rpx;
  color: $lg-ink-2;
  margin-bottom: 12rpx;
}

.ai-progress__tip {
  display: block;
  font-size: 22rpx;
  color: $lg-ink-3;
  margin-top: 12rpx;
}

.ai-step {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 6rpx 0;
}

.ai-step__dot {
  width: 32rpx;
  font-size: 24rpx;
  color: $lg-ink-3;
}

.ai-step__text {
  font-size: 26rpx;
  color: $lg-ink-3;
}

.ai-step__state {
  margin-left: auto;
  font-size: 22rpx;
  color: $lg-ink-3;
}

.ai-step--active .ai-step__dot,
.ai-step--active .ai-step__text,
.ai-step--active .ai-step__state {
  color: $lg-accent;
  font-weight: 600;
}

.ai-step--done .ai-step__dot,
.ai-step--done .ai-step__text,
.ai-step--done .ai-step__state {
  color: $lg-ink-2;
}

.ai-step--error .ai-step__dot,
.ai-step--error .ai-step__text,
.ai-step--error .ai-step__state {
  color: #e5484d;
}

/* 生成期间锁定下方表单：拦截交互并弱化视觉 */
.form-area--locked {
  pointer-events: none;
}

.form-area--locked .field,
.form-area--locked .card,
.form-area--locked .submit {
  opacity: 0.6;
}

/* 结构化子块 */
.sub-block {
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid $lg-line;
}

.sub-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.sub-block__title {
  font-size: 26rpx;
  color: $lg-ink-2;
  font-weight: 600;
}

.sub-block__add {
  font-size: 24rpx;
  color: $lg-accent;
  padding: 4rpx 12rpx;
}

.sub-block__empty {
  display: block;
  font-size: 22rpx;
  color: $lg-ink-3;
  padding: 8rpx 0;
}

.ing-row,
.tip-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 10rpx 0;
}

.ing-row__name {
  flex: 1;
  font-size: 26rpx;
  color: $lg-ink;
}

.ing-row__amount {
  width: 200rpx;
  font-size: 26rpx;
  color: $lg-ink;
}

.tip-row__input {
  flex: 1;
  font-size: 26rpx;
  color: $lg-ink;
}

.step-row {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 10rpx 0;
}

.step-row__no {
  width: 40rpx;
  padding-top: 6rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: $lg-accent;
}

.step-row__input {
  flex: 1;
  min-height: 60rpx;
  font-size: 26rpx;
  color: $lg-ink;
}

.step-row__ops {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}

.row-op {
  padding: 0 8rpx;
  font-size: 24rpx;
  color: $lg-ink-3;
}

.row-del {
  padding: 4rpx 8rpx;
  font-size: 24rpx;
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
