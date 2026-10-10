<script setup lang="ts">
import { onReady, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { computed, getCurrentInstance, nextTick, ref } from "vue";
import { listCategory, listDish } from "@/api/dish";
import GlassNavBar from "@/components/GlassNavBar.vue";
import TabBar from "@/components/TabBar.vue";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";
import { svgIcon } from "@/utils/icons";
import { useOrderNotifierLifecycle } from "@/utils/notify";
import type { Category, Dish } from "@/types";

const inst = getCurrentInstance();
const userStore = useUserStore();
const cartStore = useCartStore();
useOrderNotifierLifecycle();

const categories = ref<Category[]>([]);
const dishes = ref<Dish[]>([]);
const activeCategoryId = ref<number | undefined>(undefined);
const keyword = ref("");
const loading = ref(false);
const refreshing = ref(false);
/* 右侧滚动容器 .menu-dishes 的受控滚动目标（海底捞式：点左侧后平滑跳到该分组顶）
   滚动事件驱动的高亮在 computeActiveGroup 中更新 */
const scrollTo = ref(0);
/* 当前容器内已滚动像素（来自 scroll 事件，用于定位计算） */
let scrolledTop = 0;
/* 滚动内容总高（来自 scroll 事件，用于判断是否已滚到底） */
let scrollContentHeight = 0;
/* 高亮计算节流 use */
let rafId: number | null = null;
let measureVersion = 0;
let categoryPickVersion = 0;
let categoryPickInFlight = false;
let categoryPickTimer: ReturnType<typeof setTimeout> | null = null;

/* 小程序（微信/支付宝等）没有全局 requestAnimationFrame，
   统一封装：有 rAF 就用 rAF，没有就退回 setTimeout，避免滚动回调直接抛错。 */
const scheduleFrame: (cb: () => void) => number =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16) as unknown as number;
const cancelFrame: (id: number) => void =
  typeof cancelAnimationFrame === "function" ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);

const cartIcon = svgIcon("cart", "#FFFFFF");

onReady(async () => {
  await nextTick();
  await measureAndHighlight();
});

onShow(async () => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  // 进了点餐区，底部导航就该是点餐那一套
  userStore.setViewMode("eater");
  if (!userStore.user) {
    try {
      await userStore.fetchInfo();
    } catch (e) {
      return;
    }
  } else {
    // 已从本地缓存恢复身份：先渲染，再后台刷新一次，token 失效由请求层踢回登录
    userStore.refreshInfo();
  }
  // 已加载过全量菜单且不在搜索态（如从菜品详情返回）：直接用内存数据，不重复请求
  if (menuInitialized && !keyword.value) {
    await nextTick();
    await measureAndHighlight();
    return;
  }
  // 其余情况：读本地缓存秒显；只有首次无缓存时才发请求
  await loadFromCacheOrNetwork();
});

/* ============ 本地缓存：命中即读、仅下拉刷新才重新拉取 ============ */
/** 分类 + 全量菜品的本地缓存 key */
const MENU_CACHE_KEY = "meal-menu-cache";
/** 本次会话是否已加载过全量菜单（命中缓存或请求成功后置真），onShow 据此跳过重复加载 */
let menuInitialized = false;

/** 读取本地菜单缓存；不存在或损坏返回 null */
function readMenuCache(): { categories: Category[]; dishes: Dish[] } | null {
  try {
    const raw = uni.getStorageSync(MENU_CACHE_KEY);
    const cached = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!cached || !Array.isArray(cached.categories) || !Array.isArray(cached.dishes)) {
      return null;
    }
    return { categories: cached.categories, dishes: cached.dishes };
  } catch (e) {
    return null;
  }
}

/** 把当前分类与全量菜品写入本地缓存 */
function writeMenuCache() {
  try {
    uni.setStorageSync(
      MENU_CACHE_KEY,
      JSON.stringify({ categories: categories.value, dishes: dishes.value }),
    );
  } catch (e) {
    // 本地缓存不可用不影响本次展示
  }
}

/** 强制拉取分类与全量菜品，成功后刷新缓存并重新测量高亮 */
async function refreshAll() {
  keyword.value = "";
  await Promise.all([loadCategories(), loadDishes()]);
  writeMenuCache();
  menuInitialized = true;
  activeCategoryId.value = undefined;
  scrollTo.value = 0;
  scrolledTop = 0;
  scrollContentHeight = 0;
  await nextTick();
  await measureAndHighlight();
}

/** 进页面加载：命中缓存直接渲染，未命中才请求 */
async function loadFromCacheOrNetwork() {
  keyword.value = "";
  const cached = readMenuCache();
  if (cached) {
    categories.value = cached.categories;
    dishes.value = cached.dishes;
    menuInitialized = true;
    await nextTick();
    await measureAndHighlight();
    return;
  }
  await refreshAll();
}

/** 下拉刷新：强制重新拉取分类与菜品列表并覆盖缓存 */
async function onRefresh() {
  refreshing.value = true;
  try {
    await refreshAll();
  } finally {
    refreshing.value = false;
  }
}

/* ============ 下拉刷新：调大阈值让下拉更「沉」，做出阻尼感 ============ */
/** 下拉阈值（px），与模板 refresher-threshold 保持一致 */
const REFRESHER_THRESHOLD = 80;

async function loadCategories() {
  try {
    const res = await listCategory();
    categories.value = res.rows;
    if (activeCategoryId.value !== undefined && !res.rows.some((item) => item.categoryId === activeCategoryId.value)) {
      activeCategoryId.value = undefined;
    }
  } catch (e) {
    categories.value = [];
    activeCategoryId.value = undefined;
  }
}

async function loadDishes() {
  loading.value = true;
  try {
    const res = await listDish({ keyword: keyword.value || undefined });
    dishes.value = res.rows;
  } catch (e) {
    dishes.value = [];
  } finally {
    loading.value = false;
  }
  await nextTick();
  await measureAndHighlight();
}

/* 分类 icon：接口有就用，没有则按顺序给默认 icon（与参考 Demo 的 CATS 图标一致） */
const DEFAULT_CATEGORY_ICONS = ["🔥", "🥗", "🍲", "🍚", "🍖", "🥦", "🍮", "🌶️"];

function categoryIcon(cat: Category, index: number): string {
  const icon = (cat.icon || "").trim();
  return icon || DEFAULT_CATEGORY_ICONS[index % DEFAULT_CATEGORY_ICONS.length];
}

/* 每个分类的分组：categories 顺序为基准，菜品按 categoryIds 归组
   （left 分类栏与右侧分组一一对应，保证左右联动索引一致）
   一道菜可挂多个分类，会同时出现在多个分组里——这是预期行为。
   备注：categoryId 可能被后端序列化为数字或字符串，统一字符串化后比较，避免类型不匹配把整组过滤成空 */
const groups = computed(() =>
  categories.value.map((cat, index) => ({
    cat,
    icon: categoryIcon(cat, index),
    items: dishes.value.filter((d) => {
      // 优先按 categoryIds 归组；后端可能把 bigint 序列化成字符串，统一字符串化比较
      const ids = (d.categoryIds || []).map((id) => String(id));
      if (ids.includes(String(cat.categoryId))) {
        return true;
      }
      // 退而按冗余 categoryNames（顿号拼接）兜底，避免 categoryIds 缺失时整组被过滤成空
      const names = (d.categoryNames || "").split("、").map((name) => name.trim());
      return names.includes((cat.name || "").trim());
    }),
  })),
);

/* 没有菜品时的空态 */
const emptyText = computed(() =>
  loading.value ? "" : keyword.value ? "没有找到相关菜品" : "还没有菜，去管理端点几道吧",
);

function onSearch() {
  loadDishes();
}

function tagList(dish: Dish): string[] {
  if (!dish.tags) {
    return [];
  }
  return dish.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => !!tag)
    .slice(0, 2);
}

function openDish(dish: Dish) {
  uni.navigateTo({ url: `/pages/menu/detail?dishId=${dish.dishId}` });
}

/** 某道菜在购物车里的份数（0 表示未加购） */
function dishCount(dishId: number): number {
  return cartStore.lines.find((line) => line.dishId === dishId)?.count || 0;
}

/** 加一分 */
function plus(dish: Dish) {
  cartStore.add(dish, 1);
}

/** 减一分；已到 0 时不做任何事 */
function minus(dish: Dish) {
  const now = dishCount(dish.dishId);
  if (now <= 0) {
    return;
  }
  cartStore.updateCount(dish.dishId, now - 1);
}

function goCart() {
  uni.navigateTo({ url: "/pages/cart/index" });
}

/* ============ 左右联动（用 getBoundingClientRect 计算，不用 offsetTop/scrollIntoView） ============ */
/** 拿到右侧滚动容器与全部分组的 boundingClientRect（用 rect 定位，不依赖 offsetTop） */
function measureGroups(): Promise<{ box: UniApp.NodeInfo | null; rects: UniApp.NodeInfo[] }> {
  return new Promise((resolve) => {
    const proxy = inst?.proxy;
    if (!proxy) {
      resolve({ box: null, rects: [] });
      return;
    }
    // boundingClientRect 回调结果类型是 NodeInfo | NodeInfo[]，在这里收窄为单节点/数组
    const q1 = uni.createSelectorQuery().in(proxy as unknown as Record<string, unknown>);
    q1.select(".menu-dish").boundingClientRect((box: UniApp.NodeInfo | UniApp.NodeInfo[]) => {
      const boxNode = Array.isArray(box) ? box[0] : box;
      const q2 = uni.createSelectorQuery().in(proxy as unknown as Record<string, unknown>);
      q2.selectAll(".menu-group").boundingClientRect((groups: UniApp.NodeInfo | UniApp.NodeInfo[]) => {
        resolve({ box: boxNode || null, rects: Array.isArray(groups) ? groups : [] });
      });
      q2.exec();
    });
    q1.exec();
  });
}

/** 左侧分类栏受控滚动目标：右侧切换高亮分组时，把对应分类项滚入可视区 */
const railIntoView = ref("");

/** 让左侧第 index 个分类滚入可视区；uni 对相同值不触发滚动，故先清空再设置 */
function syncRail(index: number) {
  if (index < 0) {
    return;
  }
  railIntoView.value = "";
  nextTick(() => {
    railIntoView.value = `rail-${index}`;
  });
}

/** 根据「组顶 ≤ 容器可视顶 + 阈值」的最后一个分组，滚动到左栏高亮。
 *  atBottom 为真时（已滚到底）直接高亮最后一个分组：最后一个分组往往顶不到容器顶，
 *  否则点它/滚到底都会错误地高亮倒数第二个分组。 */
function computeActive(rects: UniApp.NodeInfo[], boxTop: number, atBottom = false) {
  const threshold = 0; // 只在分组顶部到达容器顶部时切换，避免提前高亮
  let idx = -1;
  if (atBottom && rects.length > 0) {
    idx = rects.length - 1;
  } else {
    rects.forEach((r, i) => {
      if (r && r.top !== undefined && r.top <= boxTop + threshold) {
        idx = i;
      }
    });
  }
  const g = groups.value[idx];
  const target = g ? g.cat.categoryId : undefined;
  if (target !== activeCategoryId.value) {
    activeCategoryId.value = target;
    syncRail(idx);
  }
}

async function measureAndHighlight(retry = 0) {
  const version = ++measureVersion;
  const r = await measureGroups();
  if (version !== measureVersion) {
    return;
  }
  if (!r.box || r.box.top === undefined || r.rects.length === 0) {
    if (retry < 2) {
      setTimeout(() => {
        measureAndHighlight(retry + 1);
      }, 50);
    } else if (groups.value.length > 0) {
      activeCategoryId.value = groups.value[0].cat.categoryId;
    }
    return;
  }
  // 已滚到底：容器滚动距离 + 可视高 ≥ 内容总高（留 2px 容差）
  const boxHeight = r.box.height ?? 0;
  const atBottom =
    scrollContentHeight > 0 && boxHeight > 0 && scrolledTop + boxHeight >= scrollContentHeight - 2;
  computeActive(r.rects, r.box.top, atBottom);
}

/** 右侧滚动事件：更新已滚动距离并实时高亮当前分组（节流到一帧内） */
function onDishScroll(e: { detail?: { scrollTop?: number; scrollHeight?: number } }) {
  const t = e?.detail?.scrollTop ?? 0;
  scrolledTop = t;
  const h = e?.detail?.scrollHeight;
  if (typeof h === "number" && h > 0) {
    scrollContentHeight = h;
  }
  if (rafId != null) {
    return;
  }
  rafId = scheduleFrame(() => {
    rafId = null;
    if (categoryPickInFlight) {
      return;
    }
    if (categoryPickTimer !== null) {
      clearTimeout(categoryPickTimer);
      categoryPickTimer = null;
    }
    measureAndHighlight();
  });
}

/** 点击左侧分类：平滑滚动到对应分组顶部，并同步高亮 */
async function pickCategory(categoryId: number) {
  const g = groups.value.find((item) => item.cat.categoryId === categoryId);
  if (!g) {
    return;
  }
  const idx = groups.value.indexOf(g);
  activeCategoryId.value = categoryId;
  syncRail(idx);
  categoryPickInFlight = true;
  if (categoryPickTimer !== null) {
    clearTimeout(categoryPickTimer);
    categoryPickTimer = null;
  }
  if (rafId !== null) {
    cancelFrame(rafId);
    rafId = null;
  }
  const version = ++categoryPickVersion;
  const r = await measureGroups();
  if (version !== categoryPickVersion) {
    categoryPickInFlight = false;
    return;
  }
  const box = r.box;
  const rects = r.rects;
  if (!box || box.top === undefined) {
    categoryPickInFlight = false;
    return;
  }
  const gRect = rects[idx];
  if (!gRect || gRect.top === undefined) {
    if (idx === groups.value.length - 1) {
      activeCategoryId.value = categoryId;
    }
    categoryPickInFlight = false;
    return;
  }
  // 公式：目标 scrollTop = 当前 scrollTop + (该组 top − 容器 top)
  const target = Math.max(0, scrolledTop + (gRect.top - box.top));
  scrollTo.value = 0;
  await nextTick();
  scrollTo.value = target;
  categoryPickTimer = setTimeout(() => {
    if (version === categoryPickVersion) {
      categoryPickInFlight = false;
      categoryPickTimer = null;
      measureAndHighlight();
    }
  }, 450);
}
</script>

<template>
  <view class="app-fixed app-fixed--topnav">
    <GlassNavBar title="今天吃什么" />

    <view class="app-fixed__head">
      <view class="search glass">
        <input
          v-model="keyword"
          class="search__input"
          placeholder="搜索菜名 / 食材"
          placeholder-class="search__ph"
          confirm-type="search"
          @confirm="onSearch"
        />
        <text class="search__btn" @click="onSearch">搜索</text>
      </view>
    </view>

    <!-- 海底捞式主体：左分类栏 + 右整段连续菜品流 -->
    <view class="menu">
      <!-- 左侧竖向滚动分类栏（右侧滚动切换分组时，高亮项自动滚入可视区） -->
      <scroll-view
        scroll-y
        class="rail glass glass--weak"
        :scroll-into-view="railIntoView"
        scroll-with-animation
      >
        <view
          v-for="(g, i) in groups"
          :key="g.cat.categoryId"
          class="rail-item"
          :class="{ 'rail-item--on': g.cat.categoryId === activeCategoryId }"
          :id="'rail-' + i"
          @click="pickCategory(g.cat.categoryId)"
        >
          <text class="rail-item__ic">{{ g.icon }}</text>
          <text class="rail-item__name">{{ g.cat.name }}</text>
        </view>
        <!-- 底部为悬浮 TabBar 让位：否则最后一个分类会被 TabBar 压住看不见 -->
        <view class="rail-tail"></view>
      </scroll-view>

      <!-- 右侧整段连续滚动菜品流（按分类分组的吸顶标题 + 菜品行） -->
      <scroll-view
        scroll-y
        class="menu-dish"
        :scroll-top="scrollTo"
        scroll-with-animation
        :refresher-enabled="true"
        :refresher-triggered="refreshing"
        :refresher-threshold="REFRESHER_THRESHOLD"
        refresher-background="transparent"
        @refresherrefresh="onRefresh"
        @scroll="onDishScroll"
      >
        <view v-if="loading" class="skeleton-list">
          <view v-for="n in 5" :key="n" class="skeleton-row">
            <view class="skeleton-row__ph shimmer"></view>
            <view class="skeleton-row__body">
              <view class="skeleton-row__line shimmer"></view>
              <view class="skeleton-row__line skeleton-row__line--w60 shimmer"></view>
            </view>
          </view>
        </view>

        <!-- 只有确实没有菜品时才显示空态（避免空态文字恒真把分组流整个截断） -->
        <view v-else-if="!dishes.length" class="empty">{{ emptyText }}</view>

        <template v-else>
          <view v-for="g in groups" :key="g.cat.categoryId" class="menu-group">
            <!-- 吸顶分组标题 -->
            <view class="sec-tit">
              <text class="sec-tit__ic">{{ g.icon }}</text>
              <text class="sec-tit__name">{{ g.cat.name }}</text>
              <text class="sec-tit__cnt">{{ g.items.length }} 道</text>
            </view>

            <view
              v-for="dish in g.items"
              :key="dish.dishId"
              class="dish glass"
              @click="openDish(dish)"
            >
              <image v-if="dish.cover" class="dish__cover" :src="dish.cover" mode="aspectFill" lazy-load />
              <view v-else class="dish__cover dish__cover--ph">{{ dish.name }}</view>

              <view class="dish__body">
                <text class="dish__name">{{ dish.name }}</text>
                <text class="dish__desc">{{ dish.description || "—" }}</text>
                <view class="dish__meta">
                  <view class="dish__meta-left">
                    <text v-for="tag in tagList(dish)" :key="tag" class="tag">{{ tag }}</text>
                    <text class="tiny">{{ dish.duration || "" }}</text>
                  </view>
                </view>
                <!-- 加减控件：不显示价格/金额 -->
                <view class="stepper" @click.stop>
                  <view class="stepper__btn" @click="minus(dish)">−</view>
                  <text class="stepper__num">{{ dishCount(dish.dishId) }}</text>
                  <view class="stepper__btn stepper__btn--plus" @click="plus(dish)">＋</view>
                </view>
              </view>
            </view>
          </view>

          <!-- 底部为固定 TabBar 让位：TabBar 是 fixed 覆盖层，滚动区底部会被它压住，
               这里补一段与 TabBar 等高的占位（正好被 TabBar 盖住，不会露出空白），
               保证最后一道菜的标签与加减控件完整显示在 TabBar 上方。 -->
          <view class="menu-tail"></view>
        </template>
      </scroll-view>
    </view>

    <TabBar active="menu" />

    <!-- 右下角购物车悬浮按钮：仅件数角标，不显示金额 -->
    <view v-if="cartStore.totalCount > 0" class="cart-fab" @click="goCart">
      <image class="cart-fab__icon" :src="cartIcon" />
      <text class="cart-fab__badge">{{ cartStore.totalCount }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 搜索框：玻璃胶囊底由 .glass 提供，这里只负责布局 */
.search {
  display: flex;
  align-items: center;
  gap: 16rpx;
  border-radius: 999rpx;
  padding: 16rpx 12rpx 16rpx 28rpx;
  margin-bottom: 20rpx;
}

.search__input {
  flex: 1;
  font-size: 26rpx;
  color: $lg-ink;
}

.search__ph {
  color: $lg-ink-3;
}

.search__btn {
  font-size: 26rpx;
  color: $lg-accent;
  font-weight: 700;
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: $lg-accent-soft;
}

/* 主体：左右两栏撑满剩余高度 */
.menu {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16rpx;
  position: relative;
}

/* 左侧竖向分类栏：玻璃弱面板，独立滚动
   宽 148rpx（375pt 屏 ≈ 74px）；border-box 保证加内边距后总宽不变 */
.rail {
  box-sizing: border-box;
  flex: 0 0 148rpx;
  width: 148rpx;
  border-radius: 28rpx;
  overflow-y: auto;
  padding: 10rpx 8rpx;
}

.rail-item {
  position: relative;
  padding: 22rpx 8rpx;
  text-align: center;
  font-size: 26rpx;
  color: $lg-ink-2;
  border-radius: 22rpx;
  transition: all 0.15s;
  line-height: 1.3;
}

.rail-item--on {
  color: #fff;
  font-weight: 700;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 12rpx 26rpx $lg-accent-shadow;
}

.rail-item__ic {
  display: block;
  font-size: 36rpx;
  line-height: 1;
  margin-bottom: 6rpx;
}

/* 左侧分类栏底部为悬浮 TabBar 让位（与右侧 .menu-tail 同高），
   否则最后一个分类会被 TabBar 压住看不见 */
.rail-tail {
  height: calc(170rpx + env(safe-area-inset-bottom));
}

/* 右侧整段连续滚动菜品流：透明底，露出环境光，菜品本身为玻璃卡 */
.menu-dish {
  flex: 1;
  min-width: 0;
  padding: 0 2rpx;
}

/* 底部为悬浮 TabBar 让位（TabBar 现已改为悬浮胶囊） */
.menu-tail {
  height: calc(170rpx + env(safe-area-inset-bottom));
}

.menu-group {
  margin-bottom: 8rpx;
}

/* 吸顶分组标题：半透明磨砂，滚动时压住下方菜品仍清晰可读 */
.sec-tit {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  padding: 14rpx 16rpx;
  margin: 8rpx 0;
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
}

.sec-tit__ic {
  font-size: 28rpx;
}

.sec-tit__name {
  font-size: 28rpx;
  font-weight: 700;
  color: $lg-ink;
}

.sec-tit__cnt {
  font-size: 22rpx;
  color: $lg-ink-3;
  font-weight: 500;
}

/* 菜品卡：玻璃卡，独立成块 */
.dish {
  display: flex;
  gap: 18rpx;
  padding: 20rpx;
  border-radius: 26rpx;
  margin-bottom: 16rpx;
  position: relative;
}

.dish__cover {
  width: 120rpx;
  height: 120rpx;
  flex: 0 0 120rpx;
  border-radius: 20rpx;
  display: block;
}

.dish__cover--ph {
  background: linear-gradient(135deg, $lg-accent-2, $lg-accent);
  color: #fff;
  font-size: 22rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dish__name {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: $lg-ink;
}

.dish__desc {
  display: block;
  font-size: 22rpx;
  color: $lg-ink-3;
  margin: 6rpx 0 10rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dish__meta {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.dish__meta-left {
  display: flex;
  align-items: center;
  gap: 8rpx;
  overflow: hidden;
}

.tag {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  color: $lg-accent;
  background: $lg-accent-soft;
  font-weight: 600;
}

/* 加减控件：不显示价格/金额 */
.stepper {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-top: 8rpx;
}

.stepper__btn {
  width: 48rpx;
  height: 48rpx;
  line-height: 46rpx;
  text-align: center;
  border-radius: 50%;
  color: $lg-accent;
  background: rgba(255, 255, 255, 0.6);
  border: 1rpx solid rgba(255, 107, 53, 0.4);
  font-size: 30rpx;
  font-weight: 700;
}

.stepper__btn--plus {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 10rpx 22rpx $lg-accent-shadow;
}

.stepper__num {
  font-size: 28rpx;
  font-weight: 700;
  color: $lg-ink;
  min-width: 32rpx;
  text-align: center;
}

/* 右下角购物车悬浮（件数角标，无金额） */
.cart-fab {
  position: fixed;
  right: 30rpx;
  bottom: calc(170rpx + env(safe-area-inset-bottom));
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 16rpx 36rpx $lg-accent-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.45);
  z-index: 90;
}

.cart-fab__icon {
  width: 52rpx;
  height: 52rpx;
}

.cart-fab__badge {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
  min-width: 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background-color: $meal-danger;
  color: #fff;
  font-size: 20rpx;
  font-weight: 700;
}

/* 骨架屏：半透明占位，贴合玻璃风格 */
.skeleton-list {
  padding-top: 8rpx;
}

.skeleton-row {
  display: flex;
  gap: 18rpx;
  padding: 20rpx;
  border-radius: 26rpx;
  margin-bottom: 16rpx;
  background: rgba(255, 255, 255, 0.5);
}

.skeleton-row__ph {
  width: 120rpx;
  height: 120rpx;
  flex: 0 0 120rpx;
  border-radius: 20rpx;
}

.skeleton-row__body {
  flex: 1;
  min-width: 0;
  padding-top: 10rpx;
}

.skeleton-row__line {
  height: 24rpx;
  border-radius: 8rpx;
  margin-bottom: 14rpx;
}

.skeleton-row__line--w60 {
  width: 60%;
}

.shimmer {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.45) 25%, rgba(255, 255, 255, 0.15) 37%, rgba(255, 255, 255, 0.45) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>