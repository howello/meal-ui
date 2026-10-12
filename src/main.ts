import { createSSRApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { useThemeStore } from "./store/theme";
import { hideDevBubble } from "./utils/devtools";
// UniDevTools 调试工具（第三方 JS 插件，无类型声明）：安装后会在 uni.$dev 上挂载 show/日志上报
// @ts-ignore 第三方 JS 插件无类型声明
import devTools from "./devTools/index.js";
// @ts-ignore 第三方 JS 插件无类型声明
import devToolsConfig from "./devTools/config.js";

export function createApp() {
  const app = createSSRApp(App);
  const pinia = createPinia();
  app.use(pinia);
  // 挂载调试工具；默认不显示悬浮气泡，个人中心头像连点 5 次后再显示（见 pages/mine/index.vue）
  app.use(devTools, devToolsConfig);
  hideDevBubble();
  /**
   * 全局注入主题根节点 class：
   * 各页根节点直接写 :class="themeRootClass"，无需逐页 import 主题 store。
   * 深色时为 "theme-dark"，浅色时为空字符串。
   */
  app.mixin({
    computed: {
      themeRootClass(): string {
        return useThemeStore(pinia).themeRootClass;
      },
    },
  });
  return {
    app,
  };
}
