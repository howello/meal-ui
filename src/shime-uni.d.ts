export {}

declare module "vue" {
  type Hooks = App.AppInstance & Page.PageInstance;
  interface ComponentCustomOptions extends Hooks {}
  /** 全局 mixin（main.ts）注入的主题根节点 class：深色为 "theme-dark"，浅色为空 */
  interface ComponentCustomProperties {
    themeRootClass: string;
  }
}