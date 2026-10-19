<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { computed, reactive, ref } from "vue";
import { aiUpdateDish, getDish, listCategory, updateDish } from "@/api/dish";
import { uploadImage } from "@/api/upload";
import CachedImage from "@/components/CachedImage.vue";
import GlassButton from "@/components/GlassButton.vue";
import GlassCard from "@/components/GlassCard.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import { useUserStore } from "@/store/user";
import type { Category, Dish, Ingredient } from "@/types";

const userStore = useUserStore();

/** 编辑页仅对厨师与家庭管理员开放 */
const canEdit = computed(() => userStore.isChef || userStore.isManager);

const dishId = ref(0);
const loading = ref(true);
const submitting = ref(false);
const uploading = ref(false);

const categories = ref<Category[]>([]);
const selectedCategoryIds = ref<number[]>([]);
/** 菜品归属：0=公共菜谱，公共菜只能挂公共分类 */
const dishDeptId = ref<number | undefined>(undefined);

/** 分类候选项：公共菜只列公共分类，家庭私有菜列公共 + 本家庭分类 */
const categoryOptions = computed(() =>
  dishDeptId.value === 0 ? categories.value.filter((cat) => (cat.deptId ?? 0) === 0) : categories.value,
);

/** 表单：文本类字段直接双向绑定 */
const form = reactive({
  name: "",
  cover: "",
  description: "",
  duration: "",
  level: "",
  serve: "",
  kcal: "",
  status: "0",
});

/** 标签：逗号分隔字符串在页面内以可增删的标签项维护 */
const tags = ref<string[]>([]);
const tagInput = ref("");

/** 用料：名称 + 用量 */
const ingredients = ref<Ingredient[]>([]);

/** 做法与小贴士：动态文本行 */
const steps = ref<string[]>([]);
const tips = ref<string[]>([]);

/** AI 更新：用户粘贴的完整做法 */
const aiText = ref("");
const aiUpdating = ref(false);

onLoad(async (options) => {
  dishId.value = Number(options?.dishId || 0);
  if (!dishId.value) {
    uni.showToast({ title: "菜品不存在", icon: "none" });
    goBack();
    return;
  }
  if (!userStore.user) {
    try {
      await userStore.fetchInfo();
    } catch (e) {
      uni.showToast({ title: "身份信息加载失败", icon: "none" });
      goBack();
      return;
    }
  }
  if (!canEdit.value) {
    uni.showToast({ title: "无权编辑菜品", icon: "none" });
    goBack();
    return;
  }
  await Promise.all([loadCategories(), loadDish()]);
});

/** 返回上一页：页面栈只有一层时回到点餐区 */
function goBack() {
  setTimeout(() => {
    if (getCurrentPages().length > 1) {
      uni.navigateBack({ delta: 1 });
    } else {
      uni.reLaunch({ url: "/pages/menu/index" });
    }
  }, 600);
}

async function loadCategories() {
  try {
    const res = await listCategory();
    categories.value = res.rows;
  } catch (e) {
    categories.value = [];
  }
}

async function loadDish() {
  loading.value = true;
  try {
    const dish = await getDish(dishId.value);
    applyDish(dish);
  } catch (e) {
    uni.showToast({ title: "菜品加载失败", icon: "none" });
    goBack();
  } finally {
    loading.value = false;
  }
}

/** 用菜品数据回填表单（首次加载与 AI 更新后共用） */
function applyDish(dish: Dish) {
  form.name = dish.name || "";
  form.cover = dish.cover || "";
  form.description = dish.description || "";
  form.duration = dish.duration || "";
  form.level = dish.level || "";
  form.serve = dish.serve || "";
  form.kcal = dish.kcal || "";
  form.status = dish.status || "0";
  dishDeptId.value = dish.deptId;
  selectedCategoryIds.value = [...(dish.categoryIds || [])];
  tags.value = (dish.tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => !!tag);
  const parsedIngredients = parseJson<unknown>(dish.ingredients, []);
  ingredients.value = (Array.isArray(parsedIngredients) ? parsedIngredients : [])
    .filter((item): item is Ingredient => !!item && typeof item === "object")
    .map((item) => ({ name: String(item.name ?? ""), amount: String(item.amount ?? "") }))
    .filter((item) => !!item.name || !!item.amount);
  const parsedSteps = parseJson<unknown>(dish.steps, []);
  steps.value = (Array.isArray(parsedSteps) ? parsedSteps : []).map((step) => String(step));
  const parsedTips = parseJson<unknown>(dish.tips, []);
  tips.value = (Array.isArray(parsedTips) ? parsedTips : []).map((tip) => String(tip));
}

/** 解析数据库中的 JSON 文本；解析失败按空列表处理，不阻断其它字段编辑 */
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

/** 分类多选：点一下切换选中态 */
function toggleCategory(categoryId: number) {
  const idx = selectedCategoryIds.value.indexOf(categoryId);
  if (idx >= 0) {
    selectedCategoryIds.value.splice(idx, 1);
  } else {
    selectedCategoryIds.value.push(categoryId);
  }
}

function isCategorySelected(categoryId: number): boolean {
  return selectedCategoryIds.value.includes(categoryId);
}

/** 添加标签：去空白、去重 */
function addTag() {
  const tag = tagInput.value.trim();
  if (!tag) {
    return;
  }
  if (!tags.value.includes(tag)) {
    tags.value.push(tag);
  }
  tagInput.value = "";
}

function removeTag(index: number) {
  tags.value.splice(index, 1);
}

function addIngredient() {
  ingredients.value.push({ name: "", amount: "" });
}

function removeIngredient(index: number) {
  ingredients.value.splice(index, 1);
}

function addStep() {
  steps.value.push("");
}

function removeStep(index: number) {
  steps.value.splice(index, 1);
}

/** 步骤上移：保持做法顺序可调整 */
function moveStepUp(index: number) {
  if (index <= 0) {
    return;
  }
  const list = [...steps.value];
  [list[index - 1], list[index]] = [list[index], list[index - 1]];
  steps.value = list;
}

function addTip() {
  tips.value.push("");
}

function removeTip(index: number) {
  tips.value.splice(index, 1);
}

/** 选择并上传封面：返回对象存储永久地址 */
function chooseCover() {
  if (uploading.value) {
    return;
  }
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (res) => {
      const path = res.tempFilePaths?.[0];
      if (!path) {
        return;
      }
      uploading.value = true;
      try {
        const url = await uploadImage(path);
        if (url) {
          form.cover = url;
          uni.showToast({ title: "封面已上传", icon: "none" });
        }
      } catch (e) {
        // 失败原因已由请求层提示
      } finally {
        uploading.value = false;
      }
    },
  });
}

/** 序列化动态列表：过滤空行；空列表写 "[]"，避免 MySQL JSON 列拒绝空字符串 */
function serializeSteps(list: string[]): string {
  const cleaned = list.map((item) => item.trim()).filter((item) => !!item);
  return JSON.stringify(cleaned);
}

/** 序列化用料：过滤名称与用量都为空的占位行；空列表写 "[]" */
function serializeIngredients(list: Ingredient[]): string {
  const cleaned = list
    .map((item) => ({ name: (item.name || "").trim(), amount: (item.amount || "").trim() }))
    .filter((item) => item.name || item.amount);
  return JSON.stringify(cleaned);
}

async function save() {
  const name = form.name.trim();
  if (!name) {
    uni.showToast({ title: "请填写菜名", icon: "none" });
    return;
  }
  if (submitting.value) {
    return;
  }
  submitting.value = true;
  try {
    await updateDish({
      dishId: dishId.value,
      name,
      cover: form.cover,
      categoryIds: [...selectedCategoryIds.value],
      description: form.description,
      tags: tags.value.join(","),
      duration: form.duration,
      level: form.level,
      serve: form.serve,
      kcal: form.kcal,
      ingredients: serializeIngredients(ingredients.value),
      steps: serializeSteps(steps.value),
      tips: serializeSteps(tips.value),
      status: form.status,
    });
    uni.showToast({ title: "保存成功", icon: "none" });
    setTimeout(() => {
      uni.navigateBack({ delta: 1 });
    }, 600);
  } catch (e) {
    // 失败原因已由请求层提示；表单内容保留
  } finally {
    submitting.value = false;
  }
}

/** AI 更新：把完整做法交给后端提取字段并直接落库，成功后用最新菜品刷新表单 */
async function aiUpdate() {
  const text = aiText.value.trim();
  if (!text) {
    uni.showToast({ title: "请先输入这道菜的完整做法", icon: "none" });
    return;
  }
  if (aiUpdating.value) {
    return;
  }
  aiUpdating.value = true;
  try {
    const result = await aiUpdateDish({ dishId: dishId.value, text });
    if (result?.dish) {
      applyDish(result.dish);
    }
    const count = Object.keys(result?.fields || {}).length;
    uni.showToast({
      title: count ? "AI 已更新并保存" : "未提取到可用内容，菜品未变",
      icon: "none",
    });
  } catch (e) {
    // 失败原因已由请求层提示；表单内容保持调用前状态
  } finally {
    aiUpdating.value = false;
  }
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="编辑菜品" />

    <view v-if="loading" class="empty">加载中…</view>

    <template v-else>
      <view v-if="dishDeptId === 0" class="public-tip">
        这是公共菜谱，修改会对所有家庭生效，请谨慎调整
      </view>
      <GlassCard class="cover-card">
        <view class="cover" @click="chooseCover">
          <CachedImage v-if="form.cover" class="cover__img" :src="form.cover" mode="aspectFill" />
          <view v-else class="cover__ph">
            <text class="cover__ph-text">点击上传封面</text>
          </view>
          <view v-if="uploading" class="cover__mask">
            <text class="cover__mask-text">上传中</text>
          </view>
        </view>
        <text class="cover__hint">{{ uploading ? "正在上传…" : "点击封面可更换图片" }}</text>
      </GlassCard>

      <GlassCard class="form">
        <view class="field">
          <text class="field__label">菜名</text>
          <input v-model="form.name" class="field__input" maxlength="128" placeholder="必填" placeholder-class="ph" />
        </view>
        <view class="field field--col">
          <text class="field__label">简介</text>
          <textarea
            v-model="form.description"
            class="field__textarea"
            auto-height
            maxlength="500"
            placeholder="一句话介绍"
            placeholder-class="ph"
          />
        </view>
        <view class="field">
          <text class="field__label">耗时</text>
          <input v-model="form.duration" class="field__input" maxlength="64" placeholder="如 90 分钟" placeholder-class="ph" />
        </view>
        <view class="field">
          <text class="field__label">难度</text>
          <input v-model="form.level" class="field__input" maxlength="32" placeholder="如 中等" placeholder-class="ph" />
        </view>
        <view class="field">
          <text class="field__label">份量</text>
          <input v-model="form.serve" class="field__input" maxlength="64" placeholder="如 3 人份" placeholder-class="ph" />
        </view>
        <view class="field">
          <text class="field__label">热量</text>
          <input v-model="form.kcal" class="field__input" maxlength="64" placeholder="如 520 千卡" placeholder-class="ph" />
        </view>
        <view class="status-row">
          <text class="field__label">状态</text>
          <view class="status-list">
            <view
              class="status-chip"
              :class="{ 'status-chip--on': form.status === '0' }"
              @click="form.status = '0'"
            >上架</view>
            <view
              class="status-chip"
              :class="{ 'status-chip--on': form.status === '1' }"
              @click="form.status = '1'"
            >下架</view>
          </view>
        </view>
      </GlassCard>

      <GlassCard class="section">
        <text class="section-title">分类</text>
        <view class="cats">
          <text
            v-for="cat in categoryOptions"
            :key="cat.categoryId"
            class="cat"
            :class="{ 'cat--on': isCategorySelected(cat.categoryId) }"
            @click="toggleCategory(cat.categoryId)"
          >{{ cat.name }}</text>
        </view>
        <text v-if="!categoryOptions.length" class="empty-line">暂无分类</text>
      </GlassCard>

      <GlassCard class="section">
        <text class="section-title">标签</text>
        <view class="tags">
          <view v-for="(tag, index) in tags" :key="tag" class="tag">
            <text class="tag__text">{{ tag }}</text>
            <text class="tag__del" @click="removeTag(index)">×</text>
          </view>
        </view>
        <view class="add-row">
          <input
            v-model="tagInput"
            class="add-row__input"
            maxlength="32"
            placeholder="输入标签后添加"
            placeholder-class="ph"
            @confirm="addTag"
          />
          <view class="add-row__btn" @click="addTag">添加</view>
        </view>
      </GlassCard>

      <GlassCard class="section">
        <text class="section-title">用料</text>
        <view v-for="(item, index) in ingredients" :key="index" class="ingredient">
          <input v-model="item.name" class="ingredient__name" maxlength="64" placeholder="名称" placeholder-class="ph" />
          <input v-model="item.amount" class="ingredient__amount" maxlength="64" placeholder="用量" placeholder-class="ph" />
          <text class="row-del" @click="removeIngredient(index)">×</text>
        </view>
        <view class="add-btn" @click="addIngredient">+ 添加用料</view>
      </GlassCard>

      <GlassCard class="section">
        <text class="section-title">做法</text>
        <view v-for="(step, index) in steps" :key="index" class="step-row">
          <text class="step-row__index">{{ index + 1 }}</text>
          <textarea
            v-model="steps[index]"
            class="step-row__input"
            auto-height
            maxlength="500"
            :placeholder="`第 ${index + 1} 步`"
            placeholder-class="ph"
          />
          <view class="step-row__ops">
            <text v-if="index > 0" class="row-op" @click="moveStepUp(index)">↑</text>
            <text class="row-del" @click="removeStep(index)">×</text>
          </view>
        </view>
        <view class="add-btn" @click="addStep">+ 添加步骤</view>
      </GlassCard>

      <GlassCard class="section">
        <text class="section-title">小贴士</text>
        <view v-for="(tip, index) in tips" :key="index" class="tip-row">
          <textarea
            v-model="tips[index]"
            class="tip-row__input"
            auto-height
            maxlength="300"
            placeholder="注意事项"
            placeholder-class="ph"
          />
          <text class="row-del" @click="removeTip(index)">×</text>
        </view>
        <view class="add-btn" @click="addTip">+ 添加小贴士</view>
      </GlassCard>

      <GlassCard class="section ai">
        <text class="section-title">AI 更新</text>
        <text class="ai__hint">粘贴这道菜的完整做法，AI 会提取简介、标签、用料、做法等并直接保存</text>
        <textarea
          v-model="aiText"
          class="ai__input"
          maxlength="5000"
          placeholder="例如：五花肉切块焯水，冰糖炒糖色……"
          placeholder-class="ph"
        />
        <GlassButton class="ai__btn" variant="ghost" :disabled="aiUpdating" @click="aiUpdate">
          {{ aiUpdating ? "AI 处理中…" : "AI 更新并保存" }}
        </GlassButton>
      </GlassCard>

      <GlassButton class="save-btn" :disabled="submitting" @click="save">
        {{ submitting ? "保存中…" : "保存" }}
      </GlassButton>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.empty {
  padding: 80rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: $lg-ink-3;
}

.empty-line {
  display: block;
  font-size: 22rpx;
  color: $lg-ink-3;
  padding: 8rpx 0;
}

/* 公共菜编辑风险提示 */
.public-tip {
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  background-color: $lg-warn-soft;
  color: $lg-ink-2;
  font-size: 24rpx;
  line-height: 1.5;
}

.cover-card {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cover {
  position: relative;
  width: 100%;
  height: 320rpx;
  border-radius: 20rpx;
  overflow: hidden;
  background: linear-gradient(150deg, $lg-accent-2, $lg-accent);
}

.cover__img {
  width: 100%;
  height: 100%;
}

.cover__ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover__ph-text {
  font-size: 26rpx;
  color: #fff;
}

.cover__mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover__mask-text {
  font-size: 24rpx;
  color: #fff;
}

.cover__hint {
  margin-top: 16rpx;
  font-size: 22rpx;
  color: $lg-ink-3;
}

.form,
.section {
  margin-top: 24rpx;
}

.field {
  display: flex;
  align-items: center;
  padding: 18rpx 0;
  border-bottom: 1rpx solid $lg-line;
}

.field:last-child {
  border-bottom: none;
}

.field__label {
  width: 120rpx;
  flex: 0 0 120rpx;
  font-size: 28rpx;
  color: $lg-ink;
}

.field__input {
  flex: 1;
  font-size: 28rpx;
  color: $lg-ink;
}

/* 多行字段：标签在上、输入框在下 */
.field--col {
  flex-direction: column;
  align-items: stretch;
  gap: 12rpx;
}

.field__textarea {
  width: 100%;
  min-height: 120rpx;
  font-size: 28rpx;
  line-height: 1.5;
  color: $lg-ink;
}

.status-row {
  display: flex;
  align-items: center;
  padding-top: 18rpx;
}

.status-list {
  display: flex;
  gap: 16rpx;
}

.status-chip {
  padding: 10rpx 28rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: $lg-ink-2;
  background: $lg-fill-2;
  border: 1rpx solid $lg-border;
}

.status-chip--on {
  color: #fff;
  font-weight: 700;
  border-color: transparent;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
}

.section-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: $lg-ink;
  margin-bottom: 16rpx;
}

.cats,
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
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

.tag {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  background-color: $lg-accent-soft;
}

.tag__text {
  font-size: 24rpx;
  color: $lg-accent;
}

.tag__del {
  font-size: 28rpx;
  line-height: 1;
  color: $lg-ink-3;
}

.add-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 18rpx;
}

.add-row__input {
  flex: 1;
  height: 68rpx;
  padding: 0 20rpx;
  border-radius: 16rpx;
  background: $lg-fill-2;
  border: 1rpx solid $lg-border;
  font-size: 26rpx;
  color: $lg-ink;
}

.add-row__btn {
  flex: 0 0 auto;
  height: 68rpx;
  line-height: 68rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: $lg-accent;
  background: $lg-fill-2;
  border: 1rpx solid $lg-accent-border;
}

.ingredient {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 12rpx 0;
  border-bottom: 1rpx solid $lg-line;
}

.ingredient__name {
  flex: 1.2;
  font-size: 26rpx;
  color: $lg-ink;
}

.ingredient__amount {
  flex: 1;
  font-size: 26rpx;
  color: $lg-ink;
}

.row-del {
  flex: 0 0 auto;
  width: 48rpx;
  height: 48rpx;
  line-height: 48rpx;
  text-align: center;
  font-size: 30rpx;
  color: $lg-ink-3;
}

.row-op {
  flex: 0 0 auto;
  width: 48rpx;
  height: 48rpx;
  line-height: 48rpx;
  text-align: center;
  font-size: 26rpx;
  color: $lg-accent;
}

.step-row,
.tip-row {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 12rpx 0;
  border-bottom: 1rpx solid $lg-line;
}

.step-row__index {
  flex: 0 0 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  border-radius: 50%;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  color: #fff;
  font-size: 20rpx;
  font-weight: 700;
  margin-top: 8rpx;
}

.step-row__input,
.tip-row__input {
  flex: 1;
  min-height: 60rpx;
  font-size: 26rpx;
  line-height: 1.5;
  color: $lg-ink;
}

.step-row__ops {
  display: flex;
  align-items: center;
}

.add-btn {
  margin-top: 18rpx;
  height: 68rpx;
  line-height: 68rpx;
  text-align: center;
  border-radius: 999rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: $lg-accent;
  background: $lg-fill-2;
  border: 1rpx dashed $lg-accent-border;
}

.ai__hint {
  display: block;
  font-size: 22rpx;
  line-height: 1.5;
  color: $lg-ink-3;
  margin-bottom: 16rpx;
}

.ai__input {
  width: 100%;
  min-height: 220rpx;
  padding: 20rpx;
  box-sizing: border-box;
  border-radius: 16rpx;
  background: $lg-fill-2;
  border: 1rpx solid $lg-border;
  font-size: 26rpx;
  line-height: 1.5;
  color: $lg-ink;
}

.ai__btn {
  margin-top: 20rpx;
}

.save-btn {
  margin-top: 32rpx;
}

.ph {
  color: $lg-ink-3;
}
</style>
