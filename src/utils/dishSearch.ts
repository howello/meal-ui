import type { Dish } from "@/types";

/** 菜单分组的可搜索视图：键名用于跳过「最近 / 招牌」等推荐位。 */
export interface SearchableGroup {
  key: string;
  items: Dish[];
}

/**
 * 按分类顺序收集可搜索菜品。
 *
 * <p>推荐位（最近 / 招牌）只是同一道菜的重复卡片，搜索建议、候选和历史定位都以
 * 分类分组中的原始卡片为准，因此这里跳过它们并按 {@code dishId} 去重。</p>
 *
 * @param groups 当前菜单分组
 * @returns 去重后的菜品序列，顺序与右侧菜品流一致
 */
export function collectMenuDishes(groups: SearchableGroup[]): Dish[] {
  const seen = new Set<string>();
  const result: Dish[] = [];
  for (const group of groups) {
    if (group.key === "recent" || group.key === "signature") {
      continue;
    }
    for (const dish of group.items) {
      const id = String(dish.dishId);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      result.push(dish);
    }
  }
  return result;
}

/**
 * 按菜名做包含匹配；忽略前后空白与大小写，不匹配食材与简介。
 *
 * @param dishes 待匹配菜品
 * @param query  用户输入的菜名片段
 * @returns 命中的菜品，保持传入顺序
 */
export function matchDishesByName(dishes: Dish[], query: string): Dish[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return [];
  }
  return dishes.filter((dish) => (dish.name || "").toLocaleLowerCase().includes(normalized));
}

/**
 * 生成下拉建议：完全相等 > 前缀匹配 > 包含匹配，并限制返回条数。
 *
 * <p>同权重时保持菜单原有顺序（Array#sort 在 ES2019 起为稳定排序），
 * 这样用户看到的话题顺序和右侧菜品流一致。</p>
 *
 * @param matches 已命中的菜品
 * @param query   用户输入
 * @param limit   建议条数上限
 * @returns 排序并截断后的建议列表
 */
export function rankSuggestions(matches: Dish[], query: string, limit = 8): Dish[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return [];
  }
  const rank = (dish: Dish): number => {
    const name = (dish.name || "").toLocaleLowerCase();
    return name === normalized ? 0 : name.startsWith(normalized) ? 1 : 2;
  };
  return [...matches].sort((left, right) => rank(left) - rank(right)).slice(0, limit);
}

/**
 * 把后端返回的候选映射回当前菜单快照，并按分类展示顺序排序。
 *
 * <p>后端可能返回菜单快照中已不存在的菜品（例如刚刷新或换家庭），
 * 映射时会被自然过滤，避免定位到不存在的卡片。</p>
 *
 * @param menuDishes 当前菜单在分类顺序下的唯一菜品
 * @param items      后端返回的菜品
 * @returns 可在当前菜单中定位的菜品
 */
export function orderMenuDishesByIds(menuDishes: Dish[], items: Dish[]): Dish[] {
  const ids = new Set(items.map((item) => String(item.dishId)));
  return menuDishes.filter((dish) => ids.has(String(dish.dishId)));
}
