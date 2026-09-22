import { defineStore } from "pinia";
import { getInfo, logout as logoutApi } from "@/api/auth";
import { ROLE_CHEF, ROLE_MANAGER, type UserInfo } from "@/types";
import { getToken, removeToken, setToken } from "@/utils/auth";

interface UserState {
  token: string;
  user: UserInfo | null;
  roles: string[];
  permissions: string[];
}

/**
 * 登录用户状态
 *
 * token 存在本地存储里（不设过期清理），角色与权限来自 `/getInfo`，
 * 只用于前端按角色渲染界面；真正的鉴权在后端。
 */
export const useUserStore = defineStore("user", {
  state: (): UserState => ({
    token: "",
    user: null,
    roles: [],
    permissions: [],
  }),
  getters: {
    isLogin: (state): boolean => !!state.token,
    /**
     * 是否厨师本人
     *
     * 底部导航按它切换：厨师进工作台，点餐员与家庭管理员都留在点餐区。
     * 家庭管理员虽然也有接单权限，但主视图仍是点餐，工作台从个人中心进。
     */
    isChef: (state): boolean => state.roles.includes(ROLE_CHEF),
    /** 能进厨师工作台的角色（厨师本人 + 家庭管理员，后者有接单与完成权限） */
    canKitchen: (state): boolean =>
      state.roles.includes(ROLE_CHEF) || state.roles.includes(ROLE_MANAGER),
    isManager: (state): boolean => state.roles.includes(ROLE_MANAGER),
    nickName: (state): string => state.user?.nickName || state.user?.userName || "",
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
    /** App 启动时把本地 token 恢复进内存 */
    restore() {
      this.token = getToken();
    },
    setToken(token: string) {
      this.token = token;
      setToken(token);
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
      this.token = "";
      this.user = null;
      this.roles = [];
      this.permissions = [];
      removeToken();
    },
  },
});
