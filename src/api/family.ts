import { request } from "@/utils/request";

/** 家庭邀请码信息 */
export interface FamilyCodeInfo {
  /** 邀请码；没有或已过期时为 null */
  code: string | null;
  /** 剩余有效期（秒） */
  expireSeconds: number;
  /** 有效期（天） */
  ttlDays: number;
}

/** 查询本家庭当前的邀请码，仅家庭管理员可调用 */
export function getFamilyCode() {
  return request<FamilyCodeInfo>({ url: "/meal/family/code" });
}

/** 生成（或重新生成）本家庭邀请码，旧码立即失效 */
export function generateFamilyCode() {
  return request<FamilyCodeInfo>({ url: "/meal/family/code", method: "POST" });
}
