import { defineStore } from "pinia";
import type { Dish } from "@/types";

const CART_KEY = "meal-cart";

/** 购物车行 */
export interface CartLine {
  dishId: number;
  dishName: string;
  dishCover?: string;
  count: number;
  remark?: string;
}

interface CartState {
  lines: CartLine[];
}

/**
 * 购物车
 *
 * 只存在本地（`uni.setStorageSync`），下单时一次性提交，后端没有购物车表。
 * 家庭场景是「一个人点自己想吃的那几道」，不需要多人共享同一份购物车。
 */
export const useCartStore = defineStore("cart", {
  state: (): CartState => ({
    lines: [],
  }),
  getters: {
    totalCount: (state): number => state.lines.reduce((sum, line) => sum + line.count, 0),
    dishKinds: (state): number => state.lines.length,
    isEmpty: (state): boolean => state.lines.length === 0,
  },
  actions: {
    restore() {
      const raw = uni.getStorageSync(CART_KEY);
      if (!raw) {
        return;
      }
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        this.lines = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        this.lines = [];
      }
    },
    persist() {
      uni.setStorageSync(CART_KEY, JSON.stringify(this.lines));
    },
    add(dish: Dish, count = 1, remark = "") {
      const exist = this.lines.find((line) => line.dishId === dish.dishId);
      if (exist) {
        exist.count += count;
        if (remark) {
          exist.remark = remark;
        }
      } else {
        this.lines.push({
          dishId: dish.dishId,
          dishName: dish.name,
          dishCover: dish.cover,
          count,
          remark,
        });
      }
      this.persist();
    },
    updateCount(dishId: number, count: number) {
      const line = this.lines.find((item) => item.dishId === dishId);
      if (!line) {
        return;
      }
      if (count <= 0) {
        this.lines = this.lines.filter((item) => item.dishId !== dishId);
      } else {
        line.count = count;
      }
      this.persist();
    },
    updateRemark(dishId: number, remark: string) {
      const line = this.lines.find((item) => item.dishId === dishId);
      if (line) {
        line.remark = remark;
        this.persist();
      }
    },
    remove(dishId: number) {
      this.lines = this.lines.filter((item) => item.dishId !== dishId);
      this.persist();
    },
    clear() {
      this.lines = [];
      this.persist();
    },
  },
});
