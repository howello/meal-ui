/** 菜品分类 */
export interface Category {
  categoryId: number;
  deptId?: number;
  name: string;
  icon?: string;
  sort?: number;
  status?: string;
}

/** 用料条目（菜品 ingredients 字段 JSON.parse 后的结构） */
export interface Ingredient {
  name: string;
  amount: string;
}

/** 菜品 */
export interface Dish {
  dishId: number;
  deptId?: number;
  /** 关联分类ID列表（一道菜可挂多个分类） */
  categoryIds?: number[];
  /** 分类名称（顿号拼接，列表附带） */
  categoryNames?: string;
  name: string;
  cover?: string;
  description?: string;
  tags?: string;
  duration?: string;
  level?: string;
  serve?: string;
  kcal?: string;
  /** JSON 字符串，形如 [{"name":"五花肉","amount":"600 g"}] */
  ingredients?: string;
  /** JSON 字符串，形如 ["切块","焯水"] */
  steps?: string;
  /** JSON 字符串，形如 ["小火慢炖"] */
  tips?: string;
  status?: string;
  sort?: number;
  source?: string;
  /** 前端本地字段：购物车里的份数 */
  count?: number;
}

/** 订单明细（菜品快照） */
export interface OrderItem {
  itemId?: number;
  orderId?: number;
  dishId?: number;
  dishName: string;
  dishCover?: string;
  count: number;
  remark?: string;
}

/** 订单 */
export interface Order {
  orderId: number;
  orderNo: string;
  deptId?: number;
  userId?: number;
  userName?: string;
  /** 0待接单 1制作中 2已完成 3已取消 */
  status: string;
  totalCount?: number;
  orderRemark?: string;
  acceptBy?: string;
  acceptTime?: string;
  finishBy?: string;
  finishTime?: string;
  cancelTime?: string;
  createTime?: string;
  items?: OrderItem[];
  /** 后端计算的已等待分钟数 */
  waitMinutes?: number;
  /** 后端计算的已制作分钟数 */
  cookMinutes?: number;
  /** 是否已评价（后端附带），已评价的订单不再显示「去评价」 */
  reviewed?: boolean;
}

/** 订单流转通知 */
export interface OrderNotification {
  id: string;
  type: "NEW_ORDER" | "ORDER_ACCEPTED" | "ORDER_COMPLETED" | "ORDER_RATED";
  orderId: number;
  title: string;
  content: string;
  extra?: Record<string, unknown>;
  createTime: number;
}

/** 评价 */
export interface Review {
  reviewId?: number;
  orderId: number;
  orderNo?: string;
  /** 该订单的菜名，顿号分隔，如「红烧肉、扬州炒饭」 */
  dishNames?: string;
  score: number;
  content?: string;
  /** JSON 字符串，形如 ["https://..."] */
  images?: string;
  anonymous?: string;
  userName?: string;
  createTime?: string;
}

/** 新菜提案 */
export interface Proposal {
  proposalId?: number;
  name: string;
  /** 期望分类ID列表 */
  categoryIds?: number[];
  /** 期望分类名称（顿号拼接） */
  categoryNames?: string;
  description?: string;
  image?: string;
  /** 标签，逗号分隔（可由一键 AI 生成） */
  tags?: string;
  /** 耗时 */
  duration?: string;
  /** 难度 */
  level?: string;
  /** 用料清单 JSON，形如 [{"name":"五花肉","amount":"600 g"}] */
  ingredients?: string;
  /** 做法步骤 JSON，形如 ["切块","焯水"] */
  steps?: string;
  /** 小贴士 JSON，形如 ["小火慢炖"] */
  tips?: string;
  reason?: string;
  /** 0待审核 1已通过 2已驳回 */
  status?: string;
  auditBy?: string;
  auditTime?: string;
  auditRemark?: string;
  dishId?: number;
  createTime?: string;
}

/** 登录用户 */
export interface UserInfo {
  userId: number;
  userName: string;
  nickName: string;
  deptId?: number;
  /**
   * 家庭/部门名称。
   * 后端 /getInfo 把 dept 信息以嵌套对象返回（user.dept.deptName），
   * 这里同时兼容扁平写法 user.deptName（部分接口可能直接平铺）。
   */
  dept?: { deptId?: number; deptName?: string };
  deptName?: string;
  avatar?: string;
}

/** getInfo 返回 */
export interface LoginInfo {
  user: UserInfo;
  roles: string[];
  permissions: string[];
}

/** 订单状态码 */
export const ORDER_STATUS = {
  WAITING: "0",
  COOKING: "1",
  FINISHED: "2",
  CANCELED: "3",
} as const;

/** 订单状态文案 */
export const ORDER_STATUS_TEXT: Record<string, string> = {
  "0": "待接单",
  "1": "制作中",
  "2": "已完成",
  "3": "已取消",
};

/** 提案状态文案 */
export const PROPOSAL_STATUS_TEXT: Record<string, string> = {
  "0": "待审核",
  "1": "已通过",
  "2": "已驳回",
};

/** 角色标识：厨师 */
export const ROLE_CHEF = "meal_chef";

/** 角色标识：家庭管理员 */
export const ROLE_MANAGER = "meal_manager";

/** 视图模式：点餐区 / 厨师工作台 */
export type ViewMode = "eater" | "kitchen";
