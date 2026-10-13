import { BASE_API } from "@/utils/env";

/** App 热更新检测结果 */
export interface AppUpdateInfo {
  /** 是否有更新 */
  update: boolean;
  /** 最新版本名称 */
  versionName?: string;
  /** 最新版本序号 */
  versionCode?: number;
  /** wgt 资源包下载地址 */
  wgtUrl?: string;
  /** 资源包字节大小 */
  wgtSize?: number;
  /** 是否强制更新 */
  forceUpdate?: boolean;
  /** 更新说明（换行分隔） */
  updateLog?: string;
}

/**
 * 检测 App 是否有新版本（wgt 资源热更新）
 *
 * 后端检测接口匿名可访问，App 启动时即可调用，因此这里不带 token；失败也不弹提示，
 * 由调用方决定静默跳过还是重试。同时上报版本名称与版本号，服务端两者都会参与判定。
 */
export function checkAppUpdate(versionName: string, versionCode: number): Promise<AppUpdateInfo> {
  return new Promise<AppUpdateInfo>((resolve, reject) => {
    uni.request({
      url: `${BASE_API}/meal/app/version/check`,
      method: "GET",
      data: { versionName, versionCode },
      success: (res) => {
        const body = res.data as { code?: number; data?: AppUpdateInfo } | undefined;
        if (res.statusCode === 200 && body && body.code === 200 && body.data) {
          resolve(body.data);
          return;
        }
        reject(new Error("检测更新失败"));
      },
      fail: () => {
        reject(new Error("网络异常"));
      },
    });
  });
}
