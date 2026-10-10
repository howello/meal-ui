import { defineStore } from "pinia";

/** 主题模式：手动浅色 / 手动深色 / 跟随系统 / 按时间 */
export type ThemeMode = "light" | "dark" | "system" | "time";

const THEME_MODE_KEY = "meal-theme-mode";
/** 「按时间」的夜间区间：[NIGHT_START, 24) ∪ [0, NIGHT_END) */
const NIGHT_START = 20;
const NIGHT_END = 8;
/** 「按时间」轮询间隔：每分钟核对一次是否跨过夜间分界 */
const CLOCK_INTERVAL = 60 * 1000;

interface ThemeState {
  mode: ThemeMode;
  /** 系统当前是否深色（跟随系统时用） */
  systemDark: boolean;
  /** 解析后的最终是否深色 */
  isDark: boolean;
  /** 是否已初始化，避免重复绑定监听与定时器 */
  ready: boolean;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system" || value === "time";
}

/** 读系统深色偏好：H5 用 matchMedia，App / 小程序用 getSystemInfoSync().theme */
function readSystemDark(): boolean {
  // #ifdef H5
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  // #endif
  try {
    const info = uni.getSystemInfoSync() as { theme?: string; osTheme?: string };
    return info.theme === "dark" || info.osTheme === "dark";
  } catch (e) {
    return false;
  }
}

/** 当前本地时间是否落在夜间区间（20:00–08:00） */
function isNightNow(): boolean {
  const hour = new Date().getHours();
  return hour >= NIGHT_START || hour < NIGHT_END;
}

/** 把「模式 + 系统偏好」解析成最终是否深色 */
function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  if (mode === "dark") {
    return true;
  }
  if (mode === "light") {
    return false;
  }
  if (mode === "system") {
    return systemDark;
  }
  return isNightNow();
}

/**
 * 主题状态
 *
 * mode 持久化到本地；isDark 是解析后的最终值，页面通过全局 mixin 暴露的
 * themeRootClass 绑到根节点上。跟随系统时监听系统配色变化，「按时间」时
 * 每分钟核对一次是否跨过 20:00 / 08:00 分界。
 */
export const useThemeStore = defineStore("theme", {
  state: (): ThemeState => ({
    mode: "system",
    systemDark: false,
    isDark: false,
    ready: false,
  }),
  getters: {
    /** 页面根节点用的 class：深色为 theme-dark，浅色为空 */
    themeRootClass: (state): string => (state.isDark ? "theme-dark" : ""),
    /** 是否处于「自动」模式（跟随系统或按时间），用于个人中心文案 */
    isAuto: (state): boolean => state.mode === "system" || state.mode === "time",
  },
  actions: {
    /** App 启动时调用：恢复模式、读系统偏好、绑定监听与定时器 */
    init() {
      if (this.ready) {
        this.refresh();
        return;
      }
      const saved = uni.getStorageSync(THEME_MODE_KEY);
      if (isThemeMode(saved)) {
        this.mode = saved;
      }
      this.systemDark = readSystemDark();
      this.applyResolved();
      this.bindSystemListener();
      this.startClock();
      this.ready = true;
    },
    /** 手动切换模式（个人中心调用） */
    setMode(mode: ThemeMode) {
      this.mode = mode;
      uni.setStorageSync(THEME_MODE_KEY, mode);
      this.systemDark = readSystemDark();
      this.applyResolved();
    },
    /** 重新解析一次（系统或时间变化时调用） */
    refresh() {
      this.systemDark = readSystemDark();
      this.applyResolved();
    },
    applyResolved() {
      this.isDark = resolveDark(this.mode, this.systemDark);
    },
    bindSystemListener() {
      // H5：监听系统配色变化
      // #ifdef H5
      if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
          this.systemDark = event.matches;
          this.applyResolved();
        });
      }
      // #endif
      // App / 小程序：系统主题变化回调
      if (typeof uni.onThemeChange === "function") {
        uni.onThemeChange((res: { theme: string }) => {
          this.systemDark = res.theme === "dark";
          this.applyResolved();
        });
      }
    },
    startClock() {
      setInterval(() => {
        if (this.mode === "time") {
          this.applyResolved();
        }
      }, CLOCK_INTERVAL);
    },
  },
});
