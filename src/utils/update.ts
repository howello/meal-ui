import { checkAppUpdate, type AppUpdateInfo } from "@/api/appVersion";
import { readWidgetVersion } from "@/utils/appInfo";

/** 一次启动只自动检测一次 */
let started = false;
/** 更新流程进行中，避免重复弹窗与重复下载 */
let updating = false;
/** 手动检查进行中，避免重复发起检测 */
let checking = false;

/** 延迟指定毫秒 */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 弹窗文案里的版本信息 */
function versionText(info: AppUpdateInfo): string {
  return info.versionName ? `新版本 v${info.versionName}` : "新版本";
}

/**
 * 强制更新确认：不提供取消，用户必须确认后才能继续使用
 *
 * 普通更新不走这里，静默下载安装，不打断使用。
 */
function confirmForceUpdate(info: AppUpdateInfo): Promise<boolean> {
  const content = info.updateLog
    ? `${versionText(info)}\n\n${info.updateLog}\n\n本次为强制更新，需要更新后才能继续使用。`
    : `${versionText(info)}\n\n本次为强制更新，需要更新后才能继续使用。`;
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "发现新版本（必须更新）",
      content,
      showCancel: false,
      confirmText: "立即更新",
      success: (res) => {
        resolve(!!res.confirm);
      },
      fail: () => {
        resolve(false);
      },
    });
  });
}

/**
 * 普通更新安装完成后的重启提示
 *
 * wgt 已安装，选择「稍后」也不会丢更新，下次启动自动生效；
 * 选择「立即重启」马上切到新版本。
 */
function confirmRestart(info: AppUpdateInfo): Promise<boolean> {
  const content = info.updateLog
    ? `${versionText(info)} 已下载完成，重启后生效。\n\n${info.updateLog}`
    : `${versionText(info)} 已下载完成，重启后生效。`;
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "更新已就绪",
      content,
      showCancel: true,
      cancelText: "稍后",
      confirmText: "立即重启",
      success: (res) => {
        resolve(!!res.confirm);
      },
      fail: () => {
        resolve(false);
      },
    });
  });
}

/**
 * 下载 wgt 资源包，返回本地临时路径；失败返回 null
 *
 * @param silent 静默模式：不显示下载进度与遮罩，普通更新使用
 */
function downloadWgt(url: string, silent: boolean): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    if (!silent) {
      uni.showLoading({ title: "正在下载更新 0%", mask: true });
    }
    const task = uni.downloadFile({
      url,
      success: (res) => {
        if (!silent) {
          uni.hideLoading();
        }
        if (res.statusCode === 200 && res.tempFilePath) {
          resolve(res.tempFilePath);
        } else {
          resolve(null);
        }
      },
      fail: () => {
        if (!silent) {
          uni.hideLoading();
        }
        resolve(null);
      },
    });
    if (!silent) {
      task.onProgressUpdate((res) => {
        uni.showLoading({ title: `正在下载更新 ${res.progress}%`, mask: true });
      });
    }
  });
}

/**
 * 安装 wgt 资源包（不负责重启和提示）
 *
 * 安装成功后必须调用 {@link restartApp}，否则新资源不会生效。
 */
function installWgt(tempFilePath: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // #ifdef APP-PLUS
    try {
      // 注意：App 逻辑层没有 window，5+ 能力必须用裸 plus
      if (typeof plus !== "undefined" && plus.runtime && plus.runtime.install) {
        plus.runtime.install(
          tempFilePath,
          { force: false },
          () => resolve(true),
          () => resolve(false),
        );
        return;
      }
    } catch (e) {
      // 落到下方统一失败处理
    }
    // #endif
    resolve(false);
  });
}

/**
 * 重启 App 让已安装的 wgt 立即生效
 *
 * 重启失败时保留已安装资源，下次启动即生效。
 *
 * @param delayMs 延迟毫秒数，给安装回调与界面留一点收尾时间
 */
function restartApp(delayMs = 0): void {
  // #ifdef APP-PLUS
  const run = () => {
    try {
      plus.runtime.restart();
    } catch (e) {
      // 重启失败时保留已安装资源，下次启动即生效
    }
  };
  if (delayMs > 0) {
    setTimeout(run, delayMs);
  } else {
    run();
  }
  // #endif
}

/**
 * 更新失败提示
 *
 * 强制更新必须重试后才能继续使用；普通更新在静默模式下不打扰用户，
 * 手动检查时给一次可读提示。
 *
 * @returns true 表示重试
 */
function askRetry(force: boolean, silent: boolean): Promise<boolean> {
  if (silent && !force) {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "更新失败",
      content: "资源包下载或安装失败，请检查网络后重试。",
      showCancel: !force,
      cancelText: "稍后",
      confirmText: force ? "重试" : "知道了",
      success: (res) => {
        resolve(force ? !!res.confirm : false);
      },
      fail: () => {
        resolve(false);
      },
    });
  });
}

/** 下载 → 安装；返回是否安装成功 */
async function downloadAndInstall(url: string, silent: boolean): Promise<boolean> {
  const tempFilePath = await downloadWgt(url, silent);
  if (!tempFilePath) {
    return false;
  }
  if (!silent) {
    uni.showLoading({ title: "正在安装更新", mask: true });
  }
  const ok = await installWgt(tempFilePath);
  if (!silent) {
    uni.hideLoading();
  }
  return ok;
}

/**
 * 执行一次更新流程
 *
 * - 强制更新：弹不可取消的确认框，下载安装后立即重启；
 * - 普通更新：不弹确认框，静默下载安装，装完后询问是否立即重启。
 *
 * @param info   更新信息
 * @param silent 静默模式（启动自动检查传 true，手动检查传 false）
 */
async function runUpdate(info: AppUpdateInfo, silent: boolean): Promise<void> {
  if (updating || !info.wgtUrl) {
    return;
  }
  updating = true;
  try {
    const url = info.wgtUrl;
    if (info.forceUpdate === true) {
      // 强制更新：弹窗不可跳过，用户取消后再次弹出，直到点「立即更新」
      let confirmed = await confirmForceUpdate(info);
      while (!confirmed) {
        await delay(400);
        confirmed = await confirmForceUpdate(info);
      }
      // 安装成功后立刻重启，不再额外弹窗或等待 toast
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const ok = await downloadAndInstall(url, false);
        if (ok) {
          restartApp(100);
          return;
        }
        const retry = await askRetry(true, false);
        if (!retry) {
          return;
        }
      }
    }

    // 普通更新：静默下载安装，不打断当前使用
    const ok = await downloadAndInstall(url, silent);
    if (!ok) {
      await askRetry(false, silent);
      return;
    }
    // 安装完成后再询问是否重启；选择稍后则下次启动自动生效
    if (await confirmRestart(info)) {
      restartApp();
    }
  } finally {
    updating = false;
  }
}

/** 检测结果：failed 表示检测过程本身失败（读不到版本 / 请求异常） */
type CheckOutcome =
  | { kind: "update"; info: AppUpdateInfo }
  | { kind: "latest" }
  | { kind: "failed"; reason: string };

/**
 * 读当前 wgt 版本 + 调检测接口
 *
 * 只做检测、不弹任何 UI：自动入口与手动入口共用这一份逻辑。
 */
async function fetchUpdate(): Promise<CheckOutcome> {
  const current = await readWidgetVersion();
  if (!current) {
    return { kind: "failed", reason: "读不到当前应用版本，请确认是 App 端正式包" };
  }
  try {
    const info = await checkAppUpdate(current.versionName, current.versionCode);
    if (info && info.update && info.wgtUrl) {
      return { kind: "update", info };
    }
    return { kind: "latest" };
  } catch (e) {
    const reason = e instanceof Error && e.message ? e.message : "网络异常";
    return { kind: "failed", reason };
  }
}

/**
 * App 启动时检查并执行 wgt 热更新
 *
 * 仅 App 平台生效；每次启动只跑一次，检测失败**静默跳过**、不阻塞启动。
 * 普通更新静默下载安装，强制更新才弹确认框；整包（apk/ipa）升级不在范围内。
 */
export async function checkAndUpdateApp(): Promise<void> {
  // #ifdef APP-PLUS
  if (started) {
    return;
  }
  started = true;
  const outcome = await fetchUpdate();
  if (outcome.kind !== "update") {
    // 启动检测保持静默：无更新或检测失败都不打扰用户
    return;
  }
  await runUpdate(outcome.info, true);
  // #endif
}

/**
 * 手动检查更新（「关于」页的「检查更新」按钮）
 *
 * 与启动检测共用检测与更新流程，区别只在反馈：进行中给提示、无新版给提示、失败给可读原因。
 * 可重复触发；进行中重复点击会被忽略。非 App 平台为空实现。
 */
export async function checkAppUpdateManually(): Promise<void> {
  // #ifdef APP-PLUS
  if (checking) {
    return;
  }
  checking = true;
  uni.showLoading({ title: "正在检查更新…", mask: true });
  try {
    const outcome = await fetchUpdate();
    uni.hideLoading();
    if (outcome.kind === "update") {
      await runUpdate(outcome.info, false);
      return;
    }
    if (outcome.kind === "latest") {
      uni.showToast({ title: "已是最新版本", icon: "none" });
      return;
    }
    uni.showModal({
      title: "检查更新失败",
      content: outcome.reason,
      showCancel: false,
      confirmText: "知道了",
    });
  } finally {
    checking = false;
  }
  // #endif
}
