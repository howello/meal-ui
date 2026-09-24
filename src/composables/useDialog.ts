import { reactive } from "vue";

interface DialogState {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  showCancel: boolean;
  resolve: ((value: boolean) => void) | null;
}

/** 全局弹窗状态：由 AppDialog 组件渲染，所有页面通过 confirm/alert 调用 */
export const dialogState = reactive<DialogState>({
  visible: false,
  title: "提示",
  message: "",
  confirmText: "确定",
  cancelText: "取消",
  showCancel: true,
  resolve: null,
});

function open(options: Partial<DialogState>): Promise<boolean> {
  return new Promise((resolve) => {
    dialogState.title = options.title ?? "提示";
    dialogState.message = options.message ?? "";
    dialogState.confirmText = options.confirmText ?? "确定";
    dialogState.cancelText = options.cancelText ?? "取消";
    dialogState.showCancel = options.showCancel ?? true;
    dialogState.resolve = resolve;
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

export function handleConfirm() {
  const resolve = dialogState.resolve;
  dialogState.visible = false;
  dialogState.resolve = null;
  resolve?.(true);
}

export function handleCancel() {
  const resolve = dialogState.resolve;
  dialogState.visible = false;
  dialogState.resolve = null;
  resolve?.(false);
}
