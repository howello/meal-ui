import type { Category, Dish, DishAiUpdateResult } from "@/types";
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

/** 菜品列表，支持按分类与关键词筛选，取全量 */
export function listDish(params: { categoryId?: number; keyword?: string }) {
  return requestPage<Dish>({
    url: "/meal/dish/list",
    data: { pageSize: ALL_PAGE_SIZE, ...params },
  });
}

/** 菜品详情（含用料、做法与小贴士） */
export function getDish(dishId: number) {
  return request<Dish>({ url: `/meal/dish/${dishId}` });
}

/** 更新菜品（需要 meal:dish:edit 权限，厨师 / 家庭管理员可用） */
export function updateDish(data: Partial<Dish> & { dishId: number }) {
  return requestVoid({ url: "/meal/dish", method: "PUT", data });
}

/**
 * AI 更新菜品：从完整做法中提取文本字段并直接落库
 *
 * 未提取到的字段保留原值；返回本次写入的字段与更新后的菜品。
 */
export function aiUpdateDish(data: { dishId: number; text: string }) {
  return request<DishAiUpdateResult>({ url: "/meal/dish/ai-update", method: "POST", data });
}
