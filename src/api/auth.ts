import type { LoginInfo } from "@/types";
import { requestRaw, requestVoid } from "@/utils/request";

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

/** 家庭注册参数：家庭代码即目标家庭的部门ID */
export interface FamilyRegisterBody {
  /** 家庭代码（家庭管理员提供） */
  familyCode: string;
  username: string;
  password: string;
  nickName: string;
  phonenumber?: string;
  code?: string;
  uuid?: string;
  turnstileToken?: string;
}

/**
 * 家庭注册：用家庭代码加入已有家庭
 *
 * 与既有匿名注册 `/register` 相互独立，不受注册开关约束；成功后绑定该家庭并获得
 * 默认「点餐员」角色，可直接登录。
 */
export function registerFamily(data: FamilyRegisterBody) {
  return requestVoid({ url: "/register/family", method: "POST", data });
}
