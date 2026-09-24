/**
 * 后端接口基地址
 *
 * - H5 开发期：走 Vite 代理（`/dev-api`，见 vite.config.ts 转发到 localhost:9527）
 * - 原生 App 真机调试：代理不生效，必须直连电脑局域网，由 `.env.development`
 *   的 `VITE_APP_BASE_API_PHONE` 提供绝对地址
 * - 生产期：`.env.production` 的 `VITE_APP_BASE_API` 指向后端公网 HTTPS 地址
 */
const sysInfo = uni.getSystemInfoSync();
const isNativeApp = sysInfo.platform === "android" || sysInfo.platform === "ios";

export const BASE_API: string = isNativeApp
  ? import.meta.env.VITE_APP_BASE_API_PHONE || "http://192.168.103.98:9527"
  : import.meta.env.VITE_APP_BASE_API || "/dev-api";

/** 图片上传地址 */
export const UPLOAD_API = `${BASE_API}/common/upload`;
