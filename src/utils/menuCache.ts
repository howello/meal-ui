/**
 * 点餐区菜单本地缓存 key（分类 + 全量上架菜品）
 *
 * 带版本后缀：新增「最近 5 天」分组后递增版本，让不含 createTime 的旧缓存自然失效。
 */
export const MENU_CACHE_KEY = "meal-menu-cache-v3";

/** 菜品变更标记：编辑保存后置位，点餐区下次显示时强制重拉 */
const MENU_DIRTY_KEY = "meal-menu-dirty";

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
