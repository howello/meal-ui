import type { LoginInfo } from "@/types";
import { requestRaw } from "@/utils/request";

export interface LoginBody {
  username: string;
  password: string;
  code?: string;
  uuid?: string;
  turnstileToken?: string;
  /** 固定传 meal，后端据此签发 30 天有效期的会话 */
  client: "meal";
}

export interface CaptchaInfo {
  captchaEnabled: boolean;
  uuid?: string;
  img?: string;
  imgType?: string;
  captchaType?: string;
  turnstileEnabled: boolean;
  turnstileSiteKey?: string;
}

/** 登录，token 在响应顶层 */
export function login(data: LoginBody) {
  return requestRaw<{ token: string }>({ url: "/login", method: "POST", data });
}

/** 拉取当前用户资料、角色与权限 */
export function getInfo() {
  return requestRaw<LoginInfo>({ url: "/getInfo" });
}

/** 获取验证码与人机校验配置 */
export function getCaptcha() {
  return requestRaw<CaptchaInfo>({ url: "/captchaImage" });
}

/** 登出 */
export function logout() {
  return requestRaw({ url: "/logout", method: "POST" });
}
