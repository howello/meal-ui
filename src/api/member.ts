import type { FamilyMember, FamilyRole } from "@/types";
import { request, requestVoid } from "@/utils/request";

export interface MemberBody {
  /** 修改时必填 */
  userId?: number;
  /** 新增时必填 */
  userName?: string;
  nickName?: string;
  /** 新增时的初始密码 */
  password?: string;
  phonenumber?: string;
  /** 家庭角色ID列表（点餐员/厨师/家庭管理员） */
  roleIds?: number[];
}

/** 本家庭成员列表（含已分配的家庭角色），仅家庭管理员可调用 */
export function listFamilyMembers(params?: { keyword?: string }) {
  return request<FamilyMember[]>({ url: "/meal/member/list", data: params });
}

/** 可分配的家庭角色（点餐员 / 厨师 / 家庭管理员） */
export function listFamilyRoles() {
  return request<FamilyRole[]>({ url: "/meal/member/roles" });
}

/** 新增本家庭成员（家庭管理员直接建号） */
export function addFamilyMember(data: MemberBody) {
  return requestVoid({ url: "/meal/member", method: "POST", data });
}

/** 修改本家庭成员（昵称、手机号、家庭角色） */
export function updateFamilyMember(data: MemberBody) {
  return requestVoid({ url: "/meal/member", method: "PUT", data });
}

/** 停用 / 启用本家庭成员 */
export function changeFamilyMemberStatus(userId: number, status: string) {
  return requestVoid({ url: "/meal/member/status", method: "PUT", data: { userId, status } });
}

/** 移除本家庭成员（逻辑删除） */
export function removeFamilyMember(userId: number) {
  return requestVoid({ url: `/meal/member/${userId}`, method: "DELETE" });
}
