/**
 * 图片本地缓存（仅 App 端落盘）
 *
 * App 端把远程图片（菜品封面、评价图等）下载后另存为本地持久文件，并维护
 * 「远程 url → 本地路径」映射：加载时先读本地缓存，命中直接返回本地路径、不再走网络，
 * 未命中才下载并写入缓存。H5 与小程序端不落盘，直接返回原地址，行为与改造前一致。
 */

/** 映射的 storage key：{ [远程url]: 本地路径 }，对象保持插入顺序，用于 FIFO 淘汰 */
const CACHE_KEY = "meal-image-cache";
/** 本地缓存条目上限；App 端 savedFile 会一直占存储，超出按插入顺序淘汰最旧的 */
const MAX_ENTRIES = 300;
/** 预热并发数，避免一次性发起大量下载 */
const PRELOAD_CONCURRENCY = 4;

/** 会话内 url → 本地路径 的内存缓存，避免同一 url 重复解析 */
const memory = new Map<string, string>();
/** 进行中的解析任务，去重同一 url 的并发请求 */
const inflight = new Map<string, Promise<string>>();

/** 是否为可缓存的 http(s) 远程地址 */
function isRemote(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** 读取持久映射；不存在或损坏时返回空对象 */
function readMap(): Record<string, string> {
  try {
    const raw = uni.getStorageSync(CACHE_KEY);
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data && typeof data === "object") {
      return data as Record<string, string>;
    }
  } catch (e) {
    // 缓存损坏不影响展示，按空处理
  }
  return {};
}

/** 写入持久映射 */
function writeMap(map: Record<string, string>): void {
  try {
    uni.setStorageSync(CACHE_KEY, JSON.stringify(map));
  } catch (e) {
    // 本地缓存不可用不影响展示
  }
}

/** 校验本地文件是否仍然存在 */
function fileExists(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    uni.getSavedFileInfo({
      filePath,
      success: () => resolve(true),
      fail: () => resolve(false),
    });
  });
}

/** 下载远程图片并另存为本地持久文件，返回本地路径 */
function downloadAndSave(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          reject(new Error(`图片下载失败：${res.statusCode}`));
          return;
        }
        uni.saveFile({
          tempFilePath: res.tempFilePath,
          success: (saved) => resolve(saved.savedFilePath),
          fail: reject,
        });
      },
      fail: reject,
    });
  });
}

/** 记录映射并做容量淘汰 */
function remember(url: string, filePath: string): void {
  const map = readMap();
  map[url] = filePath;
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    // 对象保持插入顺序，多出来的即最旧条目：先删本地文件，再移除映射
    keys.slice(0, keys.length - MAX_ENTRIES).forEach((key) => {
      const stale = map[key];
      if (stale) {
        uni.removeSavedFile({ filePath: stale, fail: () => undefined });
      }
      delete map[key];
    });
  }
  writeMap(map);
}

/** App 端解析：命中本地缓存返回本地路径，否则下载落盘；失败回退原地址 */
async function resolveOnApp(url: string): Promise<string> {
  const map = readMap();
  const cached = map[url];
  if (cached && (await fileExists(cached))) {
    return cached;
  }
  if (cached) {
    // 本地文件已丢失，清掉失效映射
    delete map[url];
    writeMap(map);
  }
  try {
    const filePath = await downloadAndSave(url);
    remember(url, filePath);
    return filePath;
  } catch (e) {
    // 下载失败回退远程地址，不影响展示
    return url;
  }
}

/**
 * 解析图片地址：App 端先读本地缓存、未命中再下载并缓存；其他端直接返回原地址。
 *
 * 条件编译写在函数体内，uni 打包时会剔除当前平台不需要的分支，
 * 与 `utils/env.ts` 的写法保持一致。
 *
 * @param url 远程图片地址
 * @returns 可直接用于 `<image src>` 的地址（本地路径或原 url）
 */
export function resolveImageSrc(url: string): Promise<string> {
  if (!url || !isRemote(url)) {
    return Promise.resolve(url);
  }
  // #ifdef APP-PLUS
  const hit = memory.get(url);
  if (hit) {
    return Promise.resolve(hit);
  }
  const pending = inflight.get(url);
  if (pending) {
    return pending;
  }
  const task = resolveOnApp(url)
    .then((src) => {
      // 只有真正拿到本地路径才记内存缓存；失败仍保留原地址，下次可重试
      if (src !== url) {
        memory.set(url, src);
      }
      return src;
    })
    .finally(() => {
      inflight.delete(url);
    });
  inflight.set(url, task);
  return task;
  // #endif
  // #ifndef APP-PLUS
  return Promise.resolve(url);
  // #endif
  return Promise.resolve(url);
}

/**
 * 同步取缓存地址（仅 App 端）：命中内存或持久映射时直接返回本地路径。
 *
 * 供组件重挂载时立即出图、避免先闪一下占位；不校验文件是否仍存在，
 * 万一本地文件已失效，由 `<image>` 的 error 事件回退到原地址。
 *
 * @param url 远程图片地址
 * @returns 已缓存的本地路径；未命中返回空串
 */
export function getCachedImageSrcSync(url: string): string {
  // #ifdef APP-PLUS
  if (url && isRemote(url)) {
    const hit = memory.get(url);
    if (hit) {
      return hit;
    }
    const mapped = readMap()[url];
    if (mapped) {
      memory.set(url, mapped);
      return mapped;
    }
  }
  // #endif
  return "";
}

/**
 * 后台预热一组图片（仅 App 端生效），限并发下载并写入缓存。
 *
 * @param urls 远程图片地址列表
 */
export function preloadImages(urls: string[]): void {
  // #ifdef APP-PLUS
  const queue = (urls || []).filter((url) => url && isRemote(url));
  if (!queue.length) {
    return;
  }
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const url = queue[cursor++];
      await resolveImageSrc(url).catch(() => undefined);
    }
  };
  const workers = Math.min(PRELOAD_CONCURRENCY, queue.length);
  for (let i = 0; i < workers; i++) {
    worker();
  }
  // #endif
}

/** 清空图片缓存（本地文件 + 映射 + 内存），仅 App 端有实际动作 */
export function clearImageCache(): void {
  // #ifdef APP-PLUS
  const map = readMap();
  Object.values(map).forEach((filePath) => {
    if (filePath) {
      uni.removeSavedFile({ filePath, fail: () => undefined });
    }
  });
  memory.clear();
  inflight.clear();
  try {
    uni.removeStorageSync(CACHE_KEY);
  } catch (e) {
    // 忽略
  }
  // #endif
}
