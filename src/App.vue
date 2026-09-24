<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import AppDialog from "@/components/AppDialog.vue";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";
import { startOrderNotifier } from "@/utils/notify";

onLaunch(() => {
  // 启动时把本地 token 与购物车恢复进内存，页面拿到的就是最新状态
  useUserStore().restore();
  useCartStore().restore();
  // 订单流转提醒：前端轮询，App 端本地通知 / H5 端 toast
  startOrderNotifier();
});
</script>

<template>
  <AppDialog />
</template>

<style lang="scss">
/* uni.scss 不用手动 import：vite-plugin-uni 会把它整份内容作为
   scss 的 additionalData 注入每个编译单元，变量在这里直接可用。 */
page {
  background-color: $meal-bg;
  color: $meal-text;
  font-size: 28rpx;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 固定视口布局：根容器占满视口且整体不滚动，
   内容超出时由内部的 .app-fixed__scroll 自行滚动，消除整页空白滚动。 */
.app-fixed {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-fixed__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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
