<script setup lang="ts">
import { onReady, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { computed, getCurrentInstance, nextTick, ref } from "vue";
import { listCategory, listDish, listSignatureDishes, searchDish } from "@/api/dish";
import CachedImage from "@/components/CachedImage.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import KitchenMessageButton from "@/components/KitchenMessageButton.vue";
import TabBar from "@/components/TabBar.vue";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";
import { svgIcon } from "@/utils/icons";
import { preloadImages } from "@/utils/imageCache";
import { consumeMenuCache, consumeMenuDirty, getMenuCache, type MenuSnapshot } from "@/utils/menuCache";
import { useOrderNotifierLifecycle } from "@/utils/notify";
import {
  addSearchHistory,
  clearSearchHistory,
  readSearchHistory,
  removeSearchHistory,
} from "@/utils/searchHistory";
import { collectMenuDishes, matchDishesByName, orderMenuDishesByIds, rankSuggestions } from "@/utils/dishSearch";
import { saveProposalPrefillName } from "@/utils/proposalPrefill";
import type { Category, Dish } from "@/types";

/** 点餐区前端临时分组：最近上新 / 招牌，均不落库 */
type SpecialGroupKey = "recent" | "signature";
type SearchPanelMode = "history" | "suggestions" | "loading" | "candidates" | "empty" | "error";
type SearchCandidateSource = "local" | "ai";

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
const searchPanelOpen = ref(false);
const searchPanelMode = ref<SearchPanelMode>("history");
const searchHistory = ref<string[]>([]);
const searchSuggestions = ref<Dish[]>([]);
const searchCandidates = ref<Dish[]>([]);
const searchCandidateQuery = ref("");
const searchCandidateSource = ref<SearchCandidateSource>("local");
const selectedSearchDishId = ref<number | null>(null);
const activeSearchQuery = ref("");
const searchError = ref("");
const loading = ref(false);
const menuError = ref("");
let menuLoadVersion = 0;
let renderedOwner = "";
const refreshing = ref(false);
/* 右侧滚动容器 .menu-dishes 的受控滚动目标（海底捞式：点左侧后平滑跳到该分组顶）
   滚动事件驱动的高亮在 computeActiveGroup 中更新 */
const scrollTo = ref(0);
/**
 * 每次定位使用独立递增的目标值，保证 scroll-view 的受控滚动一定重新触发。
 * 相同 scroll-top 重复赋值在 uni-app H5 中不会触发 watch。
 */
let scrollSequence = 0;
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
let searchRequestVersion = 0;
let searchBlurTimer: ReturnType<typeof setTimeout> | null = null;
/** 搜索定位目标：菜品 ID 与当前搜索关键词，用于模板标记与滚动校准 */
const searchTargetId = ref<number | null>(null);
const searchTargetGroupKey = ref("");
const searchTargetKeyword = ref("");
/** 搜索结果滚动定位中的标记：与分类点击共用滚动锁，避免滚动事件误改高亮 */
let searchPickVersion = 0;

/* 小程序（微信/支付宝等）没有全局 requestAnimationFrame，
   统一封装：有 rAF 就用 rAF，没有就退回 setTimeout，避免滚动回调直接抛错。 */
const scheduleFrame: (cb: () => void) => number =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16) as unknown as number;
const cancelFrame: (id: number) => void =
  typeof cancelAnimationFrame === "function" ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);

const cartIcon = svgIcon("cart", "#FFFFFF");
const searchIcon = svgIcon("search", "#ff6b35");

onReady(async () => {
  await nextTick();
  await measureAndHighlight();
});

onShow(async () => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  if (!userStore.user) {
    try {
      await userStore.fetchInfo();
    } catch (e) {
      return;
    }
  } else {
    // 确认家庭归属后才使用私有菜单缓存，避免账号迁移家庭后展示旧数据。
    try {
      await userStore.fetchInfo();
    } catch (e) {
      return;
    }
  }
  const owner = `${userStore.user?.userId}:${userStore.user?.deptId}`;
  if (renderedOwner && renderedOwner !== owner) {
    resetSearchInteraction(true);
    categories.value = [];
    dishes.value = [];
    signatures.value = [];
    menuLoadVersion += 1;
  }
  renderedOwner = owner;
  searchHistory.value = readSearchHistory(userStore.user?.userId, userStore.user?.deptId);
  // 编辑/删除后清空进程内菜单快照，确保从详情或编辑页返回时一定重拉
  if (consumeMenuDirty()) {
    getMenuCache().clear();
  }
  // 再读进程级内存缓存：切换页面不重复请求，关闭 App / 刷新页面后自然丢失
  const cached = consumeMenuCache();
  if (cached) {
    applyMenuSnapshot(cached);
    await nextTick();
    await measureAndHighlight();
    return;
  }
  // 没有可复用的内存数据：首次进入或编辑/删除后强制拉取
  await loadFromCacheOrNetwork();
});

onHide(() => {
  resetPickState();
  searchRequestVersion += 1;
  closeSearchPanel();
});

onUnload(() => {
  resetPickState();
  searchRequestVersion += 1;
  closeSearchPanel();
});

/* ============ 菜单缓存：进程内共享，页面切换不重复拉取；App 重开后重新请求 ============ */
/** 把内存快照回填到当前页面 */
function applyMenuSnapshot(snapshot: MenuSnapshot) {
  categories.value = snapshot.categories;
  dishes.value = snapshot.dishes;
  signatures.value = snapshot.signatures;
  warmUpCovers();
}

/** 强制拉取分类与全量菜品，成功后刷新内存快照并重新测量高亮 */
async function refreshAll(showSkeleton = false) {
  const token = userStore.token;
  const sessionVersion = userStore.sessionVersion;
  const requestVersion = ++menuLoadVersion;
  if (showSkeleton && !dishes.value.length) loading.value = true;
  menuError.value = "";
  try {
    const [categoryPage, dishPage, recommended] = await Promise.all([
      listCategory(), listDish({}), listSignatureDishes(),
    ]);
    if (token !== userStore.token || sessionVersion !== userStore.sessionVersion || requestVersion !== menuLoadVersion) return;
    const snapshot: MenuSnapshot = {
      categories: categoryPage.rows, dishes: dishPage.rows, signatures: recommended,
    };
    applyMenuSnapshot(snapshot);
    getMenuCache().set(snapshot);
    resetSearchInteraction(true);
    activeCategoryId.value = undefined;
    scrollTo.value = 0;
    scrolledTop = 0;
    scrollContentHeight = 0;
    await nextTick();
    await measureAndHighlight();
  } catch (e) {
    if (token === userStore.token && requestVersion === menuLoadVersion) {
      menuError.value = "菜单加载失败，请下拉重试";
    }
  } finally {
    if (requestVersion === menuLoadVersion) loading.value = false;
  }
}

/** 首次进入页面或无内存快照时拉取 */
async function loadFromCacheOrNetwork() {
  keyword.value = "";
  await refreshAll(true);
}

/** 下拉刷新：强制重新拉取分类与菜品列表（保留现有列表，不换骨架屏） */
async function onRefresh() {
  refreshing.value = true;
  try {
    await refreshAll(false);
  } finally {
    refreshing.value = false;
  }
}

/** 后台预热菜品封面（仅 App 端有实际动作），让滚动到该菜品时图片已就绪 */
function warmUpCovers() {
  preloadImages(dishes.value.map((item) => item.cover).filter((cover): cover is string => !!cover));
}

/* ============ 下拉刷新：调大阈值让下拉更「沉」，做出阻尼感 ============ */
/** 下拉阈值（px），与模板 refresher-threshold 保持一致 */
const REFRESHER_THRESHOLD = 80;

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
   「最近」与「招牌」都是前端推荐位：不落库，也不从原分类中剔除。
   搜索只负责定位，不改变这里展示的分组与菜品。
   备注：categoryId 可能被后端序列化为数字或字符串，统一字符串化后比较，避免类型不匹配把整组过滤成空 */
const groups = computed<MenuGroup[]>(() => {
  const list: MenuGroup[] = [];
  if (recentDishes.value.length) {
    list.push({ key: "recent", label: "最近", icon: "✨", items: recentDishes.value });
  }
  if (signatures.value.length) {
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

/** 根据当前菜单分组取菜品标识，用于搜索历史、建议和候选行的小图标。 */
function dishIcon(dish: Dish): string {
  return groups.value.find((group) => group.items.some((item) => String(item.dishId) === String(dish.dishId)))?.icon || "🍽️";
}

/* 没有菜品时的空态 */
const emptyText = computed(() =>
  loading.value ? "" : menuError.value || "还没有菜，去管理端点几道吧",
);

/** 返回分类顺序中的唯一菜品序列，跳过最近/招牌推荐位的重复卡片。 */
function getMenuDishesInCategoryOrder(): Dish[] {
  return collectMenuDishes(groups.value);
}

/** 菜名包含匹配；食材字段不参与搜索建议或本地优先搜索。 */
function findLocalDishMatches(query: string): Dish[] {
  return matchDishesByName(getMenuDishesInCategoryOrder(), query);
}

/** 输入建议将完全匹配和前缀匹配排前，并限制下拉高度。 */
function findSearchSuggestions(query: string): Dish[] {
  return rankSuggestions(findLocalDishMatches(query), query);
}

/** 清除输入框对应的搜索命中高亮并让旧的异步定位失效。 */
function clearSearchHighlight() {
  searchPickVersion += 1;
  searchTargetId.value = null;
  searchTargetGroupKey.value = "";
  searchTargetKeyword.value = "";
  selectedSearchDishId.value = null;
}

/** 清除与旧查询绑定的候选列表、来源和错误状态。 */
function clearSearchCandidates() {
  searchCandidates.value = [];
  searchCandidateQuery.value = "";
  searchCandidateSource.value = "local";
  selectedSearchDishId.value = null;
  searchError.value = "";
}

/** 收起搜索下拉但保留同一查询的候选缓存，重新聚焦时可恢复。 */
function closeSearchPanel() {
  searchPanelOpen.value = false;
  if (searchBlurTimer !== null) {
    clearTimeout(searchBlurTimer);
    searchBlurTimer = null;
  }
}

/** 打开历史、建议、候选或提示面板。 */
function openSearchPanel(mode: SearchPanelMode) {
  searchPanelMode.value = mode;
  searchPanelOpen.value = true;
}

/** 重置当前搜索交互；菜单切换家庭或刷新时可同时清空输入。 */
function resetSearchInteraction(clearKeyword: boolean) {
  searchRequestVersion += 1;
  activeSearchQuery.value = "";
  searchSuggestions.value = [];
  clearSearchCandidates();
  clearSearchHighlight();
  searchPanelMode.value = "history";
  closeSearchPanel();
  if (clearKeyword) {
    keyword.value = "";
  }
}

/** 输入内容变化后清理旧候选，再实时展示本地菜名建议。 */
function onSearchInput(event?: Event) {
  // 原生 input 把值放在 detail.value，wd-input 直接透传 detail；两种形状都要兼容。
  const payload = event as unknown as { detail?: { value?: string }; value?: string } | undefined;
  const detailValue = payload?.detail?.value ?? payload?.value;
  const value = typeof detailValue === "string" ? detailValue : keyword.value;
  keyword.value = value;
  searchRequestVersion += 1;
  activeSearchQuery.value = "";
  clearSearchCandidates();
  clearSearchHighlight();
  const query = value.trim();
  if (!query) {
    searchSuggestions.value = [];
    openSearchPanel("history");
    return;
  }
  searchSuggestions.value = findSearchSuggestions(query);
  openSearchPanel("suggestions");
}

/** 点击输入框自带清空控件：清空查询并清理候选、候选选中态与菜品高亮。 */
function onSearchClear() {
  // 清空控件会先触发一次失焦；这里取消延迟收起，避免刚显示的历史面板被立刻关掉。
  if (searchBlurTimer !== null) {
    clearTimeout(searchBlurTimer);
    searchBlurTimer = null;
  }
  keyword.value = "";
  searchRequestVersion += 1;
  activeSearchQuery.value = "";
  searchSuggestions.value = [];
  clearSearchCandidates();
  clearSearchHighlight();
  openSearchPanel("history");
}

/** 聚焦时恢复同一查询的 AI/本地多结果候选，否则显示历史或本地建议。 */
function onSearchFocus() {
  if (searchBlurTimer !== null) {
    clearTimeout(searchBlurTimer);
    searchBlurTimer = null;
  }
  const query = keyword.value.trim();
  if (!query) {
    openSearchPanel("history");
    return;
  }
  if (searchCandidateQuery.value === query && searchCandidates.value.length > 1) {
    openSearchPanel("candidates");
    return;
  }
  if (searchPanelMode.value === "loading" && activeSearchQuery.value === query) {
    searchPanelOpen.value = true;
    return;
  }
  searchSuggestions.value = findSearchSuggestions(query);
  openSearchPanel("suggestions");
}

/** 轻微延迟失焦收起，保证 H5/App 点击下拉候选时 tap 事件先完成。 */
function onSearchBlur() {
  if (searchBlurTimer !== null) {
    clearTimeout(searchBlurTimer);
  }
  searchBlurTimer = setTimeout(() => {
    searchPanelOpen.value = false;
    searchBlurTimer = null;
  }, 180);
}

/** 点击搜索框以外的页面区域时收起面板，候选缓存仍保留。 */
function onMenuPageTap() {
  if (searchPanelOpen.value) {
    closeSearchPanel();
  }
}

/** 从本地结果或 AI 返回的菜品中找到当前菜单中的唯一分类卡片。 */
function findDishLocation(dishId: number): { group: MenuGroup; groupIndex: number; dish: Dish } | null {
  const indexedGroups = groups.value.map((group, groupIndex) => ({ group, groupIndex }));
  const orderedGroups = [
    ...indexedGroups.filter(({ group }) => group.key !== "recent" && group.key !== "signature"),
    ...indexedGroups.filter(({ group }) => group.key === "recent" || group.key === "signature"),
  ];
  for (const { group, groupIndex } of orderedGroups) {
    const dish = group.items.find((item) => String(item.dishId) === String(dishId));
    if (dish) {
      return { group, groupIndex, dish };
    }
  }
  return null;
}

/** 定位并高亮一个候选；多结果点选后保留下拉缓存，只收起面板。 */
async function locateSearchDish(dish: Dish, query: string) {
  const target = findDishLocation(dish.dishId);
  if (!target) {
    uni.showToast({ title: "菜品列表已更新，请下拉刷新后重试", icon: "none" });
    return false;
  }
  searchTargetId.value = target.dish.dishId;
  searchTargetGroupKey.value = target.group.key;
  searchTargetKeyword.value = query;
  selectedSearchDishId.value = target.dish.dishId;
  activeCategoryId.value = groupTarget(target.group);
  syncRail(target.groupIndex);
  await scrollToDish(target.dish.dishId, target.group.key, target.groupIndex);
  return true;
}

/** 写入本次主动搜索历史，并同步当前用户/家庭对应的本地列表。 */
function rememberSearch(query: string) {
  searchHistory.value = addSearchHistory(userStore.user?.userId, userStore.user?.deptId, query);
}

/** 将服务端返回项映射回当前菜单快照并按分类展示顺序去重。 */
function mapResultsToMenu(items: Dish[]): Dish[] {
  return orderMenuDishesByIds(getMenuDishesInCategoryOrder(), items);
}

/** 保存当前查询的多结果候选，选中后也保留列表和选中态。 */
function showSearchCandidates(items: Dish[], source: SearchCandidateSource, query: string) {
  searchCandidates.value = items;
  searchCandidateQuery.value = query;
  searchCandidateSource.value = source;
  searchError.value = "";
  openSearchPanel("candidates");
}

/** 单结果直接定位，多结果在下拉框点选；只有两者均无匹配时才请求 AI。 */
async function onSearch() {
  const query = keyword.value.trim();
  if (!query) {
    openSearchPanel("history");
    return;
  }
  // 同一查询的 AI 请求进行中时忽略重复点击，保证一次搜索只对应一个请求生命周期。
  if (searchPanelMode.value === "loading" && activeSearchQuery.value === query) {
    openSearchPanel("loading");
    return;
  }
  if (searchBlurTimer !== null) {
    clearTimeout(searchBlurTimer);
    searchBlurTimer = null;
  }
  rememberSearch(query);

  if (searchCandidateQuery.value === query && searchCandidates.value.length > 1) {
    openSearchPanel("candidates");
    return;
  }

  clearSearchCandidates();
  clearSearchHighlight();
  const localMatches = findLocalDishMatches(query);
  if (localMatches.length === 1) {
    searchPanelOpen.value = false;
    searchSuggestions.value = [];
    await locateSearchDish(localMatches[0], query);
    return;
  }
  if (localMatches.length > 1) {
    showSearchCandidates(localMatches, "local", query);
    return;
  }

  const requestVersion = ++searchRequestVersion;
  const sessionVersion = userStore.sessionVersion;
  activeSearchQuery.value = query;
  searchError.value = "";
  openSearchPanel("loading");
  try {
    const response = await searchDish(query);
    if (
      requestVersion !== searchRequestVersion ||
      sessionVersion !== userStore.sessionVersion ||
      query !== keyword.value.trim()
    ) {
      return;
    }
    activeSearchQuery.value = "";
    const matches = mapResultsToMenu(response?.items || []);
    if (!matches.length) {
      if (response?.items?.length) {
        searchError.value = "菜单刚有更新，请下拉刷新后再试";
        openSearchPanel("error");
      } else {
        openSearchPanel("empty");
      }
      return;
    }
    if (matches.length === 1) {
      searchPanelOpen.value = false;
      await locateSearchDish(matches[0], query);
      return;
    }
    showSearchCandidates(matches, response.source === "ai" ? "ai" : "local", query);
  } catch (error) {
    if (requestVersion !== searchRequestVersion || query !== keyword.value.trim()) {
      return;
    }
    activeSearchQuery.value = "";
    searchError.value = "AI 搜索暂不可用，请稍后重试";
    openSearchPanel("error");
  }
}

/** 选择历史词后按同一本地优先流程搜索。 */
function selectSearchHistory(query: string) {
  keyword.value = query;
  void onSearch();
}

/** 删除一条本地搜索历史。 */
function deleteSearchHistory(query: string) {
  searchHistory.value = removeSearchHistory(userStore.user?.userId, userStore.user?.deptId, query);
}

/** 清空当前登录用户与家庭的全部搜索历史。 */
function deleteAllSearchHistory() {
  clearSearchHistory(userStore.user?.userId, userStore.user?.deptId);
  searchHistory.value = [];
}

/** 点击实时菜名建议后回填菜名并自动执行本地优先搜索。 */
function selectSearchSuggestion(dish: Dish) {
  keyword.value = dish.name;
  void onSearch();
}

/** 选择多结果候选后定位并高亮，随后收起下拉但保留候选列表。 */
async function selectSearchCandidate(dish: Dish) {
  const query = searchCandidateQuery.value || keyword.value.trim();
  const located = await locateSearchDish(dish, query);
  if (located) {
    closeSearchPanel();
  }
}

/**
 * 平滑滚动到指定菜品卡片
 *
 * 先滚到目标菜品所属分组，等分组进入渲染视野后再按菜品相对容器位置二次校准。
 * 这样即使目标菜在很长列表的下方，也不会因为商品尚未渲染而测不到节点。
 * 吸顶分组标题会遮住滚动区顶部，因此定位时额外扣掉标题高度。
 */
async function scrollToDish(dishId: number, groupKey: string, groupIndex: number) {
  const proxy = inst?.proxy;
  if (!proxy || groupIndex < 0) {
    return;
  }
  const targetGroup = groups.value[groupIndex];
  if (!targetGroup) {
    return;
  }
  activeCategoryId.value = groupTarget(targetGroup);
  syncRail(groupIndex);
  categoryPickInFlight = true;
  if (categoryPickTimer !== null) {
    clearTimeout(categoryPickTimer);
    categoryPickTimer = null;
  }
  if (rafId !== null) {
    cancelFrame(rafId);
    rafId = null;
  }
  const version = ++searchPickVersion;

  // 目标菜品尚未渲染时，先把它所属分组带入视口；随后按菜品实测位置定位。
  // 每次定位都使用新的受控目标值，确保 scroll-view 的 watch 一定触发。
  let measure = await measureDishTarget(dishId, groupKey, proxy);
  if (version !== searchPickVersion) {
    return;
  }
  if (!measure) {
    const groupMeasure = await measureGroupTarget(groupIndex, proxy);
    if (version !== searchPickVersion) {
      return;
    }
    if (!groupMeasure) {
      categoryPickInFlight = false;
      return;
    }
    const groupTop = Math.max(0, scrolledTop + groupMeasure.groupTop - groupMeasure.boxTop);
    await applyScrollTop(groupTop);
    await waitForElementRender();
    measure = await measureDishTarget(dishId, groupKey, proxy);
    if (version !== searchPickVersion) {
      return;
    }
  }
  if (!measure) {
    categoryPickInFlight = false;
    return;
  }

  // 只走一次平滑定位：scroll-view 的平滑动画期间继续覆盖 scroll-top，
  // 会让最终位置停在动画起点附近。定位后不再二次写入同一个滚动容器。
  const dishTop = Math.max(0, scrolledTop + measure.dishTop - measure.boxTop - measure.headerHeight);
  await applyScrollTop(dishTop);

  categoryPickTimer = setTimeout(() => {
    if (version === searchPickVersion) {
      categoryPickInFlight = false;
      categoryPickTimer = null;
    }
  }, PICK_SETTLE_MS);
}

/**
 * 设置受控滚动值。
 *
 * uni-app 的 scroll-view 只在 scroll-top 数值变化时执行滚动；
 * 大列表连续搜索到同一道菜时，必须换一个微小但不同的值才会再次定位。
 * 归零后等待下一帧，再赋目标值，确保每次定位都是全新的一轮平滑滚动。
 *
 * @param value 目标滚动距离（px）
 */
async function applyScrollTop(value: number) {
  const next = Math.max(0, Math.round(value));
  scrollSequence = (scrollSequence + 1) % 1000;
  scrollTo.value = 0;
  await nextTick();
  scrollTo.value = next + scrollSequence / 1000;
  await nextTick();
}

/** 等目标分组完成一次渲染，长列表节点在下一帧前可能还查不到 */
function waitForElementRender(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 80);
  });
}

/** 测量目标分组与滚动容器的位置，用于长列表中的第一段滚动 */
function measureGroupTarget(
  groupIndex: number,
  proxy: NonNullable<ReturnType<typeof getCurrentInstance>>["proxy"],
): Promise<{ boxTop: number; groupTop: number } | null> {
  return new Promise((resolve) => {
    const query = uni.createSelectorQuery().in(proxy as unknown as Record<string, unknown>);
    query.select(".menu-dish").boundingClientRect();
    query.selectAll(".menu-group").boundingClientRect();
    query.exec((res: (UniApp.NodeInfo | UniApp.NodeInfo[] | null)[]) => {
      const box = (Array.isArray(res[0]) ? res[0][0] : res[0]) || null;
      const groupRects = Array.isArray(res[1]) ? res[1] : [];
      const groupRect = groupRects[groupIndex] || null;
      if (!box || !groupRect || box.top === undefined || groupRect.top === undefined) {
        resolve(null);
        return;
      }
      resolve({ boxTop: box.top, groupTop: groupRect.top });
    });
  });
}

/** 测量目标菜品与滚动容器的位置，用于第二段精确校准 */
function measureDishTarget(
  dishId: number,
  groupKey: string,
  proxy: NonNullable<ReturnType<typeof getCurrentInstance>>["proxy"],
): Promise<{ boxTop: number; dishTop: number; headerHeight: number } | null> {
  return new Promise((resolve) => {
    const query = uni.createSelectorQuery().in(proxy as unknown as Record<string, unknown>);
    query.select(".menu-dish").boundingClientRect();
    query.select(`#dish-${groupKey}-${dishId}`).boundingClientRect();
    query.select(`#group-header-${groupKey}`).boundingClientRect();
    query.exec((res: (UniApp.NodeInfo | UniApp.NodeInfo[] | null)[]) => {
      const box = (Array.isArray(res[0]) ? res[0][0] : res[0]) || null;
      const dish = (Array.isArray(res[1]) ? res[1][0] : res[1]) || null;
      const groupHeader = (Array.isArray(res[2]) ? res[2][0] : res[2]) || null;
      if (!box || !dish || box.top === undefined || dish.top === undefined) {
        resolve(null);
        return;
      }
      resolve({ boxTop: box.top, dishTop: dish.top, headerHeight: groupHeader?.height || 0 });
    });
  });
}

/** 当前搜索命中的菜品；输入变化后旧高亮自动消失 */
function isSearchHit(group: MenuGroup, dish: Dish): boolean {
  return (
    searchTargetId.value === dish.dishId &&
    searchTargetGroupKey.value === group.key &&
    !!searchTargetKeyword.value &&
    keyword.value.trim().toLowerCase() === searchTargetKeyword.value.toLowerCase()
  );
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

/** 把当前无匹配查询带入提交新菜页面，不自动提交提案。 */
function submitSearchAsProposal() {
  const query = keyword.value.trim();
  if (!query) {
    return;
  }
  // 中文菜名不走 URL query：各端解码次数不一致会把菜名显示成 %XX 乱码
  saveProposalPrefillName(query);
  closeSearchPanel();
  uni.navigateTo({ url: "/pages/proposal/edit" });
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
  await applyScrollTop(target);
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
  <view class="app-fixed app-fixed--topnav" :class="themeRootClass" @tap="onMenuPageTap">
    <GlassNavBar title="今天吃什么" hide-back>
      <template #right>
        <KitchenMessageButton />
      </template>
    </GlassNavBar>

    <view class="app-fixed__head search-head">
      <view class="search-area" @tap.stop>
        <view class="search glass">
          <view class="search__field">
            <wd-input
              v-model="keyword"
              custom-class="search__wd"
              no-border
              :maxlength="128"
              placeholder="搜索菜名 / 食材"
              placeholder-class="search__ph"
              confirm-type="search"
              @input="onSearchInput"
              @focus="onSearchFocus"
              @blur="onSearchBlur"
              @confirm="onSearch"
            >
              <!-- 清空按钮自己画：组件自带的 error-fill 是填充圆点，在玻璃搜索框上像一块灰底 -->
              <template #suffix>
                <view v-if="keyword" class="search__clear" @click.stop="onSearchClear">
                  <text class="search__clear-ic">×</text>
                </view>
              </template>
            </wd-input>
          </view>
          <text class="search__btn" @click.stop="onSearch">
            <image class="search__btn-ic" :src="searchIcon" />
            <text class="search__btn-text">搜索</text>
          </text>
        </view>

        <view v-if="searchPanelOpen" class="search-dropdown glass glass--strong" @tap.stop>
          <template v-if="searchPanelMode === 'history'">
            <view class="search-panel__head">
              <text class="search-panel__title"><text class="search-panel__title-ic">◷</text>最近搜索</text>
              <text v-if="searchHistory.length" class="search-panel__action" @click.stop="deleteAllSearchHistory">清空历史</text>
            </view>
            <view v-if="searchHistory.length" class="search-history-list">
              <view v-for="item in searchHistory" :key="item" class="search-history-row">
                <view class="search-history-row__main" @click.stop="selectSearchHistory(item)">
                  <text class="search-history-row__ic">◷</text>
                  <text class="search-history-row__text">{{ item }}</text>
                </view>
                <text class="search-history-row__remove" @click.stop="deleteSearchHistory(item)">×</text>
              </view>
            </view>
            <view v-else class="search-panel__empty">还没有搜索记录，输入菜名开始找</view>
          </template>

          <template v-else-if="searchPanelMode === 'suggestions'">
            <view class="search-panel__head">
              <text class="search-panel__title"><text class="search-panel__title-ic">✦</text>菜名匹配</text>
              <text class="search-panel__meta">本地实时</text>
            </view>
            <view v-if="searchSuggestions.length" class="search-suggestion-list">
              <view
                v-for="dish in searchSuggestions"
                :key="dish.dishId"
                class="search-suggestion"
                @click.stop="selectSearchSuggestion(dish)"
              >
                <text class="search-suggestion__icon">{{ dishIcon(dish) }}</text>
                <view class="search-suggestion__body">
                  <text class="search-suggestion__name">{{ dish.name }}</text>
                  <text class="search-suggestion__meta">{{ dish.categoryNames || "菜单菜品" }}</text>
                </view>
                <text class="search-suggestion__arrow">›</text>
              </view>
            </view>
            <view v-else class="search-panel__empty">本地没有匹配菜名，点击「搜索」让 AI 帮你找</view>
          </template>

          <template v-else-if="searchPanelMode === 'loading'">
            <view class="search-panel__loading">
              <view class="search-panel__spinner"></view>
              <text>正在从家里的菜单中理解并匹配…</text>
            </view>
          </template>

          <template v-else-if="searchPanelMode === 'candidates'">
            <view class="search-panel__head">
              <text class="search-panel__title">{{ searchCandidateSource === "ai" ? "AI 为你找到" : "菜单中找到" }} {{ searchCandidates.length }} 道菜</text>
              <text class="search-panel__meta">点选定位</text>
            </view>
            <view class="search-candidate-list">
              <view
                v-for="dish in searchCandidates"
                :key="dish.dishId"
                class="search-candidate"
                :class="{ 'search-candidate--selected': String(selectedSearchDishId) === String(dish.dishId) }"
                @click.stop="selectSearchCandidate(dish)"
              >
                <text class="search-candidate__icon">{{ dishIcon(dish) }}</text>
                <view class="search-candidate__body">
                  <text class="search-candidate__name">{{ dish.name }}</text>
                  <text class="search-candidate__meta">{{ dish.categoryNames || "菜单菜品" }}</text>
                </view>
                <text class="search-candidate__selected" v-if="String(selectedSearchDishId) === String(dish.dishId)">已选</text>
                <text class="search-candidate__arrow" v-else>定位 ›</text>
              </view>
            </view>
            <text class="search-panel__hint">选中后下拉收起；查询不变时再次聚焦可恢复候选</text>
          </template>

          <template v-else-if="searchPanelMode === 'empty'">
            <view class="search-panel__empty search-panel__empty--result">
              <text class="search-panel__empty-icon">🍽️</text>
              <text>没有找到「{{ keyword.trim() }}」</text>
            </view>
            <view class="search-new-dish" @click.stop="submitSearchAsProposal">
              <text class="search-new-dish__plus">＋</text>
              <view class="search-new-dish__body">
                <text class="search-new-dish__title">未搜索到菜品，新增？</text>
                <text class="search-new-dish__desc">带上菜名去提交新菜</text>
              </view>
              <text class="search-new-dish__arrow">›</text>
            </view>
          </template>

          <template v-else-if="searchPanelMode === 'error'">
            <view class="search-panel__error">{{ searchError || "搜索暂不可用，请稍后重试" }}</view>
            <text class="search-panel__retry" @click.stop="onSearch">重新搜索</text>
          </template>
        </view>
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
          <view v-for="g in groups" :id="`group-${g.key}`" :key="g.key" class="menu-group">
            <!-- 吸顶分组标题 -->
            <view :id="`group-header-${g.key}`" class="sec-tit">
              <text class="sec-tit__ic">{{ g.icon }}</text>
              <text class="sec-tit__name">{{ g.label }}</text>
              <text class="sec-tit__cnt">{{ g.items.length }} 道</text>
            </view>

            <view
              v-for="dish in g.items"
              :id="`dish-${g.key}-${dish.dishId}`"
              :key="dish.dishId"
              class="dish glass"
              :class="{ 'dish--search-hit': isSearchHit(g, dish) }"
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
/* 固定头部层级高于菜品流，保证搜索下拉始终浮在列表上方。 */
.search-head {
  position: relative;
  z-index: 30;
}

.search-area {
  position: relative;
  z-index: 31;
  margin-bottom: 20rpx;
}

/* 搜索框：玻璃胶囊底由 .glass 提供，这里只负责布局 */
.search {
  display: flex;
  align-items: center;
  gap: 16rpx;
  border-radius: 999rpx;
  padding: 16rpx 12rpx 16rpx 28rpx;
  margin-bottom: 0;
}

/* wd-input 默认带白底与下边框；搜索框本身已是玻璃胶囊，这里全部去掉。
   wd-input 配了 virtualHost，根节点就是 .wd-input，custom-class 会叠加到它上面。 */
.search__field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.search__field :deep(.search__wd) {
  flex: 1;
  min-width: 0;
  background: transparent;
}

.search__field :deep(.search__wd::after) {
  display: none;
}

.search__field :deep(.wd-input__inner) {
  height: 56rpx;
  font-size: 26rpx;
  color: $lg-ink;
}

/* 清空按钮：透明底 + 纯色 ×，不用组件自带带底色的 error-fill 图标 */
.search__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 40rpx;
  margin-left: 8rpx;
  border-radius: 50%;
  background: transparent;
}

.search__clear-ic {
  color: $lg-ink-3;
  font-size: 34rpx;
  line-height: 1;
}

.search__field :deep(.search__ph) {
  color: $lg-ink-3;
}

.search__ph {
  color: $lg-ink-3;
}

.search__btn {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  flex: 0 0 auto;
  font-size: 26rpx;
  color: $lg-accent;
  font-weight: 700;
  padding: 12rpx 26rpx;
  border-radius: 999rpx;
  background: $lg-accent-soft;
}

/* 小号搜索图标：视觉上明显小于按钮文字，且不遮挡「搜索」二字 */
.search__btn-ic {
  width: 26rpx;
  height: 26rpx;
  opacity: 0.9;
}

.search__btn-text {
  line-height: 1;
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 12rpx);
  left: 0;
  right: 0;
  z-index: 40;
  max-height: min(640rpx, 58vh);
  overflow-y: auto;
  padding: 12rpx;
  border-radius: 28rpx;
}

.search-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 8rpx 10rpx 14rpx;
}

.search-panel__title {
  display: flex;
  align-items: center;
  gap: 8rpx;
  color: $lg-ink-2;
  font-size: 23rpx;
  font-weight: 700;
}

.search-panel__title-ic {
  color: $lg-accent;
  font-size: 24rpx;
}

.search-panel__action,
.search-panel__meta {
  color: $lg-ink-3;
  font-size: 21rpx;
}

.search-panel__action {
  padding: 6rpx 10rpx;
  border-radius: 999rpx;
}

.search-panel__empty {
  padding: 28rpx 18rpx;
  color: $lg-ink-3;
  font-size: 23rpx;
  line-height: 1.5;
  text-align: center;
}

.search-panel__empty--result {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
}

.search-panel__empty-icon {
  font-size: 30rpx;
}

.search-panel__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 34rpx 18rpx;
  color: $lg-ink-2;
  font-size: 23rpx;
}

.search-panel__spinner {
  width: 52rpx;
  height: 52rpx;
  border: 4rpx solid $lg-accent-soft;
  border-top-color: $lg-accent;
  border-radius: 50%;
  animation: search-spin 0.8s linear infinite;
}

@keyframes search-spin {
  to { transform: rotate(360deg); }
}

.search-history-list,
.search-suggestion-list,
.search-candidate-list {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.search-history-row,
.search-suggestion,
.search-candidate {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-height: 76rpx;
  padding: 12rpx 14rpx;
  border-radius: 18rpx;
}

.search-history-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.search-history-row__ic {
  color: $lg-ink-3;
  font-size: 23rpx;
}

.search-history-row__text,
.search-suggestion__name,
.search-candidate__name {
  overflow: hidden;
  color: $lg-ink;
  font-size: 24rpx;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-history-row__remove {
  width: 48rpx;
  height: 48rpx;
  line-height: 46rpx;
  border-radius: 50%;
  color: $lg-ink-3;
  font-size: 30rpx;
  text-align: center;
}

.search-suggestion,
.search-candidate {
  border: 1rpx solid transparent;
}

.search-suggestion__icon,
.search-candidate__icon {
  flex: 0 0 54rpx;
  width: 54rpx;
  height: 54rpx;
  line-height: 54rpx;
  border-radius: 16rpx;
  color: $lg-accent;
  background: $lg-accent-soft;
  font-size: 27rpx;
  text-align: center;
}

.search-suggestion__body,
.search-candidate__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5rpx;
}

.search-suggestion__meta,
.search-candidate__meta {
  overflow: hidden;
  color: $lg-ink-3;
  font-size: 20rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-suggestion__arrow,
.search-candidate__arrow {
  color: $lg-ink-3;
  font-size: 29rpx;
}

.search-candidate--selected {
  border-color: $lg-accent-border;
  background: $lg-accent-soft;
}

.search-candidate__selected {
  color: $lg-accent;
  font-size: 20rpx;
  font-weight: 700;
}

.search-panel__hint {
  display: block;
  padding: 10rpx 12rpx 2rpx;
  color: $lg-ink-3;
  font-size: 19rpx;
  line-height: 1.5;
}

.search-panel__error {
  padding: 22rpx 16rpx 12rpx;
  color: $lg-danger;
  font-size: 23rpx;
  text-align: center;
}

.search-panel__retry {
  display: block;
  padding: 12rpx;
  color: $lg-accent;
  font-size: 22rpx;
  font-weight: 700;
  text-align: center;
}

.search-new-dish {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin: 4rpx 6rpx 8rpx;
  padding: 16rpx;
  border: 1rpx dashed $lg-accent-border;
  border-radius: 22rpx;
  background: $lg-accent-soft;
}

.search-new-dish__plus {
  flex: 0 0 54rpx;
  width: 54rpx;
  height: 54rpx;
  line-height: 51rpx;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  font-size: 36rpx;
  text-align: center;
}

.search-new-dish__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.search-new-dish__title {
  color: $lg-accent;
  font-size: 23rpx;
  font-weight: 700;
}

.search-new-dish__desc {
  color: $lg-ink-3;
  font-size: 19rpx;
}

.search-new-dish__arrow {
  color: $lg-accent;
  font-size: 32rpx;
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

/* 搜索结果命中高亮：只强调定位到的菜品，不改变列表内容与顺序 */
.dish--search-hit {
  border-color: $lg-accent-border;
  box-shadow: 0 0 0 4rpx $lg-accent-soft, $lg-shadow;
  animation: search-hit-pulse 1.2s ease-out;
}

@keyframes search-hit-pulse {
  0% {
    box-shadow: 0 0 0 0 $lg-accent-border, $lg-shadow;
  }
  60% {
    box-shadow: 0 0 0 10rpx $lg-accent-soft, $lg-shadow;
  }
  100% {
    box-shadow: 0 0 0 4rpx $lg-accent-soft, $lg-shadow;
  }
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
