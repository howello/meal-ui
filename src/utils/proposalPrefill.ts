/**
 * 搜索无结果 → 提交新菜的菜名传递
 *
 * 中文菜名放在页面 URL 的 query 里会被 uni 各端再编码一次，
 * H5 / App / 小程序解码次数不一致，页面上就会看到 %E8%A5%BF… 这样的乱码。
 * 这里改为一次性内存/本地存储传递：写入后由目标页读取并立即删除，避免残留旧值。
 */
const PROPOSAL_PREFILL_KEY = "meal-proposal-prefill-name";

/** 暂存待预填的菜名；空值不写入。 */
export function saveProposalPrefillName(name: string): void {
  const value = name.trim();
  if (!value) {
    return;
  }
  uni.setStorageSync(PROPOSAL_PREFILL_KEY, value);
}

/** 取出并清除待预填的菜名；没有暂存时返回空字符串。 */
export function consumeProposalPrefillName(): string {
  try {
    const value = uni.getStorageSync(PROPOSAL_PREFILL_KEY);
    uni.removeStorageSync(PROPOSAL_PREFILL_KEY);
    return typeof value === "string" ? value : "";
  } catch (e) {
    return "";
  }
}
