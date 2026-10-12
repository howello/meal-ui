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

/** 一键 AI 文本补齐结果：只含被补齐的文本字段与分类匹配结果 */
export interface DishAiTextResult {
  /** 本次生成的文本字段集合 */
  fields?: Record<string, string>;
  /** 匹配到的分类ID */
  matchedCategoryIds?: number[];
  /** 未匹配到现有分类的分类名 */
  unmatchedCategoryNames?: string[];
}

/** 一键 AI 封面生成结果 */
export interface DishAiCoverResult {
  /** 新生成的封面永久地址 */
  cover?: string;
  /** 图片未生成时的可读原因 */
  imageError?: string;
}

/** 一键 AI 补齐菜品文本信息（只补缺失字段，不覆盖已填） */
export function aiGenerateDishText(data: {
  name: string;
  deptId?: number;
  current?: DishAiCurrent;
}): Promise<DishAiTextResult> {
  return request<DishAiTextResult>({
    url: "/meal/dish/ai-generate/text",
    method: "POST",
    data,
  });
}

/** 一键 AI 生成菜品封面（已填封面时不生成） */
export function aiGenerateDishCover(data: {
  name: string;
  deptId?: number;
  current?: DishAiCurrent;
}): Promise<DishAiCoverResult> {
  return request<DishAiCoverResult>({
    url: "/meal/dish/ai-generate/cover",
    method: "POST",
    data,
  });
}
