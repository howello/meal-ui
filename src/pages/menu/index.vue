<script setup lang="ts">
import { onReady, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { computed, getCurrentInstance, nextTick, ref } from "vue";
import { listCategory, listDish, listSignatureDishes } from "@/api/dish";
import CachedImage from "@/components/CachedImage.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import TabBar from "@/components/TabBar.vue";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";
import { svgIcon } from "@/utils/icons";
import { preloadImages } from "@/utils/imageCache";
import { consumeMenuDirty, MENU_CACHE_KEY } from "@/utils/menuCache";
import { useOrderNotifierLifecycle } from "@/utils/notify";
import type { Category, Dish } from "@/types";

/** 点餐区前端临时分组：最近上新 / 招牌，均不落库 */
type SpecialGroupKey = "recent" | "signature";

/** 右侧菜品流与左侧分类栏共用的分组结构 */
interface MenuGroup {
  /** 分组唯一 key（最近 / 招牌 / 分类ID字符串） */
  key: string;
  /** 主类 ID；最近与招牌为空 */
  categoryId?: number;
  /** 左栏与分组标题展示名 */
  label: string;
  icon: string;
  items: Dish[];
}

const inst = getCurrentInstance();
const userStore = useUserStore();
const cartStore = useCartStore();
useOrderNotifierLifecycle();

const categories = ref<Category[]>([]);
const dishes = ref<Dish[]>([]);
/** 招牌推荐位：近 90 天已完成订单 Top 3（不是分类，不落库、不可写入） */
const signatures = ref<Dish[]>([]);
const activeCategoryId = ref<number | SpecialGroupKey | undefined>(undefined);
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
  // 菜品在本端被编辑保存过（含上下架）：忽略内存与本地缓存，强制重拉一次
  if (consumeMenuDirty()) {
    menuInitialized = false;
    uni.removeStorageSync(MENU_CACHE_KEY);
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

onHide(() => {
  resetPickState();
});

onUnload(() => {
  resetPickState();
});

/* ============ 本地缓存：命中即读、仅下拉刷新才重新拉取 ============ */
/** 本次会话是否已加载过全量菜单（命中缓存或请求成功后置真），onShow 据此跳过重复加载 */
let menuInitialized = false;

/** 读取本地菜单缓存；不存在或损坏返回 null */
function readMenuCache(): { categories: Category[]; dishes: Dish[]; signatures: Dish[] } | null {
  try {
    const raw = uni.getStorageSync(MENU_CACHE_KEY);
    const cached = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!cached || !Array.isArray(cached.categories) || !Array.isArray(cached.dishes)) {
      return null;
    }
    return {
      categories: cached.categories,
      dishes: cached.dishes,
      signatures: Array.isArray(cached.signatures) ? cached.signatures : [],
    };
  } catch (e) {
    return null;
  }
}

/** 把当前分类、全量菜品与招牌写入本地缓存 */
function writeMenuCache() {
  try {
    uni.setStorageSync(
      MENU_CACHE_KEY,
      JSON.stringify({ categories: categories.value, dishes: dishes.value, signatures: signatures.value }),
    );
  } catch (e) {
    // 本地缓存不可用不影响本次展示
  }
}

/** 后台预热菜品封面（仅 App 端有实际动作），让滚动到该菜品时图片已就绪 */
function warmUpCovers() {
  preloadImages(dishes.value.map((item) => item.cover).filter((cover): cover is string => !!cover));
}

/** 强制拉取分类与全量菜品，成功后刷新缓存并重新测量高亮 */
async function refreshAll(showSkeleton = false) {
  keyword.value = "";
  await Promise.all([loadCategories(), loadDishes(showSkeleton), loadSignatures()]);
  writeMenuCache();
  menuInitialized = true;
  activeCategoryId.value = undefined;
  scrollTo.value = 0;
  scrolledTop = 0;
  scrollContentHeight = 0;
  warmUpCovers();
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
    signatures.value = cached.signatures;
    menuInitialized = true;
    warmUpCovers();
    await nextTick();
    await measureAndHighlight();
    return;
  }
  await refreshAll(true);
}

/** 下拉刷新：强制重新拉取分类与菜品列表并覆盖缓存（保留现有列表，不换骨架屏） */
async function onRefresh() {
  refreshing.value = true;
  try {
    await refreshAll(false);
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
    if (
      activeCategoryId.value !== undefined &&
      activeCategoryId.value !== "signature" &&
      activeCategoryId.value !== "recent" &&
      !res.rows.some((item) => item.categoryId === activeCategoryId.value)
    ) {
      activeCategoryId.value = undefined;
    }
  } catch (e) {
    categories.value = [];
    activeCategoryId.value = undefined;
  }
}

/** 拉取菜品；showSkeleton 仅在「列表本来就空」的首屏/搜索场景置真，
    下拉刷新时不换骨架屏，否则整个菜品流会被卸载重挂载、图片跟着闪一下 */
async function loadDishes(showSkeleton = false) {
  if (showSkeleton) {
    loading.value = true;
  }
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

/** 拉取招牌推荐位；失败时保持空列表（招牌为空则不展示该分组） */
async function loadSignatures() {
  try {
    signatures.value = await listSignatureDishes();
  } catch (e) {
    signatures.value = [];
  }
}

/* 分类 icon：接口有就用，没有则按顺序给默认 icon（与参考 Demo 的 CATS 图标一致） */
const DEFAULT_CATEGORY_ICONS = ["🔥", "🥗", "🍲", "🍚", "🍖", "🥦", "🍮", "🌶️"];

function categoryIcon(cat: Category, index: number): string {
  const icon = (cat.icon || "").trim();
  return icon || DEFAULT_CATEGORY_ICONS[index % DEFAULT_CATEGORY_ICONS.length];
}

/** 最近上新窗口（自然日，含今天） */
const RECENT_DAYS = 5;

/** 把后端 yyyy-MM-dd HH:mm:ss 解析为时间戳；非法或缺失返回 NaN */
function parseCreateTime(value?: string): number {
  if (!value) {
    return Number.NaN;
  }
  return new Date(value.replace(" ", "T")).getTime();
}

/* 最近 5 天新增菜品：纯前端派生，不落库、不改分类归属，也不从原分类中移除。
   以自然日计算：含今天在内的 5 个自然日，避免「5 × 24 小时」在凌晨出现理解偏差；
   按创建时间倒序后只展示最新 3 道。 */
const recentDishes = computed(() => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (RECENT_DAYS - 1));
  const startTime = start.getTime();
  return dishes.value
    .filter((dish) => {
      const created = parseCreateTime(dish.createTime);
      return !Number.isNaN(created) && created >= startTime;
    })
    .sort((a, b) => {
      const diff = parseCreateTime(b.createTime) - parseCreateTime(a.createTime);
      return diff || b.dishId - a.dishId;
    })
    .slice(0, 3);
});

/* 每个分类的分组：categories 顺序为基准，菜品按 categoryIds 归组
   （左侧分类栏与右侧分组一一对应，保证左右联动索引一致）。
   分类是唯一主类，一道菜只会出现在一个主类分组里。
   「最近」与「招牌」都是前端推荐位：不落库，也不从原分类中剔除；
   搜索态只展示主类命中结果，不展示推荐位。
   备注：categoryId 可能被后端序列化为数字或字符串，统一字符串化后比较，避免类型不匹配把整组过滤成空 */
const groups = computed<MenuGroup[]>(() => {
  const searched = !!keyword.value.trim();
  const list: MenuGroup[] = [];
  if (!searched && recentDishes.value.length) {
    list.push({ key: "recent", label: "最近", icon: "✨", items: recentDishes.value });
  }
  if (!searched && signatures.value.length) {
    list.push({ key: "signature", label: "招牌", icon: "⭐", items: signatures.value });
  }
  categories.value.forEach((cat, index) => {
    const items = dishes.value.filter((d) => {
      // 优先按 categoryIds 归组；后端可能把 bigint 序列化成字符串，统一字符串化比较
      const ids = (d.categoryIds || []).map((id) => String(id));
      if (ids.includes(String(cat.categoryId))) {
        return true;
      }
      // 退而按冗余 categoryNames 兜底，避免 categoryIds 缺失时整组被过滤成空
      return (d.categoryNames || "").trim() === (cat.name || "").trim();
    });
    list.push({
      key: String(cat.categoryId),
      categoryId: cat.categoryId,
      label: cat.name,
      icon: categoryIcon(cat, index),
      items,
    });
  });
  return list;
});

/** 把分组还原为左侧点击使用的 key：推荐位用固定值，主类用 categoryId */
function groupTarget(g: MenuGroup): number | SpecialGroupKey {
  return g.categoryId ?? (g.key as SpecialGroupKey);
}

/* 没有菜品时的空态 */
const emptyText = computed(() =>
  loading.value ? "" : keyword.value ? "没有找到相关菜品" : "还没有菜，去管理端点几道吧",
);

function onSearch() {
  loadDishes(true);
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
/** 点击分类后的滚动锁定时长（ms）：覆盖 H5 的 300ms 平滑动画，期间不让滚动事件反改高亮 */
const PICK_SETTLE_MS = 400;

/** 清理点击分类留下的滚动锁与定时器 */
function resetPickState() {
  categoryPickInFlight = false;
  railIntoView.value = "";
  if (categoryPickTimer !== null) {
    clearTimeout(categoryPickTimer);
    categoryPickTimer = null;
  }
  if (rafId !== null) {
    cancelFrame(rafId);
    rafId = null;
  }
}

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

/** 分组边界容差（px）：滚动位置取整常让目标组停在可视顶下方不到 1px，
 *  不留容差会错误高亮上一组。 */
const ACTIVE_GROUP_TOLERANCE = 6;

/** 根据「组顶 ≤ 容器可视顶 + 容差」的最后一个分组，滚动到左栏高亮。
 *  atBottom 为真时（已滚到底）直接高亮最后一个分组：最后一个分组往往顶不到容器顶，
 *  否则点它/滚到底都会错误地高亮倒数第二个分组。 */
function computeActive(rects: UniApp.NodeInfo[], boxTop: number, atBottom = false) {
  let idx = -1;
  if (atBottom && rects.length > 0) {
    idx = rects.length - 1;
  } else {
    rects.forEach((r, i) => {
      if (r && r.top !== undefined && r.top <= boxTop + ACTIVE_GROUP_TOLERANCE) {
        idx = i;
      }
    });
  }
  const g = groups.value[idx];
  const target = g ? groupTarget(g) : undefined;
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
      activeCategoryId.value = groupTarget(groups.value[0]);
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

/** 点击左侧分类（或推荐位）：平滑滚动到对应分组顶部，并同步高亮 */
async function pickCategory(categoryKey: number | SpecialGroupKey) {
  const g = groups.value.find((item) => groupTarget(item) === categoryKey);
  if (!g) {
    return;
  }
  const idx = groups.value.indexOf(g);
  activeCategoryId.value = categoryKey;
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
      activeCategoryId.value = categoryKey;
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
      // 点击定位以用户点选的分类为准。这里不能再按几何位置重算：
      // 平滑滚动结束时的亚像素误差会把高亮误判成上一组。
    }
  }, PICK_SETTLE_MS);
}
</script>

<template>
  <view class="app-fixed app-fixed--topnav" :class="themeRootClass">
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
          :key="g.key"
          class="rail-item"
          :class="{ 'rail-item--on': groupTarget(g) === activeCategoryId }"
          :id="'rail-' + i"
          @click="pickCategory(groupTarget(g))"
        >
          <text class="rail-item__ic">{{ g.icon }}</text>
          <text class="rail-item__name">{{ g.label }}</text>
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
          <view v-for="g in groups" :key="g.key" class="menu-group">
            <!-- 吸顶分组标题 -->
            <view class="sec-tit">
              <text class="sec-tit__ic">{{ g.icon }}</text>
              <text class="sec-tit__name">{{ g.label }}</text>
              <text class="sec-tit__cnt">{{ g.items.length }} 道</text>
            </view>

            <view
              v-for="dish in g.items"
              :key="dish.dishId"
              class="dish glass"
              @click="openDish(dish)"
            >
              <view class="dish__cover-wrap">
                <CachedImage v-if="dish.cover" class="dish__cover" :src="dish.cover" mode="aspectFill" lazy-load />
                <view v-else class="dish__cover dish__cover--ph">{{ dish.name }}</view>
              </view>

              <view class="dish__body">
                <view class="dish__head">
                  <view class="dish__accent"></view>
                  <text class="dish__name">{{ dish.name }}</text>
                </view>
                <text class="dish__desc">{{ dish.description || "—" }}</text>
                <!-- 热量：夹在描述与标签之间，没有热量数据时不占位 -->
                <view v-if="dish.kcal" class="dish__kcal">
                  <text class="dish__kcal-ic">🔥</text>
                  <text class="dish__kcal-text">{{ dish.kcal }}</text>
                </view>
                <view v-if="tagList(dish).length" class="dish__tags">
                  <text v-for="tag in tagList(dish)" :key="tag" class="tag">{{ tag }}</text>
                </view>
                <!-- 份数控制条：横跨文字列，减号靠左、加号靠右 -->
                <view class="dish__foot" @click.stop>
                  <view class="stepper__btn" @click="minus(dish)">−</view>
                  <view class="stepper__count">
                    <text class="stepper__num">{{ dishCount(dish.dishId) }}</text>
                    <text class="stepper__unit">份</text>
                  </view>
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
  background: $lg-fill-3;
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

/* 菜品卡：玻璃卡，独立成块；封面与内边距适当放大，让菜品图更醒目 */
/* 菜品卡：左侧图片、右侧文字各占一半；卡片高度由文字列撑开，图片铺满左半边 */
.dish {
  display: flex;
  align-items: stretch;
  gap: 20rpx;
  padding: 20rpx;
  border-radius: 28rpx;
  margin-bottom: 18rpx;
  position: relative;
}

/* 左半区：固定占卡片内容宽度的一半，高度跟随卡片拉伸 */
.dish__cover-wrap {
  flex: 0 0 calc(50% - 10rpx);
  width: calc(50% - 10rpx);
  min-height: 320rpx;
  position: relative;
  border-radius: 24rpx;
  overflow: hidden;
}

.dish__cover {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.dish__cover--ph {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: linear-gradient(135deg, $lg-accent-2, $lg-accent);
  color: #fff;
  font-size: 24rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 12rpx;
  box-sizing: border-box;
}

/* 右半区：文字列占剩余一半，从上到下依次为 菜名 / 描述 / 标签 / 份数控制 */
.dish__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 6rpx 0 2rpx;
}

/* 菜名行：左侧主题色短竖条作为视觉锚点，右侧菜名单行省略 */
.dish__head {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-width: 0;
}

.dish__accent {
  flex: 0 0 6rpx;
  width: 6rpx;
  height: 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 4rpx 10rpx $lg-accent-shadow;
}

.dish__name {
  flex: 1;
  min-width: 0;
  font-size: 31rpx;
  font-weight: 700;
  line-height: 1.35;
  color: $lg-ink;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 描述自动换行、最多两行，超出省略；比菜名弱一级 */
.dish__desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  word-break: break-word;
  font-size: 23rpx;
  line-height: 1.5;
  color: $lg-ink-3;
  min-height: 69rpx;
}

/* 热量：描述与标签之间的一行弱信息，带底色避免和描述混在一起 */
.dish__kcal {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6rpx;
  padding: 4rpx 14rpx;
  border-radius: 10rpx;
  background: $lg-fill-2;
  border: 1rpx solid $lg-border;
}

.dish__kcal-ic {
  font-size: 20rpx;
  line-height: 1;
}

.dish__kcal-text {
  font-size: 21rpx;
  line-height: 1.4;
  color: $lg-ink-2;
  font-weight: 500;
}

/* 标签行：最多展示两个 */
.dish__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  overflow: hidden;
}

.tag {
  font-size: 20rpx;
  line-height: 1.6;
  padding: 2rpx 14rpx;
  border-radius: 999rpx;
  color: $lg-accent;
  background: $lg-accent-soft;
  border: 1rpx solid $lg-accent-border;
  font-weight: 600;
}

/* 份数控制条：弱玻璃底槽，两端按钮、中间份数，贴文字列底部 */
.dish__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8rpx;
  margin-top: auto;
  padding: 8rpx 10rpx;
  border-radius: 999rpx;
  background: $lg-fill-2;
  border: 1rpx solid $lg-border;
}

.stepper__count {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
  flex: 1;
  justify-content: center;
}

.stepper__btn {
  width: 52rpx;
  height: 52rpx;
  line-height: 50rpx;
  text-align: center;
  border-radius: 50%;
  color: $lg-accent;
  background: $lg-fill;
  border: 1rpx solid $lg-accent-border;
  font-size: 32rpx;
  font-weight: 700;
}

.stepper__btn--plus {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  box-shadow: 0 10rpx 22rpx $lg-accent-shadow;
}

.stepper__num {
  font-size: 30rpx;
  line-height: 1;
  font-weight: 700;
  color: $lg-ink;
}

/* 份数单位：小一号的弱色，避免和数字抢视觉 */
.stepper__unit {
  font-size: 20rpx;
  color: $lg-ink-3;
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
  align-items: stretch;
  gap: 20rpx;
  padding: 20rpx;
  border-radius: 28rpx;
  margin-bottom: 18rpx;
  background: $lg-fill-3;
}

/* 骨架屏左半区与真实卡片同宽，高度跟随右侧占位行撑开 */
.skeleton-row__ph {
  flex: 0 0 calc(50% - 10rpx);
  width: calc(50% - 10rpx);
  min-height: 320rpx;
  border-radius: 24rpx;
}

.skeleton-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding-top: 6rpx;
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
  background: linear-gradient(90deg, $lg-shimmer-1 25%, $lg-shimmer-2 37%, $lg-shimmer-1 63%);
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
