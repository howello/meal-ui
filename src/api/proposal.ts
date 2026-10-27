import type { Proposal } from "@/types";
import { request, requestPage, requestVoid } from "@/utils/request";

export interface SubmitProposalBody {
  name: string;
  /** 期望主类ID列表（最多 1 个） */
  categoryIds?: number[];
  description?: string;
  image?: string;
  /** 以下扩展字段可由一键 AI 生成后一并提交 */
  tags?: string;
  duration?: string;
  level?: string;
  ingredients?: string;
  steps?: string;
  tips?: string;
  reason?: string;
}

/** 提交新菜提案 */
export function submitProposal(data: SubmitProposalBody) {
  return requestVoid({ url: "/meal/proposal", method: "POST", data });
}

/** 我的提案 */
export function myProposals(params?: { pageNum?: number; pageSize?: number }) {
  return requestPage<Proposal>({ url: "/meal/proposal/my", data: params });
}

/** 提案详情（含提交内容、AI 补齐的菜谱字段与审核信息） */
export function proposalDetail(proposalId: number) {
  return request<Proposal>({ url: `/meal/proposal/${proposalId}` });
}
