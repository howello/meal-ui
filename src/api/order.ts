import type { Order, OrderAssignee, OrderNotification, PrepPlan } from "@/types";
import { request, requestPage, requestVoid } from "@/utils/request";

export interface SubmitOrderItem {
  dishId: number;
  count: number;
  remark?: string;
}

/** 制作中订单保留的明细，省略的原明细会取消。 */
export interface CookingOrderItemEdit {
  itemId: number;
  dishId: number;
  count: number;
}

/** 通知聚合轮询结果；厨师额外返回待接单与制作中数量 */
export interface OrderNotifyOverview {
  notifications: OrderNotification[];
  pendingCount?: number;
  cookingCount?: number;
}

/** 下单，返回新订单ID；assignUserId 为空表示不指派，进入公开抢单池 */
export function submitOrder(data: {
  items: SubmitOrderItem[];
  orderRemark?: string;
  assignUserId?: number | null;
}) {
  return request<number>({ url: "/meal/order", method: "POST", data });
}

/** 本家庭可指派的厨师，供确认下单页选择 */
export function listOrderAssignees() {
  return request<OrderAssignee[]>({ url: "/meal/order/assignees" });
}

/** 我的订单；scope=chef 时返回当前厨师自己接单制作过的订单 */
export function myOrders(params: { status?: string; pageNum?: number; pageSize?: number; scope?: string }) {
  return requestPage<Order>({ url: "/meal/order/my", data: params });
}

/** 订单详情（含明细） */
export function orderDetail(orderId: number) {
  return request<Order>({ url: `/meal/order/${orderId}` });
}

/** 取消订单（限本人未接单的） */
export function cancelOrder(orderId: number) {
  return requestVoid({ url: `/meal/order/cancel/${orderId}`, method: "PUT" });
}

/** 厨师工作台订单列表（附带明细与等待/制作时长） */
export function kitchenOrders(params: { status?: string; pageNum?: number; pageSize?: number }) {
  return requestPage<Order>({ url: "/meal/order/kitchen/list", data: params });
}

/** 接单 */
export function acceptOrder(orderId: number) {
  return requestVoid({ url: `/meal/order/accept/${orderId}`, method: "PUT" });
}

/** 拒绝这张单：指派单按配置转公开或关闭；公开单在最后一人拒绝时立即关闭 */
export function refuseOrder(orderId: number) {
  return requestVoid({ url: `/meal/order/refuse/${orderId}`, method: "PUT" });
}

/** 标记完成 */
export function finishOrder(orderId: number, expectedVersion?: number) {
  const query = expectedVersion == null ? "" : `?expectedVersion=${expectedVersion}`;
  return requestVoid({ url: `/meal/order/finish/${orderId}${query}`, method: "PUT" });
}

/** 保存制作中的订单菜品。 */
export function editCookingOrder(orderId: number, expectedVersion: number, items: CookingOrderItemEdit[]) {
  return request<Order>({
    url: `/meal/order/kitchen/${orderId}/items`,
    method: "PUT",
    data: { expectedVersion, items },
  });
}

/** 接单厨师取消制作中的整张订单。 */
export function cancelCookingOrder(orderId: number, expectedVersion: number) {
  return requestVoid({
    url: `/meal/order/kitchen/${orderId}/cancel?expectedVersion=${expectedVersion}`,
    method: "PUT",
  });
}

/** 聚合轮询通知与厨师待办，不传客户端身份 ID */
export function pollOrderOverview() {
  return request<OrderNotifyOverview>({ url: "/meal/notify/overview" });
}

/** 该订单的 AI 备菜清单；未生成或已过期时 status=FAILED */
export function prepPlan(orderId: number) {
  return request<PrepPlan>({ url: `/meal/prep-plan/${orderId}` });
}

/** 重新生成该订单的备菜清单（后台线程执行，返回生成中占位） */
export function regeneratePrepPlan(orderId: number) {
  return request<PrepPlan>({ url: `/meal/prep-plan/${orderId}/regenerate`, method: "POST" });
}
