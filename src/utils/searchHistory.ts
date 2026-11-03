/** 点餐区搜索历史上限，避免下拉面板无限增长。 */
const SEARCH_HISTORY_LIMIT = 10;
const SEARCH_HISTORY_PREFIX = "meal-search-history";

/** 按用户和家庭隔离搜索历史；平台管理员无家庭时使用 platform。 */
function getStorageKey(userId: number, deptId?: number): string {
  return `${SEARCH_HISTORY_PREFIX}:${userId}:${deptId ?? "platform"}`;
}

/** 规范化本地历史数据，损坏或过期格式一律安全降级为空列表。 */
function normalizeHistory(value: unknown): string[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") {
      continue;
    }
    const query = item.trim();
    if (!query || seen.has(query)) {
      continue;
    }
    seen.add(query);
    result.push(query);
    if (result.length >= SEARCH_HISTORY_LIMIT) {
      break;
    }
  }
  return result;
}

/** 读取当前用户与家庭的本地搜索历史。 */
export function readSearchHistory(userId?: number, deptId?: number): string[] {
  if (userId == null) {
    return [];
  }
  try {
    return normalizeHistory(uni.getStorageSync(getStorageKey(userId, deptId)));
  } catch (e) {
    return [];
  }
}

/** 写入一次搜索历史；重复词提升到最前，最多保留最近十条。 */
export function addSearchHistory(userId: number | undefined, deptId: number | undefined, value: string): string[] {
  const query = value.trim();
  if (userId == null || !query) {
    return readSearchHistory(userId, deptId);
  }
  const history = [query, ...readSearchHistory(userId, deptId).filter((item) => item !== query)].slice(
    0,
    SEARCH_HISTORY_LIMIT,
  );
  try {
    uni.setStorageSync(getStorageKey(userId, deptId), history);
  } catch (e) {
    // 本地存储不可用时只降级历史能力，不影响菜品搜索。
  }
  return history;
}

/** 删除当前用户与家庭的一条搜索历史。 */
export function removeSearchHistory(userId: number | undefined, deptId: number | undefined, value: string): string[] {
  if (userId == null) {
    return [];
  }
  const history = readSearchHistory(userId, deptId).filter((item) => item !== value);
  try {
    uni.setStorageSync(getStorageKey(userId, deptId), history);
  } catch (e) {
    // 本地存储不可用时忽略删除失败，不影响页面使用。
  }
  return history;
}

/** 清空当前用户与家庭的全部搜索历史。 */
export function clearSearchHistory(userId?: number, deptId?: number): void {
  if (userId == null) {
    return;
  }
  try {
    uni.removeStorageSync(getStorageKey(userId, deptId));
  } catch (e) {
    // 本地存储不可用时忽略清空失败，不影响页面使用。
  }
}
