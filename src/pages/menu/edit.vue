<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { computed, reactive, ref } from "vue";
import { aiUpdateDish, deleteDish, getDish, listCategory, regenerateDishCover, updateDish } from "@/api/dish";
import { uploadImage } from "@/api/upload";
import CachedImage from "@/components/CachedImage.vue";
import GlassButton from "@/components/GlassButton.vue";
import GlassCard from "@/components/GlassCard.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import { useUserStore } from "@/store/user";
import type { Category, Dish, Ingredient } from "@/types";
import { clearMenuCache, markMenuDirty } from "@/utils/menuCache";

const userStore = useUserStore();

/** 编辑页仅对厨师与家庭管理员开放 */
const canEdit = computed(
  () => userStore.isChef || userStore.isManager || userStore.permissions.includes("meal:dish:edit"),
);
/** 删除仍需后端 meal:dish:remove 权限，不能只凭角色显示 */
const canDelete = computed(() => userStore.permissions.includes("meal:dish:remove"));

const dishId = ref(0);
const loading = ref(true);
const submitting = ref(false);
const uploading = ref(false);
const deleting = ref(false);
const regenerating = ref(false);
/** 图片操作底部弹层：上传 / 重新生成 */
const imageActionVisible = ref(false);
/** 重新生成封面的描述输入弹层 */
const regenerateVisible = ref(false);
const imageDescription = ref("");

const categories = ref<Category[]>([]);
const selectedCategoryIds = ref<number[]>([]);
/** 菜品归属：0=公共菜谱，公共菜只能挂公共分类 */
const dishDeptId = ref<number | undefined>(undefined);

/** 分类候选项：公共菜只列公共分类，家庭私有菜列公共 + 本家庭分类 */
const categoryOptions = computed(() =>
  dishDeptId.value === 0 ? categories.value.filter((cat) => (cat.deptId ?? 0) === 0) : categories.value,
);

/** 唯一主类：单选值（分类候选固定为 9 个公共主类） */
const selectedCategoryId = computed(() =>
  selectedCategoryIds.value.length ? selectedCategoryIds.value[0] : undefined,
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
    // 详情页跳编辑时权限缓存可能尚未回填；拿到菜品后后台刷新一次身份，删除按钮随之出现
    if (!userStore.permissions.length) {
      userStore.refreshInfo();
    }
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

/** 分类单选：点一下选中该主类；再次点击不取消（避免误清空） */
function selectCategory(categoryId: number) {
  selectedCategoryIds.value = [categoryId];
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

/** 打开封面操作面板：上传新图或按描述重新生成 */
function openImageActions() {
  if (uploading.value || regenerating.value) {
    return;
  }
  imageActionVisible.value = true;
}

/** 从相册/相机选择并上传封面 */
function chooseCover() {
  imageActionVisible.value = false;
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

/** 打开图片描述输入弹层 */
function openRegenerateDialog() {
  imageActionVisible.value = false;
  if (!form.name.trim()) {
    uni.showToast({ title: "请先填写菜名", icon: "none" });
    return;
  }
  imageDescription.value = "";
  regenerateVisible.value = true;
}

/**
 * 根据菜名与图片描述重新生成封面。
 *
 * <p>只回填表单，不自动保存；用户确认效果后再点右上角保存。</p>
 */
async function regenerateCover() {
  const name = form.name.trim();
  const description = imageDescription.value.trim();
  if (!name) {
    uni.showToast({ title: "请先填写菜名", icon: "none" });
    return;
  }
  if (!description) {
    uni.showToast({ title: "请填写图片描述", icon: "none" });
    return;
  }
  if (regenerating.value) {
    return;
  }
  regenerating.value = true;
  try {
    const result = await regenerateDishCover({ name, imageDescription: description });
    if (!result.cover) {
      uni.showToast({ title: result.imageError || "图片生成失败", icon: "none" });
      return;
    }
    form.cover = result.cover;
    regenerateVisible.value = false;
    uni.showToast({ title: "封面已重新生成，请保存", icon: "none" });
  } catch (e) {
    // 请求层已提示具体原因，弹层保留输入便于重试
  } finally {
    regenerating.value = false;
  }
}

/** 删除菜品：二次确认后调用后端逻辑删除，并让点餐区下次重新拉取 */
async function removeDish() {
  if (!canDelete.value || deleting.value) {
    return;
  }
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "删除菜品",
      content: `确定删除「${form.name || "这道菜"}」吗？历史订单快照不受影响。`,
      confirmText: "删除",
      confirmColor: "#D92D20",
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) {
    return;
  }
  deleting.value = true;
  try {
    await deleteDish(dishId.value);
    markMenuDirty();
    clearMenuCache();
    uni.showToast({ title: "菜品已删除", icon: "none" });
    setTimeout(() => {
      const pages = getCurrentPages();
      // 从详情页进入时退两层回菜单；直接进入时只退一层
      uni.navigateBack({ delta: pages.length > 2 ? 2 : 1 });
    }, 600);
  } catch (e) {
    // 失败原因已由请求层提示
  } finally {
    deleting.value = false;
  }
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
    // 上下架或详情变更后，点餐区下次显示时强制重拉，避免本地缓存继续展示已下架的菜
    markMenuDirty();
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

/** AI 更新：提交到服务端异步执行，立即返回详情页；更新结果稍后刷新可见 */
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
    await aiUpdateDish({ dishId: dishId.value, text });
    // 标记该菜品有待完成的异步 AI 更新，详情页返回后会短轮询刷新
    uni.setStorageSync("meal-dish-ai-pending", dishId.value);
    uni.showToast({ title: "已提交，AI 正在后台更新", icon: "none" });
    setTimeout(() => {
      uni.navigateBack({ delta: 1 });
    }, 700);
  } catch (e) {
    // 失败原因已由请求层提示；表单内容保持调用前状态
    aiUpdating.value = false;
  }
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="编辑菜品">
      <template #right>
        <view
          v-if="!loading"
          class="nav-save"
          :class="{ 'nav-save--disabled': submitting }"
          @click="save"
        >{{ submitting ? "保存中…" : "保存" }}</view>
      </template>
    </GlassNavBar>

    <view v-if="loading" class="empty">加载中…</view>

    <template v-else>
      <view v-if="dishDeptId === 0" class="public-tip">
        这是公共菜谱，修改会对所有家庭生效，请谨慎调整
      </view>
      <GlassCard class="cover-card">
        <view class="cover" @click="openImageActions">
          <CachedImage v-if="form.cover" class="cover__img" :src="form.cover" mode="aspectFill" />
          <view v-else class="cover__ph">
            <text class="cover__ph-text">点击上传封面</text>
          </view>
          <view v-if="uploading" class="cover__mask">
            <text class="cover__mask-text">上传中</text>
          </view>
          <view v-else class="cover__edit-tip">
            <text class="cover__edit-label">{{ regenerating ? "生成中…" : "编辑图片" }}</text>
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
        <text class="section-title">主类</text>
        <view class="cats">
          <text
            v-for="cat in categoryOptions"
            :key="cat.categoryId"
            class="cat"
            :class="{ 'cat--on': isCategorySelected(cat.categoryId) }"
            @click="selectCategory(cat.categoryId)"
          >{{ cat.name }}</text>
        </view>
        <text v-if="!categoryOptions.length" class="empty-line">暂无分类</text>
        <text v-else class="empty-line">一道菜只能归一个主类；不选则标记为待分类</text>
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

      <view v-if="canDelete" class="danger-zone">
        <view class="danger-btn" :class="{ 'danger-btn--disabled': deleting }" @click="removeDish">
          {{ deleting ? "删除中…" : "删除菜品" }}
        </view>
      </view>
    </template>

    <!-- 图片操作面板：底部弹出，遮罩点击可关闭 -->
    <view v-if="imageActionVisible" class="action-mask" @click.self="imageActionVisible = false">
      <view class="action-sheet">
        <text class="action-sheet__title">编辑封面</text>
        <text class="action-sheet__hint">可以上传新图，也可以输入画面描述让 AI 重新生成</text>
        <view class="action-sheet__btn" @click="chooseCover">从相册 / 相机上传</view>
        <view class="action-sheet__btn action-sheet__btn--primary" @click="openRegenerateDialog">AI 重新生成</view>
        <view class="action-sheet__cancel" @click="imageActionVisible = false">取消</view>
      </view>
    </view>

    <!-- 重新生成描述输入：用页面内弹层，避免单行 showModal 输入框在 App 端体验不一致 -->
    <view v-if="regenerateVisible" class="action-mask" @click.self="regenerateVisible = false">
      <view class="regen-dialog">
        <text class="regen-dialog__title">重新生成封面</text>
        <text class="regen-dialog__hint">会结合菜名「{{ form.name }}」与下面的描述生成新图</text>
        <textarea
          v-model="imageDescription"
          class="regen-dialog__input"
          maxlength="300"
          auto-height
          :disabled="regenerating"
          placeholder="例如：暖色灯光下的家常餐桌，俯拍，突出油亮的酱汁"
          placeholder-class="ph"
        />
        <view class="regen-dialog__btns">
          <view class="regen-dialog__btn regen-dialog__btn--cancel" @click="regenerateVisible = false">取消</view>
          <view
            class="regen-dialog__btn regen-dialog__btn--primary"
            :class="{ 'regen-dialog__btn--disabled': regenerating }"
            @click="regenerateCover"
          >
            {{ regenerating ? "生成中…" : "开始生成" }}
          </view>
        </view>
      </view>
    </view>
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

/* 图片底部透明渐隐遮罩，明确提示可点击编辑，又不遮挡图片主体 */
.cover__edit-tip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 76rpx;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 16rpx;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.55));
}

.cover__edit-label {
  font-size: 24rpx;
  color: #fff;
  font-weight: 600;
  letter-spacing: 2rpx;
  text-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.4);
}

/* 删除菜品：放到表单最底部，低饱和危险色，避免误触 */
.danger-zone {
  margin-top: 32rpx;
  padding-bottom: 30rpx;
}

.danger-btn {
  height: 84rpx;
  line-height: 84rpx;
  text-align: center;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: $meal-danger;
  background: $lg-fill;
  border: 1rpx solid rgba(217, 45, 32, 0.28);
}

.danger-btn--disabled {
  opacity: 0.55;
  pointer-events: none;
}

/* 底部操作面板 */
.action-mask {
  position: fixed;
  inset: 0;
  z-index: 800;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 24rpx;
  box-sizing: border-box;
  background: $lg-mask;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.action-sheet,
.regen-dialog {
  width: 100%;
  max-width: 680rpx;
  border-radius: 36rpx;
  padding: 36rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  border: 1rpx solid $lg-border;
  background: $lg-fill;
  box-shadow: $lg-shadow, $lg-edge;
}

.action-sheet__title,
.regen-dialog__title {
  display: block;
  text-align: center;
  font-size: 32rpx;
  font-weight: 700;
  color: $lg-ink;
}

.action-sheet__hint,
.regen-dialog__hint {
  display: block;
  margin: 12rpx 0 24rpx;
  text-align: center;
  font-size: 23rpx;
  line-height: 1.5;
  color: $lg-ink-3;
}

.action-sheet__btn {
  height: 84rpx;
  line-height: 84rpx;
  margin-top: 16rpx;
  text-align: center;
  border-radius: 22rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: $lg-ink;
  background: $lg-fill-2;
  border: 1rpx solid $lg-border;
}

.action-sheet__btn--primary {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 12rpx 26rpx $lg-accent-shadow;
}

.action-sheet__cancel {
  margin-top: 20rpx;
  height: 72rpx;
  line-height: 72rpx;
  text-align: center;
  font-size: 26rpx;
  color: $lg-ink-3;
}

.regen-dialog__input {
  width: 100%;
  min-height: 190rpx;
  padding: 20rpx;
  box-sizing: border-box;
  border-radius: 20rpx;
  border: 1rpx solid $lg-border;
  background: $lg-fill-2;
  font-size: 26rpx;
  line-height: 1.55;
  color: $lg-ink;
}

.regen-dialog__btns {
  display: flex;
  gap: 18rpx;
  margin-top: 24rpx;
}

.regen-dialog__btn {
  flex: 1;
  height: 82rpx;
  line-height: 82rpx;
  text-align: center;
  border-radius: 999rpx;
  font-size: 27rpx;
  font-weight: 600;
}

.regen-dialog__btn--cancel {
  color: $lg-ink-2;
  background: $lg-fill-3;
  border: 1rpx solid $lg-border;
}

.regen-dialog__btn--primary {
  color: #fff;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
}

.regen-dialog__btn--disabled {
  opacity: 0.6;
  pointer-events: none;
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

/* 导航栏右侧「保存」：主色文字按钮，避免与底部重复 */
.nav-save {
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
  font-weight: 700;
  white-space: nowrap;
  color: #fff;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 8rpx 20rpx $lg-accent-shadow;
}

.nav-save--disabled {
  opacity: 0.55;
}

.ph {
  color: $lg-ink-3;
}
</style>
