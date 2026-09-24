import { reactive } from "vue";

interface DialogState {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  showCancel: boolean;
}

/**
 * 弹窗的展示状态放 reactive（驱动视图），但 resolve 回调放在模块级变量里。
 * 之前把函数存进 reactive 状态，在某些运行时/打包环境下读取回来会丢失引用，
 * 导致 confirm() 的 Promise 永不 resolve，所有二次确认“点了没反应”。
 * 用模块级变量保存回调是最稳的做法，不受 reactive 代理影响。
 */
let pendingResolve: ((value: boolean) => void) | null = null;

/** 全局弹窗状态：由 AppDialog 组件渲染，所有页面通过 confirm/alert 调用 */
export const dialogState = reactive<DialogState>({
  visible: false,
  title: "提示",
  message: "",
  confirmText: "确定",
  cancelText: "取消",
  showCancel: true,
});

function open(options: Partial<DialogState>): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    dialogState.title = options.title ?? "提示";
    dialogState.message = options.message ?? "";
    dialogState.confirmText = options.confirmText ?? "确定";
    dialogState.cancelText = options.cancelText ?? "取消";
    dialogState.showCancel = options.showCancel ?? true;
    pendingResolve = resolve;
    dialogState.visible = true;
  });
}

/** 确认弹窗，返回用户是否点确定 */
export function confirm(message: string, title = "提示"): Promise<boolean> {
  return open({ message, title, showCancel: true });
}

/** 提示弹窗，无取消按钮，点确定关闭 */
export function alert(message: string, title = "提示"): Promise<void> {
  return open({ message, title, showCancel: false }).then(() => undefined);
}

function settle(result: boolean) {
  const resolve = pendingResolve;
  pendingResolve = null;
  dialogState.visible = false;
  resolve?.(result);
}

export function handleConfirm() {
  settle(true);
}

export function handleCancel() {
  settle(false);
}
