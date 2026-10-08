import { defineStore } from "pinia";
import { getInfo, logout as logoutApi } from "@/api/auth";
import { ROLE_CHEF, ROLE_MANAGER, type UserInfo, type ViewMode } from "@/types";
import { getToken, removeToken, setToken } from "@/utils/auth";
import { stopOrderNotifier } from "@/utils/notify";

const VIEW_MODE_KEY = "meal-view-mode";

interface UserState {
  token: string;
  user: UserInfo | null;
  roles: string[];
  permissions: string[];
  /** 当前停留的视图：点餐区还是厨师工作台。空表示还没进过任何一边 */
  viewMode: ViewMode | "";
}

/**
 * 登录用户状态
 *
 * token 存在本地存储里（不设过期清理），角色与权限来自 `/getInfo`，
 * 只用于前端按角色渲染界面；真正的鉴权在后端。
 *
 * `viewMode` 记的是「人在哪一边」，不是「人是谁」：厨师与家庭管理员两边都能进，
 * 底部导航要跟着当前视图走，而不是跟着角色走。
 */
export const useUserStore = defineStore("user", {
  state: (): UserState => ({
    token: "",
    user: null,
    roles: [],
    permissions: [],
    viewMode: "",
  }),
  getters: {
    isLogin: (state): boolean => !!state.token,
    /**
     * 是否厨师本人
     *
     * 登录后默认落到哪一边用它判断：厨师进工作台，点餐员与家庭管理员都进点餐区。
     */
    isChef: (state): boolean => state.roles.includes(ROLE_CHEF),
    /** 能进厨师工作台的角色（厨师本人 + 家庭管理员，后者有接单与完成权限） */
    canKitchen: (state): boolean =>
      state.roles.includes(ROLE_CHEF) || state.roles.includes(ROLE_MANAGER),
    /**
     * 底部导航该用哪一套 tab
     *
     * 只有「能进厨房 + 当前确实在厨房视图」才用厨师那套，其余一律点餐那套。
     */
    tabMode: (state): ViewMode =>
      state.viewMode === "kitchen" && (state.roles.includes(ROLE_CHEF) || state.roles.includes(ROLE_MANAGER))
        ? "kitchen"
        : "eater",
    isManager: (state): boolean => state.roles.includes(ROLE_MANAGER),
    nickName: (state): string => state.user?.nickName || state.user?.userName || "",
    /**
     * 家庭/部门名称。
     * 后端 /getInfo 嵌套返回 user.dept.deptName，部分接口也可能直接平铺 user.deptName，
     * 这里两种都兼容，避免拿到 undefined 后界面退化成「我的家庭」占位。
     */
    deptName: (state): string =>
      state.user?.dept?.deptName || state.user?.deptName || "",
    roleLabels: (state): string[] => {
      const labels: string[] = [];
      if (state.roles.includes(ROLE_CHEF)) {
        labels.push("厨师");
      }
      if (state.roles.includes(ROLE_MANAGER)) {
        labels.push("管理员");
      }
      if (labels.length === 0 && state.roles.includes("meal_eater")) {
        labels.push("点餐员");
      }
      return labels;
    },
  },
  actions: {
    /** App 启动时把本地 token、视图与购物车恢复进内存 */
    restore() {
      this.token = getToken();
      const mode = uni.getStorageSync(VIEW_MODE_KEY);
      this.viewMode = mode === "kitchen" || mode === "eater" ? mode : "";
    },
    setToken(token: string) {
      this.token = token;
      setToken(token);
    },
    /** 切换视图（点餐区 / 厨师工作台），各页面 onShow 时调用 */
    setViewMode(mode: ViewMode) {
      if (this.viewMode === mode) {
        return;
      }
      this.viewMode = mode;
      uni.setStorageSync(VIEW_MODE_KEY, mode);
    },
    async fetchInfo() {
      const res = await getInfo();
      this.user = res.user;
      this.roles = res.roles || [];
      this.permissions = res.permissions || [];
      return res;
    },
    async logout() {
      try {
        await logoutApi();
      } catch (e) {
        // 后端登出失败不影响本地清理
      }
      this.reset();
    },
    reset() {
      stopOrderNotifier();
      this.token = "";
      this.user = null;
      this.roles = [];
      this.permissions = [];
      this.viewMode = "";
      removeToken();
      uni.removeStorageSync(VIEW_MODE_KEY);
    },
  },
});
