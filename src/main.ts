import { createSSRApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { useThemeStore } from "./store/theme";

export function createApp() {
  const app = createSSRApp(App);
  const pinia = createPinia();
  app.use(pinia);
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
