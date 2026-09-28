/**
 * 后端接口基地址
 *
 * 按“编译平台”选择，而非运行时系统类型（手机浏览器里的 H5 会被误判成 android/ios）。
 * - H5 端（浏览器，含手机浏览器）恒用 `VITE_APP_BASE_API`：开发期走 Vite 代理（`/dev-api`），
 *   生产期由 `.env.production` 提供公网 HTTPS 地址。
 * - 原生 App 端（HBuilderX 打包）：代理不生效，用 `VITE_APP_BASE_API_PHONE` 直连电脑局域网
 *   调试；未配置时（正式打包）回退到 `VITE_APP_BASE_API`，保证不会落到写死的局域网 IP。
 *
 * 条件编译写在函数体内：uni 在打包时会把当前平台不需要的分支剔除，
 * 保证 H5 产物不含局域网地址；同时这段代码在 vue-tsc 下不产生重复声明。
 */
function buildBaseApi(): string {
  // #ifdef H5
  return import.meta.env.VITE_APP_BASE_API || "/dev-api";
  // #endif
  // #ifndef H5
  return import.meta.env.VITE_APP_BASE_API_PHONE || import.meta.env.VITE_APP_BASE_API || "";
  // #endif
  return "/dev-api";
}

export const BASE_API: string = buildBaseApi();

/** 图片上传地址 */
export const UPLOAD_API = `${BASE_API}/common/upload`;