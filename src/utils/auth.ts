const TOKEN_KEY = "meal-token";

/**
 * token 只由 401 触发清除，不做本地过期清理
 *
 * 后端对点餐端签发 30 天有效期并按 TTL 比例滑动续期，只要 20 天内用过一次就不会掉线，
 * 前端再存一份过期时间反而容易和服务端不一致，所以这里只管存取。
 */
export function getToken(): string {
  const token = uni.getStorageSync(TOKEN_KEY);
  return typeof token === "string" ? token : "";
}

export function setToken(token: string): void {
  uni.setStorageSync(TOKEN_KEY, token);
}

export function removeToken(): void {
  uni.removeStorageSync(TOKEN_KEY);
}
