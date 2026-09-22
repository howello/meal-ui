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
  categoryId?: number;
  categoryName?: string;
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
}

/** 评价 */
export interface Review {
  reviewId?: number;
  orderId: number;
  orderNo?: string;
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
  categoryId?: number;
  categoryName?: string;
  description?: string;
  image?: string;
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
