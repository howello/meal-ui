/**
 * 图片预览工具
 *
 * 统一封装 `uni.previewImage`，供列表 / 详情页点击图片时放大查看。
 * App 端会优先使用本地缓存文件（离线也能看），未命中缓存时回退远程地址；
 * H5 与小程序端直接使用原地址。
 */
import { getCachedImageSrcSync } from "@/utils/imageCache";

/**
 * 优先取 App 端本地缓存路径，未命中时回退原地址
 *
 * @param url 远程图片地址
 * @returns 可直接交给预览器的地址
 */
function resolvePreviewSrc(url: string): string {
  return getCachedImageSrcSync(url) || url;
}

/**
 * 调起系统图片预览，支持手势缩放与左右滑动
 *
 * @param urls    要预览的图片地址列表，空地址会被忽略
 * @param current 初始展示的图片地址；不传时展示第一张
 */
export function previewImages(urls: string[], current?: string): void {
  const list = (urls || []).filter((url): url is string => !!url).map(resolvePreviewSrc);
  if (!list.length) {
    return;
  }
  const target = current ? resolvePreviewSrc(current) : list[0];
  uni.previewImage({
    urls: list,
    current: list.includes(target) ? target : list[0],
  });
}

/**
 * 预览单张图片
 *
 * @param url 图片地址；为空时不做任何事
 */
export function previewImage(url: string): void {
  previewImages([url], url);
}
