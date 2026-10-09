import type { Proposal } from "@/types";
import { requestPage, requestVoid } from "@/utils/request";

export interface SubmitProposalBody {
  name: string;
  /** 期望分类ID列表（可多选） */
  categoryIds?: number[];
  description?: string;
  image?: string;
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
