/**
 * 应用信息（「关于」页展示用）
 *
 * 版本号 / 构建号 / 包名等构建信息来自 manifest.json；uni 没有运行时读取 manifest 的接口，
 * 所以这里以常量兜底，App 端再优先取运行时（已安装包）的真实值。
 * 改 manifest.json 的版本号时，记得同步这里的 BUILD_INFO。
 */
const BUILD_INFO = {
  name: "吃了么",
  description: "家庭点餐端",
  versionName: "1.0.3",
  versionCode: "103",
  /** Android 包名 */
  androidPackage: "com.wyantao.meal",
  /** uni-app 应用标识（DCloud AppID） */
  uniAppId: "__UNI__091B4F4",
} as const;

/** 运行平台标识 → 展示文案 */
const PLATFORM_LABEL: Record<string, string> = {
  app: "App",
  h5: "H5 / 网页",
  "mp-weixin": "微信小程序",
  "mp-alipay": "支付宝小程序",
};

export interface AppInfo {
  /** 应用名称 */
  name: string;
  /** 应用描述 */
  description: string;
  /** 版本号（App 端取已安装版本，其余端取构建版本） */
  version: string;
  /** 构建号 / versionCode */
  versionCode: string;
  /** 包名（Android） */
  packageName: string;
  /** uni-app 应用标识 */
  appId: string;
  /** 运行平台 */
  platform: string;
  /** 操作系统及版本 */
  system: string;
  /** 设备品牌型号 */
  device: string;
}

/** App 端优先取已安装包的真实版本，取不到再回退构建版本 */
function readVersion(): string {
  // #ifdef APP-PLUS
  try {
    if (plus.runtime.version) {
      return plus.runtime.version;
    }
  } catch (e) {
    // 忽略：回退构建版本
  }
  // #endif
  return BUILD_INFO.versionName;
}

/** App 端（Android）取运行时确认的包名，其余端回退 manifest 里的包名 */
function readPackageName(): string {
  // #ifdef APP-PLUS
  try {
    if (plus.os.name === "Android") {
      // @dcloudio/types 未声明原生 Activity 的方法，这里补一个最小接口
      const activity = plus.android.runtimeMainActivity() as unknown as { getPackageName(): string };
      const name = activity.getPackageName();
      if (name) {
        return name;
      }
    }
  } catch (e) {
    // 忽略：回退构建包名
  }
  // #endif
  return BUILD_INFO.androidPackage;
}

/** 汇总当前应用与设备信息 */
export function getAppInfo(): AppInfo {
  const sys = uni.getSystemInfoSync();
  const platformKey = sys.uniPlatform || "";
  const device = [sys.brand, sys.model].filter(Boolean).join(" ");
  return {
    name: BUILD_INFO.name,
    description: BUILD_INFO.description,
    version: readVersion(),
    versionCode: BUILD_INFO.versionCode,
    packageName: readPackageName(),
    appId: BUILD_INFO.uniAppId,
    platform: PLATFORM_LABEL[platformKey] || platformKey || sys.platform || "未知",
    system: sys.system || "未知",
    device: device || "未知",
  };
}
