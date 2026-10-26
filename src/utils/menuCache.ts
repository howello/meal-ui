/** 菜单内存快照结构：只在 App 运行期间保留，不写入 storage */
import type { Category, Dish } from "@/types";

export interface MenuSnapshot {
  categories: Category[];
  dishes: Dish[];
  signatures: Dish[];
}

/** 进程级菜单缓存；页面卸载后仍保留，App 关闭/刷新自然销毁 */
let menuCache: { get(): MenuSnapshot | null; set(snapshot: MenuSnapshot): void; clear(): void } | null = null;

/**
 * 获取进程级菜单缓存（惰性创建）。
 *
 * 不落 storage，避免下一次 App 启动继续使用旧菜品列表。
 */
export function getMenuCache(): { get(): MenuSnapshot | null; set(snapshot: MenuSnapshot): void; clear(): void } {
  if (!menuCache) {
    let snapshot: MenuSnapshot | null = null;
    menuCache = {
      get: () => snapshot,
      set: (value: MenuSnapshot) => {
        snapshot = value;
      },
      clear: () => {
        snapshot = null;
      },
    };
  }
  return menuCache;
}

/**
 * 读取进程内菜单快照。
 *
 * @returns 菜单快照；无缓存时返回 null
 */
export function consumeMenuCache(): MenuSnapshot | null {
  return getMenuCache().get();
}

/** 菜品变更标记：编辑保存后置位，点餐区下次显示时强制重拉 */
const MENU_DIRTY_KEY = "meal-menu-dirty";

/**
 * 清空进程内菜单快照。
 *
 * 编辑/删除菜品后调用，确保菜单页下一次进入时重新请求。
 */
export function clearMenuCache(): void {
  getMenuCache().clear();
}

/**
 * 标记菜单数据已变更
 *
 * 菜品编辑（含上下架）保存成功后调用；本地缓存不可用不影响保存结果。
 */
export function markMenuDirty(): void {
  try {
    uni.setStorageSync(MENU_DIRTY_KEY, "1");
  } catch (e) {
    // 本地缓存不可用不影响主流程
  }
}

/**
 * 读取并清除菜单变更标记
 *
 * @returns true 表示自上次展示后菜单有变更，调用方应强制重新拉取
 */
export function consumeMenuDirty(): boolean {
  try {
    if (uni.getStorageSync(MENU_DIRTY_KEY)) {
      uni.removeStorageSync(MENU_DIRTY_KEY);
      return true;
    }
  } catch (e) {
    // 读不到标记时按无变更处理
  }
  return false;
}
