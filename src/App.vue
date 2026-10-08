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
  background-color: $meal-bg;
  color: $meal-text;
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

.card {
  background-color: $meal-card;
  border-radius: 24rpx;
  padding: 24rpx;
  box-shadow: 0 6rpx 20rpx rgba(30, 33, 38, 0.06);
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
  color: $meal-text-2;
  font-size: 24rpx;
}

.tiny {
  color: $meal-text-2;
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
  color: $meal-text-2;
  font-size: 26rpx;
}
</style>
