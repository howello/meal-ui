import type { Proposal } from "@/types";
import { requestPage, requestVoid } from "@/utils/request";

export interface SubmitProposalBody {
  name: string;
  categoryId?: number;
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
