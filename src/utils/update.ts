import { checkAppUpdate, type AppUpdateInfo } from "@/api/appVersion";
import { readWidgetVersion } from "@/utils/appInfo";

/** 一次启动只自动检测一次 */
let started = false;
/** 更新流程进行中，避免重复弹窗与重复下载 */
let updating = false;

/** 延迟指定毫秒 */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 更新弹窗：普通版本可「稍后」，强制版本不提供取消 */
function confirmUpdate(info: AppUpdateInfo): Promise<boolean> {
  const force = info.forceUpdate === true;
  const versionText = info.versionName ? `新版本 v${info.versionName}` : "发现新版本";
  const content = info.updateLog ? `${versionText}\n\n${info.updateLog}` : versionText;
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: force ? "发现新版本（必须更新）" : "发现新版本",
      content,
      showCancel: !force,
      cancelText: "稍后",
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

/** 下载 wgt 资源包，返回本地临时路径；失败返回 null */
function downloadWgt(url: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    uni.showLoading({ title: "正在下载更新 0%", mask: true });
    const task = uni.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) {
          resolve(res.tempFilePath);
        } else {
          resolve(null);
        }
      },
      fail: () => {
        resolve(null);
      },
    });
    task.onProgressUpdate((res) => {
      uni.showLoading({ title: `正在下载更新 ${res.progress}%`, mask: true });
    });
  });
}

/**
 * 安装 wgt 并重启
 *
 * 安装成功后必须调用 plus.runtime.restart()，否则新资源不生效。
 */
function installWgt(tempFilePath: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // #ifdef APP-PLUS
    try {
      const plusObj = (window as unknown as { plus?: any }).plus;
      if (plusObj?.runtime?.install) {
        plusObj.runtime.install(
          tempFilePath,
          { force: false },
          () => {
            uni.hideLoading();
            uni.showToast({ title: "更新完成，正在重启", icon: "none" });
            setTimeout(() => {
              try {
                plusObj.runtime.restart();
              } catch (e) {
                // 重启失败时保留已安装资源，下次启动即生效
              }
            }, 800);
            resolve(true);
          },
          () => {
            resolve(false);
          },
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

/** 更新失败提示；强制更新时询问是否重试，返回 true 表示重试 */
function askRetry(force: boolean): Promise<boolean> {
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

/** 下载 → 安装 → 重启；返回是否成功 */
async function downloadAndInstall(url: string): Promise<boolean> {
  const tempFilePath = await downloadWgt(url);
  if (!tempFilePath) {
    uni.hideLoading();
    return false;
  }
  uni.showLoading({ title: "正在安装更新", mask: true });
  return installWgt(tempFilePath);
}

/** 执行一次更新流程 */
async function runUpdate(info: AppUpdateInfo): Promise<void> {
  if (updating || !info.wgtUrl) {
    return;
  }
  updating = true;
  try {
    const force = info.forceUpdate === true;
    const url = info.wgtUrl;

    // 强制更新：弹窗不可跳过，用户取消后再次弹出，直到点「立即更新」
    let confirmed = await confirmUpdate(info);
    while (!confirmed && force) {
      await delay(400);
      confirmed = await confirmUpdate(info);
    }
    if (!confirmed) {
      return;
    }

    // 强制更新：失败后允许重试；普通版本提示后允许继续使用
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const ok = await downloadAndInstall(url);
      if (ok) {
        return;
      }
      const retry = await askRetry(force);
      if (!retry) {
        return;
      }
    }
  } finally {
    updating = false;
  }
}

/**
 * App 启动时检查并执行 wgt 热更新
 *
 * 仅 App 平台生效；检测接口请求失败时静默跳过，不阻塞启动。整包（apk/ipa）升级不在范围内。
 */
export async function checkAndUpdateApp(): Promise<void> {
  // #ifdef APP-PLUS
  if (started) {
    return;
  }
  started = true;
  const current = await readWidgetVersion();
  if (!current) {
    return;
  }
  let info: AppUpdateInfo | null = null;
  try {
    info = await checkAppUpdate(current.versionName, current.versionCode);
  } catch (e) {
    return;
  }
  if (!info || !info.update || !info.wgtUrl) {
    return;
  }
  await runUpdate(info);
  // #endif
}
