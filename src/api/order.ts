import type { Order, OrderAssignee, OrderNotification } from "@/types";
import { request, requestPage, requestVoid } from "@/utils/request";

export interface SubmitOrderItem {
  dishId: number;
  count: number;
  remark?: string;
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
export function finishOrder(orderId: number) {
  return requestVoid({ url: `/meal/order/finish/${orderId}`, method: "PUT" });
}

/** 聚合轮询通知与厨师待办，不传客户端身份 ID */
export function pollOrderOverview() {
  return request<OrderNotifyOverview>({ url: "/meal/notify/overview" });
}
