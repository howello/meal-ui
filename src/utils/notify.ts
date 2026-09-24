import { myOrders, kitchenOrders } from "@/api/order";
import { useUserStore } from "@/store/user";
import { ORDER_STATUS, type Order } from "@/types";

/**
 * 订单流转提醒（前端轮询方案）
 *
 * 当前 meal-ui 同时部署 H5 与 App：H5 没有系统推送能力，只能用页面内 toast；
 * App 端用 5+ 本地通知（`plus.push.createMessage`），让切到后台的厨师也能收到提醒。
 * 轮询只在用户已登录且在前台时工作，检测状态变化后弹提醒。
 *
 * 覆盖：新订单（厨师端）、已接单 / 已完成（客户端）。"评价→厨师"暂缓（无厨师视角评价接口）。
 */

let timer: ReturnType<typeof setInterval> | null = null;
let lastMode = "";
let waitingIds = new Set<number>();
let myStatus = new Map<number, string>();

const INTERVAL_MS = 15000;

function summarize(items?: Order["items"]): string {
  const names = (items || []).slice(0, 3).map((i) => i.dishName);
  const tail = (items?.length || 0) > 3 ? " 等" : "";
  return names.join("、") + tail;
}

/** 提醒呈现：App 端本地通知，H5 端 toast */
function notify(title: string, content: string) {
  // #ifdef APP-PLUS
  try {
    const plus = (window as unknown as { plus?: any }).plus;
    if (plus?.push && typeof plus.push.createMessage === "function") {
      plus.push.createMessage(content, "", { title });
      return;
    }
    if (typeof plus?.localNotification === "function") {
      plus.localNotification({ title, content, cover: false });
      return;
    }
  } catch (e) {
    // 本地通知不可用时退回 toast
  }
  // #endif
  uni.showToast({ title: `${title}｜${content}`, icon: "none", duration: 3000 });
}

function resetBaseline() {
  waitingIds = new Set();
  myStatus = new Map();
}

async function tick() {
  const userStore = useUserStore();
  if (!userStore.isLogin) {
    return;
  }
  const mode = userStore.canKitchen && userStore.viewMode === "kitchen" ? "kitchen" : "eater";
  if (mode !== lastMode) {
    lastMode = mode;
    resetBaseline();
  }

  try {
    if (mode === "kitchen") {
      const res = await kitchenOrders({ status: ORDER_STATUS.WAITING, pageSize: 50 });
      const rows = res.rows || [];
      if (waitingIds.size > 0) {
        rows
          .filter((o) => !waitingIds.has(o.orderId))
          .forEach((o) => {
            notify("新订单来了", `${o.userName || "家人"} 点了 ${o.totalCount || 0} 份：${summarize(o.items)}`);
          });
      }
      waitingIds = new Set(rows.map((o) => o.orderId));
    } else {
      const res = await myOrders({ pageNum: 1, pageSize: 50 });
      (res.rows || []).forEach((o) => {
        const prev = myStatus.get(o.orderId);
        if (prev !== undefined && prev !== o.status) {
          if (o.status === ORDER_STATUS.COOKING) {
            notify("订单更新", `「${summarize(o.items)}」厨师已接单，正在制作`);
          } else if (o.status === ORDER_STATUS.FINISHED) {
            notify("订单完成", `「${summarize(o.items)}」已完成，快来取餐`);
          }
        }
        myStatus.set(o.orderId, o.status);
      });
    }
  } catch (e) {
    // 轮询失败不影响主流程
  }
}

export function startOrderNotifier() {
  if (timer != null) {
    return;
  }
  timer = setInterval(tick, INTERVAL_MS);
  tick();
}

export function stopOrderNotifier() {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
  lastMode = "";
  resetBaseline();
}
