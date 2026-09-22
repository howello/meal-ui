/**
 * 内联 SVG 图标
 *
 * 图标路径取自 `docs/点餐/点餐端页面规划示意.html`，用 data URI 输出，
 * 这样 H5 与小程序端都不需要额外的图标文件，也能跟随主题色变化。
 */
const ICON_PATHS: Record<string, string> = {
  menu: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9 3v3M12 3v3M15 3v3"/><path d="M4 11v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.2a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L22 7H6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/>',
  pan: '<circle cx="10" cy="13" r="6.5"/><path d="M16.5 13H22"/><path d="M8 3.5c1.5 1 1.5 2 0 3M12 3c1.5 1 1.5 2 0 3"/>',
  fire: '<path d="M12 22c4 0 6.5-2.7 6.5-6 0-4.5-4-6.5-4-10 0 0-2.5 1.5-2.5 4.5C12 8 9.5 6.5 9.5 4 7 6 5.5 8.7 5.5 12c0 4.5 2.5 10 6.5 10z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
};

/**
 * 生成图标的 data URI
 *
 * @param name  图标名
 * @param color 描边颜色
 */
export function svgIcon(name: string, color: string): string {
  const path = ICON_PATHS[name] || "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
