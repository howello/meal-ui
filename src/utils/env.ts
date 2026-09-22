/**
 * 后端接口基地址
 *
 * 开发期走 Vite 代理（`/dev-api`），生产期由 `.env.production` 的
 * `VITE_APP_BASE_API` 指向后端公网地址。
 */
export const BASE_API: string = import.meta.env.VITE_APP_BASE_API || "/dev-api";

/** 图片上传地址 */
export const UPLOAD_API = `${BASE_API}/common/upload`;
