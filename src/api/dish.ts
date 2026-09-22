import type { Category, Dish } from "@/types";
import { request, requestPage } from "@/utils/request";

/** 分类列表（公共分类 + 本家庭私有分类） */
export function listCategory(params?: { name?: string }) {
  return requestPage<Category>({ url: "/meal/category/list", data: params });
}

/** 菜品列表，支持按分类与关键词筛选 */
export function listDish(params: { categoryId?: number; keyword?: string }) {
  return requestPage<Dish>({ url: "/meal/dish/list", data: params });
}

/** 菜品详情（含用料、做法与小贴士） */
export function getDish(dishId: number) {
  return request<Dish>({ url: `/meal/dish/${dishId}` });
}
