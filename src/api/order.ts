import type { Order } from "@/types";
import { request, requestPage, requestVoid } from "@/utils/request";

export interface SubmitOrderItem {
  dishId: number;
  count: number;
  remark?: string;
}

/** 下单，返回新订单ID */
export function submitOrder(data: { items: SubmitOrderItem[]; orderRemark?: string }) {
  return request<number>({ url: "/meal/order", method: "POST", data });
}

/** 我的订单 */
export function myOrders(params: { status?: string; pageNum?: number; pageSize?: number }) {
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

/** 标记完成 */
export function finishOrder(orderId: number) {
  return requestVoid({ url: `/meal/order/finish/${orderId}`, method: "PUT" });
}
