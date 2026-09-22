import { getToken, removeToken } from "./auth";
import { BASE_API } from "./env";

/** 后端统一响应体 */
export interface ApiResult<T = any> {
  code: number;
  msg: string;
  data?: T;
  rows?: T;
  total?: number;
}

/** 分页结果 */
export interface PageResult<T = any> {
  rows: T[];
  total: number;
}

export interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: Record<string, any>;
}

/** 防止并发 401 时反复跳登录页 */
let redirecting = false;

function toLogin(): void {
  removeToken();
  if (redirecting) {
    return;
  }
  redirecting = true;
  // 记下来源页，登录成功后回到这里
  const pages = getCurrentPages();
  const current = pages.length ? (pages[pages.length - 1] as unknown as { route?: string }) : null;
  const route = current?.route ? `/${current.route}` : "";
  if (route && route !== "/pages/login/index") {
    uni.setStorageSync("meal-redirect", route);
  }
  uni.reLaunch({
    url: "/pages/login/index",
    complete: () => {
      setTimeout(() => {
        redirecting = false;
      }, 800);
    },
  });
}

function doRequest(options: RequestOptions): Promise<ApiResult> {
  const token = getToken();
  const header: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    header.Authorization = `Bearer ${token}`;
  }

  return new Promise<ApiResult>((resolve, reject) => {
    uni.request({
      url: BASE_API + options.url,
      method: options.method || "GET",
      data: options.data,
      header,
      success: (res) => {
        const status = res.statusCode;
        if (status === 401) {
          toLogin();
          reject(new Error("登录状态已过期"));
          return;
        }
        if (status !== 200) {
          uni.showToast({ title: `请求失败（${status}）`, icon: "none" });
          reject(new Error(`请求失败（${status}）`));
          return;
        }
        const body = res.data as unknown as ApiResult;
        if (!body || typeof body.code !== "number") {
          reject(new Error("响应格式不正确"));
          return;
        }
        if (body.code === 401) {
          toLogin();
          reject(new Error(body.msg || "登录状态已过期"));
          return;
        }
        if (body.code !== 200) {
          uni.showToast({ title: body.msg || "操作失败", icon: "none" });
          reject(new Error(body.msg || "操作失败"));
          return;
        }
        resolve(body);
      },
      fail: () => {
        uni.showToast({ title: "网络异常，请稍后重试", icon: "none" });
        reject(new Error("网络异常"));
      },
    });
  });
}

/**
 * 请求并返回 data 字段
 */
export async function request<T = any>(options: RequestOptions): Promise<T> {
  const body = await doRequest(options);
  return body.data as T;
}

/**
 * 请求分页接口并返回 rows 与 total
 */
export async function requestPage<T = any>(options: RequestOptions): Promise<PageResult<T>> {
  const body = await doRequest(options);
  return {
    rows: (body.rows || []) as T[],
    total: body.total || 0,
  };
}

/**
 * 请求接口，只关心是否成功
 */
export async function requestVoid(options: RequestOptions): Promise<void> {
  await doRequest(options);
}

/**
 * 请求接口并返回完整响应体
 *
 * 登录与 getInfo 把 token、roles 放在顶层而不是 data 里，这两类接口用这个函数。
 */
export async function requestRaw<T = Record<string, any>>(
  options: RequestOptions,
): Promise<ApiResult & T> {
  return (await doRequest(options)) as ApiResult & T;
}

export { BASE_API };
