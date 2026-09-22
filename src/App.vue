<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";

onLaunch(() => {
  // 启动时把本地 token 与购物车恢复进内存，页面拿到的就是最新状态
  useUserStore().restore();
  useCartStore().restore();
});
</script>

<style lang="scss">
@import "./uni.scss";

page {
  background-color: $meal-bg;
  color: $meal-text;
  font-size: 28rpx;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
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
