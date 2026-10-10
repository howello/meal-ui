import { defineStore } from "pinia";
import { getInfo, logout as logoutApi } from "@/api/auth";
import { ROLE_CHEF, ROLE_MANAGER, type UserInfo, type ViewMode } from "@/types";
import { getToken, removeToken, setToken } from "@/utils/auth";
import { stopOrderNotifier } from "@/utils/notify";

const VIEW_MODE_KEY = "meal-view-mode";
/** 用户资料/角色/权限的本地缓存，用于冷启动直接恢复身份、跳过等待网络 */
const USER_CACHE_KEY = "meal-user-cache";

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
    /** App 启动时把本地 token、视图与用户缓存恢复进内存 */
    restore() {
      this.token = getToken();
      const mode = uni.getStorageSync(VIEW_MODE_KEY);
      this.viewMode = mode === "kitchen" || mode === "eater" ? mode : "";
      this.restoreUserCache();
    },
    /**
     * 恢复上次登录缓存的用户资料与角色权限
     *
     * 冷启动时先据此直接进首页（秒进），不必等 /getInfo；再由各页 onShow
     * 后台刷新校验，token 真失效时由请求层 401 踢回登录页。
     */
    restoreUserCache() {
      try {
        const raw = uni.getStorageSync(USER_CACHE_KEY);
        const cached = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!cached || typeof cached !== "object") {
          return;
        }
        const data = cached as { user?: UserInfo | null; roles?: unknown; permissions?: unknown };
        this.user = data.user ?? null;
        this.roles = Array.isArray(data.roles) ? (data.roles as string[]) : [];
        this.permissions = Array.isArray(data.permissions) ? (data.permissions as string[]) : [];
      } catch (e) {
        // 缓存损坏当作没有，等后台刷新覆盖
      }
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
      this.persistUserCache();
      return res;
    },
    /** 把当前身份写入本地缓存，供下次冷启动秒进 */
    persistUserCache() {
      try {
        uni.setStorageSync(
          USER_CACHE_KEY,
          JSON.stringify({ user: this.user, roles: this.roles, permissions: this.permissions }),
        );
      } catch (e) {
        // 本地缓存不可用不影响本次登录
      }
    },
    /** 后台静默刷新身份，不阻塞页面渲染；失败（含 401）交给请求层处理 */
    refreshInfo() {
      void this.fetchInfo().catch(() => {});
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
      uni.removeStorageSync(USER_CACHE_KEY);
    },
  },
});
