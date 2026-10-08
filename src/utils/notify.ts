import { pollOrderNotifications } from "@/api/order";
import { useUserStore } from "@/store/user";
import { ROLE_CHEF, type OrderNotification } from "@/types";
import { onAppHide, onAppShow, onHide, onShow, onUnload } from "@dcloudio/uni-app";

const INTERVAL_MS = 5000;
const SEEN_KEY = "meal-notify-seen";
const MAX_SEEN_IDS = 500;
const MAX_PENDING_PER_SESSION = 100;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let polling = false;
let appForeground = true;
let lifecycleVersion = 0;
let activeSession = "";
let seenIds = new Set<string>();
const activePages = new Set<object>();
const pendingBySession = new Map<string, OrderNotification[]>();

/** 生成仅用于隔离前端去重缓存和在途响应的当前会话标识。 */
function getSessionKey(): string {
  const userStore = useUserStore();
  return userStore.isLogin ? `${userStore.user?.userId ?? "unknown"}:${userStore.token}` : "";
}

/** 切换登录会话时恢复该账号自己的已读通知记录。 */
function activateSession(sessionKey: string): void {
  if (activeSession === sessionKey) {
    return;
  }
  activeSession = sessionKey;
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
    const plus = (window as unknown as { plus?: any }).plus;
    if (typeof plus?.push?.createMessage === "function") {
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

/** 读取当前登录身份的一条通知队列。 */
async function pollRole(role: "user" | "chef"): Promise<OrderNotification[]> {
  try {
    return (await pollOrderNotifications(role)) || [];
  } catch (e) {
    return [];
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

/** 轮询登录用户队列及其厨师个人队列，并按通知 ID 去重展示。 */
async function pollNotifications(): Promise<void> {
  if (polling || !running) {
    return;
  }
  const userStore = useUserStore();
  const sessionKey = getSessionKey();
  if (!sessionKey) {
    stopOrderNotifier();
    return;
  }
  activateSession(sessionKey);
  polling = true;
  const requestVersion = lifecycleVersion;

  try {
    const roles: Array<"user" | "chef"> = ["user"];
    if (userStore.roles.includes(ROLE_CHEF)) {
      roles.push("chef");
    }
    const batches = await Promise.all(roles.map((role) => pollRole(role)));
    const received = batches.flat();

    // 会话切换后的迟到响应只可回到原账号队列，不能并入当前账号通知。
    if (getSessionKey() !== sessionKey || activeSession !== sessionKey) {
      return;
    }
    if (!running || requestVersion !== lifecycleVersion) {
      stashNotifications(sessionKey, received);
      return;
    }

    const candidates = [...(pendingBySession.get(sessionKey) || []), ...received]
      .filter((item) => item?.id && !seenIds.has(item.id));
    pendingBySession.delete(sessionKey);
    const unique = Array.from(new Map(candidates.map((item) => [item.id, item])).values());
    unique.sort((left, right) => left.createTime - right.createTime);
    if (unique.length > 0) {
      rememberSeenIds(sessionKey, unique);
      showNotifications(unique);
    }
  } catch (e) {
    // 单轮失败不影响业务和下一次轮询。
  } finally {
    polling = false;
  }
}

/** 调度固定间隔轮询，前一请求结束后才安排下一轮。 */
function scheduleNextPoll(version: number): void {
  if (!running || version !== lifecycleVersion || timer !== null) {
    return;
  }
  timer = setTimeout(async () => {
    timer = null;
    if (!running || version !== lifecycleVersion) {
      return;
    }
    await pollNotifications();
    scheduleNextPoll(version);
  }, INTERVAL_MS);
}

/** 有页面可见且应用位于前台时启动单一轮询器。 */
function startPolling(): void {
  if (running || !appForeground || activePages.size === 0 || !getSessionKey()) {
    return;
  }
  running = true;
  lifecycleVersion += 1;
  activateSession(getSessionKey());
  const version = lifecycleVersion;
  void pollNotifications().finally(() => scheduleNextPoll(version));
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
export function useOrderNotifierLifecycle(): void {
  const pageToken = {};
  let active = false;
  const start = () => {
    if (!active) {
      active = true;
      activePages.add(pageToken);
    }
    startPolling();
  };
  const stop = () => {
    if (!active) {
      return;
    }
    active = false;
    activePages.delete(pageToken);
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

/** 退出登录时清理轮询及本地会话状态。 */
export function stopOrderNotifier(): void {
  activePages.clear();
  pendingBySession.clear();
  activeSession = "";
  seenIds.clear();
  pausePolling();
}
