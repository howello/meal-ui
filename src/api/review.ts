import type { Review } from "@/types";
import { requestPage, requestVoid } from "@/utils/request";

export interface SubmitReviewBody {
  orderId: number;
  score: number;
  content?: string;
  /** JSON 字符串，形如 ["https://..."] */
  images?: string;
  anonymous?: string;
}

/** 提交评价（限本人已完成且未评价的订单） */
export function submitReview(data: SubmitReviewBody) {
  return requestVoid({ url: "/meal/review", method: "POST", data });
}

/** 我的评价 */
export function myReviews(params?: { pageNum?: number; pageSize?: number }) {
  return requestPage<Review>({ url: "/meal/review/my", data: params });
}
