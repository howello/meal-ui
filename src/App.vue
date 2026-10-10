<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";
import { useOrderNotifierAppLifecycle } from "@/utils/notify";

useOrderNotifierAppLifecycle();

onLaunch(() => {
  useUserStore().restore();
  useCartStore().restore();
});
</script>

<style lang="scss">
/* uni.scss 不用手动 import：vite-plugin-uni 会把它整份内容作为
   scss 的 additionalData 注入每个编译单元，变量在这里直接可用。 */

/* 内容不足一屏时，整页也不能被拖出回弹 */
html,
body {
  overscroll-behavior: none;
}

page {
  /* 全站环境光背景：浅蓝紫渐变 + 柔和光斑，各页玻璃浮于其上 */
  @include lg-ambient-bg;
  color: $lg-ink;
  font-size: 28rpx;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 固定视口布局：根容器固定定位，正好铺满 uni 的内容区且整体不滚动，
   内容超出时由内部的 .app-fixed__scroll 自行滚动。
   不能用 height: 100vh —— H5 带原生导航栏的页面内容区只有 100% - 44px，
   手机浏览器的 100vh 还包含地址栏，多出来的高度会让整页可以拖动。
   --window-top / --window-bottom 由 uni 在 H5 与 App 端注入（App 原生导航栏不占 webview，为 0）。 */
.app-fixed {
  position: fixed;
  top: var(--window-top, 0px);
  bottom: var(--window-bottom, 0px);
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-fixed__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

/* 带底部导航的页面：内部滚动区上下左右留白，底部给 TabBar 让位 */
.app-fixed__scroll--tabbed {
  padding: 24rpx 24rpx 200rpx;
}

/* 固定视口布局里不随内容滚动的顶部区域（如搜索框、分类条） */
.app-fixed__head {
  flex: 0 0 auto;
  padding: 24rpx 24rpx 0;
}

.page-body {
  padding: 24rpx;
}

/* 带底部导航的页面：给自定义 TabBar 留出高度 */
.page-body--tabbed {
  padding: 24rpx 24rpx 200rpx;
}

/* 自定义玻璃导航栏（GlassNavBar）固定顶部，页面内容整体下移让位：
   状态栏高度 + 88rpx 导航栏高度。
   用原生导航栏改成自定义栏的页面走这里；厨师端 waiting/cooking 自带 header，不用。 */
.page-body {
  padding-top: calc(24rpx + var(--status-bar-height) + 88rpx);
}
.app-fixed--topnav {
  padding-top: calc(var(--status-bar-height) + 88rpx);
}

.card {
  border-radius: 24rpx;
  padding: 24rpx;
  border: 1px solid $lg-border;
  box-shadow: $lg-shadow, $lg-edge;
  /* 降级底：不支持 backdrop-filter 时仍保证可读 */
  background: rgba(255, 255, 255, 0.72);
}

.card + .card {
  margin-top: 24rpx;
}

.row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.muted {
  color: $lg-ink-2;
  font-size: 24rpx;
}

.tiny {
  color: $lg-ink-3;
  font-size: 22rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}

.empty {
  padding: 120rpx 0;
  text-align: center;
  color: $lg-ink-2;
  font-size: 26rpx;
}

/* ============================================================
   Liquid Glass 全局样式（核心页启用，其余页逐步铺开）
   超透底 + 亮描边 + 背景模糊/饱和 + 柔和内外阴影
   ============================================================ */

/* 页面环境光背景由 page / uni-page 提供（见上），此处不再在页面根容器重复铺一层，
   否则固定导航栏下沿会出现两层渐变的接缝 */

/* H5：uni-app 原生导航栏（今天吃什么 / 购物车 / 个人中心…）玻璃化。
   原生导航栏是 position:fixed 的 uni-page-head，吃不到页面样式，
   这里把环境光渐变提到整页容器 uni-page 上，让导航栏背后也是同一渐变，
   再把 uni-page-body 置透明，避免导航栏下沿出现两层渐变的接缝。 */
/* #ifdef H5 */
uni-page {
  @include lg-ambient-bg;
}

uni-page-body {
  background: transparent !important;
}

/* 可见的导航栏是 uni-page-head 内部那个 div：class 与元素同名（.uni-page-head），
   固定定位、高 44px，uni-app 还把导航栏背景色以 inline style 写在它身上。
   所以玻璃必须加在 .uni-page-head 上，并用 !important 覆盖它的 inline 背景色。 */
.uni-page-head {
  color: $lg-ink !important;
  background: rgba(255, 255, 255, 0.45) !important;
  backdrop-filter: blur($lg-blur) saturate($lg-sat);
  -webkit-backdrop-filter: blur($lg-blur) saturate($lg-sat);
  border-bottom: 1px solid $lg-border;
}

.uni-page-head .uni-page-head__title {
  color: $lg-ink !important;
}
/* #endif */

/* 玻璃基元：默认给半透明白底作降级（小程序等不支持 backdrop-filter 时仍可读），
   支持背景模糊时再切成真玻璃 */
.glass {
  border: 1px solid $lg-border;
  box-shadow: $lg-shadow, $lg-edge;
  background: rgba(255, 255, 255, 0.72);
}
.glass--strong {
  background: rgba(255, 255, 255, 0.82);
}
.glass--weak {
  background: rgba(255, 255, 255, 0.6);
  box-shadow: $lg-shadow-sm, $lg-edge;
}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass {
    background: $lg-glass;
    backdrop-filter: blur($lg-blur) saturate($lg-sat);
    -webkit-backdrop-filter: blur($lg-blur) saturate($lg-sat);
  }
  .glass--strong {
    background: $lg-glass-strong;
  }
  .glass--weak {
    background: $lg-glass-weak;
  }
  /* 全局 .card 一并玻璃化，未单独改造的页面卡片自动生效 */
  .card {
    background: $lg-glass;
    backdrop-filter: blur($lg-blur) saturate($lg-sat);
    -webkit-backdrop-filter: blur($lg-blur) saturate($lg-sat);
  }
}

/* 强调标签（分类标签 / 角色标签） */
.glass-chip {
  font-size: 22rpx;
  font-weight: 600;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  color: $lg-accent;
  background: $lg-accent-soft;
  border: 1px solid rgba(255, 107, 53, 0.22);
}
</style>
