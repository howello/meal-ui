import { pollOrderOverview, type OrderNotifyOverview } from "@/api/order";
import { useUserStore } from "@/store/user";
import type { OrderNotification } from "@/types";
import { computed, ref } from "vue";
import { onAppHide, onAppShow, onHide, onShow, onUnload } from "@dcloudio/uni-app";

/** 活跃轮询间隔：有通知或刚恢复可见时保持最高实时性 */
const ACTIVE_INTERVAL_MS = 5000;
/** 连续空结果时逐级退避，上限 30 秒 */
const IDLE_INTERVALS_MS = [ACTIVE_INTERVAL_MS, 15000, 30000];
/** 每累计 3 次空结果提升一级退避，避免偶发空轮询就降速 */
const EMPTY_POLLS_PER_STEP = 3;
/** 页面与 App 同时恢复时合并极短时间内的重复立即请求 */
const IMMEDIATE_REQUEST_DEDUPE_MS = 1000;
const SEEN_KEY = "meal-notify-seen";
const MAX_SEEN_IDS = 500;
const MAX_PENDING_PER_SESSION = 100;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let polling = false;
let appForeground = true;
let lifecycleVersion = 0;
let activeSession = "";
let idleLevel = 0;
let emptyPollCount = 0;
let lastPollStartedAt = 0;
let seenIds = new Set<string>();
const kitchenTodoCountState = ref(0);
const activePages = new Set<object>();
const pageNotificationHandlers = new Map<object, (notifications: OrderNotification[]) => void>();
const pendingBySession = new Map<string, OrderNotification[]>();

/** 厨师待办角标总数，由通知轮询的聚合结果更新，组件不再单独请求 */
export const kitchenTodoCount = computed(() => kitchenTodoCountState.value);

/** 页面注册的通知回调；同一批通知只回调一次，页面内部再做刷新节流 */
export interface OrderNotifierLifecycleOptions {
  onNotifications?: (notifications: OrderNotification[]) => void;
}

/** 通知触发的列表刷新节流器 */
export interface OrderRefreshThrottle {
  /** 请求调度一次刷新；窗口期内的多次通知会合并 */
  trigger(): void;
  /** 页面卸载时清理定时器 */
  dispose(): void;
}

/** 生成仅用于隔离前端去重缓存和在途响应的当前会话标识。 */
function getSessionKey(): string {
  const userStore = useUserStore();
  return userStore.isLogin ? `${userStore.user?.userId ?? "unknown"}:${userStore.token}` : "";
}

/** 清空空闲退避状态，下一次通知后重新按 5 秒轮询。 */
function resetIdleBackoff(): void {
  idleLevel = 0;
  emptyPollCount = 0;
}

/** 记录一次成功轮询结果，按连续空结果次数逐级退避。 */
function applyPollResult(hadNotifications: boolean): void {
  if (hadNotifications) {
    resetIdleBackoff();
    return;
  }
  emptyPollCount += 1;
  if (emptyPollCount >= EMPTY_POLLS_PER_STEP && idleLevel < IDLE_INTERVALS_MS.length - 1) {
    idleLevel += 1;
    emptyPollCount = 0;
  }
}

/** 切换登录会话时恢复该账号自己的已读通知记录。 */
function activateSession(sessionKey: string): void {
  if (activeSession === sessionKey) {
    return;
  }
  activeSession = sessionKey;
  kitchenTodoCountState.value = 0;
  restoreSeenIds(sessionKey);
}

/** 恢复当前登录账号最近处理过的通知 ID。 */
function restoreSeenIds(sessionKey: string): void {
  try {
    const stored = uni.getStorageSync(SEEN_KEY);
    const records = stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
    const ids = records[sessionKey];
    seenIds = Array.isArray(ids)
      ? new Set(ids.filter((id): id is string => typeof id === "string").slice(-MAX_SEEN_IDS))
      : new Set();
  } catch (e) {
    seenIds = new Set();
  }
}

/** 保存当前账号展示过的通知 ID，并限制本地记录大小。 */
function rememberSeenIds(sessionKey: string, notifications: OrderNotification[]): void {
  notifications.forEach((item) => seenIds.add(item.id));
  while (seenIds.size > MAX_SEEN_IDS) {
    const oldest = seenIds.values().next().value;
    if (oldest === undefined) {
      break;
    }
    seenIds.delete(oldest);
  }
  try {
    const stored = uni.getStorageSync(SEEN_KEY);
    const records = stored && typeof stored === "object" && !Array.isArray(stored)
      ? { ...(stored as Record<string, unknown>) }
      : {};
    records[sessionKey] = Array.from(seenIds);
    uni.setStorageSync(SEEN_KEY, records);
  } catch (e) {
    // 本地缓存不可用时仍展示当前通知。
  }
}

/** 按运行平台统一展示通知。 */
function showNotifications(notifications: OrderNotification[]): void {
  if (notifications.length === 0) {
    return;
  }
  const content = notifications.map((item) => `${item.title}\n${item.content}`).join("\n\n");

  // #ifdef APP-PLUS
  try {
    // 注意：App 逻辑层跑在 app-service JS 引擎里，没有 DOM/window，
    // 5+ 能力必须用裸 plus（从 window 上取 plus 会拿不到，异常还会被下面的 catch 吞掉，
    // 结果是系统通知永远发不出、静默回落成应用内弹窗）。
    if (typeof plus !== "undefined" && plus.push && typeof plus.push.createMessage === "function") {
      notifications.forEach((item) => {
        plus.push.createMessage(item.content, JSON.stringify({ orderId: item.orderId, type: item.type }), {
          title: item.title,
          cover: false,
        });
      });
      return;
    }
  } catch (e) {
    // App 本地通知能力不可用时回退到可见提示。
  }
  uni.showModal({ title: "订单通知", content, showCancel: false });
  // #endif

  // #ifdef MP
  uni.showModal({ title: "订单通知", content, showCancel: false });
  // #endif
  // #ifdef H5
  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(content);
  } else {
    uni.showModal({ title: "订单通知", content, showCancel: false });
  }
  // #endif
}

/** 将当前可见页面的通知回调作为一批事件分发给订阅者。 */
function dispatchNotifications(notifications: OrderNotification[]): void {
  if (notifications.length === 0) {
    return;
  }
  Array.from(pageNotificationHandlers.values()).forEach((handler) => {
    try {
      handler(notifications);
    } catch (e) {
      // 单个页面的刷新异常不能阻断其他页面和通知展示。
    }
  });
}

/** 用聚合轮询结果更新厨师待办角标；统计失败时保留上一次数值。 */
function applyKitchenSummary(overview: OrderNotifyOverview): void {
  if (typeof overview.pendingCount === "number" && typeof overview.cookingCount === "number") {
    kitchenTodoCountState.value = Math.max(0, Number(overview.pendingCount) + Number(overview.cookingCount));
  }
}

/** 暂存当前账号已读取但因页面隐藏尚未展示的消息。 */
function stashNotifications(sessionKey: string, notifications: OrderNotification[]): void {
  if (!sessionKey || notifications.length === 0) {
    return;
  }
  const pending = pendingBySession.get(sessionKey) || [];
  pendingBySession.set(sessionKey, [...pending, ...notifications].slice(-MAX_PENDING_PER_SESSION));
}

/** 请求一次聚合接口，合并通知队列并更新角标。 */
async function pollNotifications(version: number): Promise<void> {
  if (polling || !running) {
    return;
  }
  const sessionKey = getSessionKey();
  if (!sessionKey) {
    stopOrderNotifier();
    return;
  }
  activateSession(sessionKey);
  polling = true;

  try {
    const overview = await pollOrderOverview();
    if (getSessionKey() !== sessionKey || activeSession !== sessionKey) {
      return;
    }
    if (!running || version !== lifecycleVersion) {
      stashNotifications(sessionKey, overview.notifications || []);
      return;
    }

    applyKitchenSummary(overview);
    const received = overview.notifications || [];
    const candidates = [...(pendingBySession.get(sessionKey) || []), ...received]
      .filter((item) => item?.id && !seenIds.has(item.id));
    pendingBySession.delete(sessionKey);
    const unique = Array.from(new Map(candidates.map((item) => [item.id, item])).values());
    unique.sort((left, right) => left.createTime - right.createTime);

    if (unique.length > 0) {
      rememberSeenIds(sessionKey, unique);
      dispatchNotifications(unique);
      showNotifications(unique);
    }
    applyPollResult(received.length > 0 || unique.length > 0);
  } catch (e) {
    // 请求失败不提升退避等级，下一轮按当前间隔继续重试。
  } finally {
    polling = false;
  }
}

/** 调度下一次轮询，且始终保证只有一个未完成的定时器。 */
function scheduleNextPoll(version: number, delay = IDLE_INTERVALS_MS[idleLevel]): void {
  if (!running || version !== lifecycleVersion || timer !== null) {
    return;
  }
  timer = setTimeout(() => {
    timer = null;
    if (!running || version !== lifecycleVersion) {
      return;
    }
    lastPollStartedAt = Date.now();
    void pollNotifications(version).finally(() => scheduleNextPoll(version));
  }, delay);
}

/** 页面恢复可见时清空退避并立即补一次；极短时间内的重复恢复请求会合并。 */
function requestImmediatePoll(version: number): void {
  if (!running || version !== lifecycleVersion) {
    return;
  }
  resetIdleBackoff();
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (polling) {
    return;
  }
  if (Date.now() - lastPollStartedAt < IMMEDIATE_REQUEST_DEDUPE_MS) {
    scheduleNextPoll(version, ACTIVE_INTERVAL_MS);
    return;
  }
  lastPollStartedAt = Date.now();
  void pollNotifications(version).finally(() => scheduleNextPoll(version));
}

/** 有页面可见且应用位于前台时启动或唤醒单一轮询器。 */
function startPolling(): void {
  if (!appForeground || activePages.size === 0 || !getSessionKey()) {
    return;
  }
  if (!running) {
    running = true;
    lifecycleVersion += 1;
    lastPollStartedAt = 0;
    resetIdleBackoff();
    activateSession(getSessionKey());
  }
  requestImmediatePoll(lifecycleVersion);
}

/** 暂停轮询并使当前在途响应失效。 */
function pausePolling(): void {
  if (!running) {
    return;
  }
  running = false;
  lifecycleVersion += 1;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** 每个登录页面独立登记生命周期，页面之间共享唯一轮询实例。 */
export function useOrderNotifierLifecycle(options: OrderNotifierLifecycleOptions = {}): void {
  const pageToken = {};
  let active = false;
  const start = () => {
    if (!active) {
      active = true;
      activePages.add(pageToken);
      if (options.onNotifications) {
        pageNotificationHandlers.set(pageToken, options.onNotifications);
      }
    }
    startPolling();
  };
  const stop = () => {
    if (!active) {
      return;
    }
    active = false;
    activePages.delete(pageToken);
    pageNotificationHandlers.delete(pageToken);
    if (activePages.size === 0) {
      pausePolling();
    }
  };
  onShow(start);
  onHide(stop);
  onUnload(stop);
}

/** 由 App 根组件管理应用前后台状态。 */
export function useOrderNotifierAppLifecycle(): void {
  onAppShow(() => {
    appForeground = true;
    startPolling();
  });
  onAppHide(() => {
    appForeground = false;
    pausePolling();
  });
  startPolling();
}

/**
 * 创建通知列表刷新节流器。
 *
 * <p>600ms 窗口内收到的多条通知只刷新一次；若刷新尚未结束时又收到通知，
 * 会在当前请求结束后再补刷一次，避免丢更新。</p>
 */
export function createOrderRefreshThrottle(
  refresh: () => void | Promise<void>,
  delayMs = 600,
): OrderRefreshThrottle {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let runningRefresh = false;
  let queued = false;
  let disposed = false;

  const schedule = () => {
    if (disposed || refreshTimer !== null) {
      return;
    }
    refreshTimer = setTimeout(flush, delayMs);
  };

  const flush = async () => {
    refreshTimer = null;
    if (disposed) {
      return;
    }
    if (runningRefresh) {
      queued = true;
      return;
    }
    runningRefresh = true;
    try {
      await refresh();
    } catch (e) {
      // 页面加载函数自行提示错误，这里只负责调度。
    } finally {
      runningRefresh = false;
      if (queued && !disposed) {
        queued = false;
        schedule();
      }
    }
  };

  return {
    trigger() {
      if (disposed) {
        return;
      }
      if (refreshTimer !== null) {
        return;
      }
      if (runningRefresh) {
        queued = true;
        return;
      }
      schedule();
    },
    dispose() {
      disposed = true;
      queued = false;
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    },
  };
}

/** 退出登录时清理轮询及本地会话状态。 */
export function stopOrderNotifier(): void {
  activePages.clear();
  pageNotificationHandlers.clear();
  pendingBySession.clear();
  activeSession = "";
  seenIds.clear();
  kitchenTodoCountState.value = 0;
  resetIdleBackoff();
  pausePolling();
}
