import type { Category, Dish } from "@/types";
import { request, requestPage, requestVoid } from "@/utils/request";

// 点餐端要一次拿到全量数据：左侧分类栏、右侧「按分类分组」都在前端完成。
// 后端菜品/分类列表走 RuoYi 分页且默认 pageSize=10，不显式放大就只返回前 10 条，
// 表现为「每个分类只显示一道菜」（分页按 sort 排序，前 10 条正好覆盖每个分类的首道菜）。
const ALL_PAGE_SIZE = 1000;

/** 分类列表（公共分类 + 本家庭私有分类），取全量 */
export function listCategory(params?: { name?: string }) {
  return requestPage<Category>({
    url: "/meal/category/list",
    data: { pageSize: ALL_PAGE_SIZE, ...params },
  });
}

/** 菜品列表，支持按分类与关键词筛选，取全量；默认只返回上架菜品 */
export function listDish(params: { categoryId?: number; keyword?: string; status?: string }) {
  return requestPage<Dish>({
    url: "/meal/dish/list",
    data: { pageSize: ALL_PAGE_SIZE, ...params, status: params.status ?? "0" },
  });
}

/** 菜品详情（含用料、做法与小贴士） */
export function getDish(dishId: number) {
  return request<Dish>({ url: `/meal/dish/${dishId}` });
}

/**
 * 招牌推荐位：本家庭近 90 天已完成订单中按份数取前 3 道仍上架的菜
 *
 * 招牌不是分类、不落库、不可写入；只读接口，登录即可调用。
 */
export function listSignatureDishes() {
  return request<Dish[]>({ url: "/meal/dish/signature" });
}

/** 更新菜品（需要 meal:dish:edit 权限，厨师 / 家庭管理员可用） */
export function updateDish(data: Partial<Dish> & { dishId: number }) {
  return requestVoid({ url: "/meal/dish", method: "PUT", data });
}

/**
 * AI 更新菜品：从完整做法中提取文本字段并在服务端异步落库
 *
 * 接口校验权限后立即返回，提取与保存在线程池执行；调用成功后应返回详情页稍后刷新。
 */
export function aiUpdateDish(data: { dishId: number; text: string }) {
  return requestVoid({ url: "/meal/dish/ai-update", method: "POST", data });
}
