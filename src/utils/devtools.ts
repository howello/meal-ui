/**
 * UniDevTools 调用封装
 *
 * 调试工具（src/devTools，第三方 JS 插件）安装后把 API 挂在 `uni.$dev` 上，
 * 但 uni 的官方类型里没有这个字段，这里统一收口，避免各页面里到处 `as any`。
 * 未安装（如被 config.js 的总开关关掉）时全部静默降级，不影响业务。
 */

/** `uni.$dev` 暴露的能力 */
interface DevApi {
  /** 打开调试弹窗 */
  show(): void;
  /** 关闭调试弹窗 */
  hide(): void;
  /** 上报一个错误，记录在调试工具的 Error 页 */
  errorReport(err: unknown, at?: string, type?: string): void;
  /** 上报一条日志，记录在调试工具的 Logs 页 */
  logReport(message: string): void;
}

/** 取调试工具实例；未安装时返回 undefined */
function dev(): DevApi | undefined {
  return (uni as unknown as { $dev?: DevApi }).$dev;
}

/** 库内部固定使用的气泡 id（App 端是原生 View，H5 端是 div） */
const BUBBLE_ID = "debugTag";

/**
 * 启动时隐藏调试气泡：默认不显示，点头像 5 次后再显示。
 *
 * 仅 H5 需要处理：库只在 `bubble.status` 为真时才把气泡挂到 DOM，
 * 所以 config 里 H5 设为 true 先创建、这里再立即隐藏；
 * App 端由 config 的 `bubble.status=false` 保证 View 创建后不 show，无需隐藏。
 */
export function hideDevBubble(): void {
  // #ifdef H5
  const el = document.getElementById(BUBBLE_ID);
  if (el) {
    el.style.display = "none";
  }
  // #endif
}

/** 显示调试气泡（个人中心头像连点 5 次触发，气泡出现后点它才打开调试面板） */
export function showDevBubble(): void {
  // #ifdef H5
  const el = document.getElementById(BUBBLE_ID);
  if (el) {
    el.style.display = "flex";
  }
  // #endif
  // #ifdef APP-PLUS
  /* HTML5+ 文档里 getViewById 是 View 的静态方法，@dcloudio/types 却把它标成了实例方法，
     这里按运行时真实结构断言一次；View 尚未创建时返回空则忽略。 */
  type ViewStatic = { getViewById(id: string): { show(): void } | null };
  const view = (plus.nativeObj.View as unknown as ViewStatic | undefined)?.getViewById(BUBBLE_ID);
  if (view) {
    view.show();
  }
  // #endif
}

/** 上报一条运行日志 */
export function devLog(message: string): void {
  try {
    dev()?.logReport(message);
  } catch (e) {
    // 忽略
  }
}

/** 上报一个错误（默认 type=oe：onError 捕获） */
export function devError(err: unknown, at: string, type = "oe"): void {
  try {
    dev()?.errorReport(err, at, type);
  } catch (e) {
    // 忽略
  }
}
