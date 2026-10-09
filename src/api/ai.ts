import { request } from "@/utils/request";

/** 一键 AI 生成请求里的「当前已填字段快照」，为空的字段会被补齐 */
export interface DishAiCurrent {
  categoryIds?: number[];
  description?: string;
  cover?: string;
  tags?: string;
  duration?: string;
  level?: string;
  ingredients?: string;
  steps?: string;
  tips?: string;
}

/** 一键 AI 生成结果：只含被补齐的字段，不落库 */
export interface DishAiResult {
  /** 本次生成的文本字段集合 */
  fields?: Record<string, string>;
  /** 新生成的封面永久地址 */
  cover?: string;
  /** 匹配到的分类ID */
  matchedCategoryIds?: number[];
  /** 未匹配到现有分类的分类名 */
  unmatchedCategoryNames?: string[];
  /** 图片未生成时的可读原因 */
  imageError?: string;
}

/** 一键 AI 补齐菜品信息（只补缺失字段，不覆盖已填） */
export function aiGenerateDish(data: {
  name: string;
  deptId?: number;
  current?: DishAiCurrent;
}): Promise<DishAiResult> {
  return request<DishAiResult>({
    url: "/meal/dish/ai-generate",
    method: "POST",
    data,
  });
}
