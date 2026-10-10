<script setup lang="ts">
import { onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { ref } from "vue";
import { myOrders } from "@/api/order";
import { myProposals } from "@/api/proposal";
import { myReviews } from "@/api/review";
import AppDialog from "@/components/AppDialog.vue";
import GlassCard from "@/components/GlassCard.vue";
import TabBar from "@/components/TabBar.vue";
import { confirm } from "@/composables/useDialog";
import { useUserStore } from "@/store/user";
import { useOrderNotifierLifecycle } from "@/utils/notify";

const userStore = useUserStore();
useOrderNotifierLifecycle();

const stats = ref({ orders: 0, reviews: 0, proposals: 0 });

onShow(async () => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  if (!userStore.user) {
    try {
      await userStore.fetchInfo();
    } catch (e) {
      return;
    }
  } else {
    // 已从本地缓存恢复身份：先渲染，再后台刷新一次，token 失效由请求层踢回登录
    userStore.refreshInfo();
  }
  loadStats();
});

async function loadStats() {
  try {
    const [orders, reviews, proposals] = await Promise.all([
      myOrders({ pageNum: 1, pageSize: 1 }),
      myReviews({ pageNum: 1, pageSize: 1 }),
      myProposals({ pageNum: 1, pageSize: 1 }),
    ]);
    stats.value = {
      orders: orders.total,
      reviews: reviews.total,
      proposals: proposals.total,
    };
  } catch (e) {
    // 统计失败不影响入口可用
  }
}

function go(url: string) {
  uni.navigateTo({ url });
}

function toEaterView() {
  uni.reLaunch({ url: "/pages/menu/index" });
}

function toKitchen() {
  uni.reLaunch({ url: "/pages/kitchen/waiting" });
}

function doLogout() {
  confirm("确定要退出登录吗？", "退出登录").then(async (ok) => {
    if (!ok) {
      return;
    }
    await userStore.logout();
    uni.reLaunch({ url: "/pages/login/index" });
  });
}

const avatarText = (): string => {
  const name = userStore.nickName;
  return name ? name.slice(0, 1) : "我";
};
</script>

<template>
  <view class="app-fixed">
    <view class="app-fixed__scroll app-fixed__scroll--tabbed">
      <GlassCard class="profile">
        <view class="avatar">{{ avatarText() }}</view>
        <view class="profile__main">
          <view class="profile__name-row">
            <text class="profile__name">{{ userStore.nickName || "未登录" }}</text>
            <text v-for="label in userStore.roleLabels" :key="label" class="tag">{{ label }}</text>
          </view>
          <text class="tiny">家庭 · {{ userStore.deptName || "我的家庭" }} · {{ userStore.user?.userName || "" }}</text>
        </view>
      </GlassCard>

      <view class="stats">
        <GlassCard class="stat" @click="go('/pages/order/list')">
          <text class="stat__value">{{ stats.orders }}</text>
          <text class="tiny">我的订单</text>
        </GlassCard>
        <GlassCard class="stat" @click="go('/pages/review/list')">
          <text class="stat__value">{{ stats.reviews }}</text>
          <text class="tiny">我的评价</text>
        </GlassCard>
        <GlassCard class="stat" @click="go('/pages/proposal/list')">
          <text class="stat__value">{{ stats.proposals }}</text>
          <text class="tiny">我的提案</text>
        </GlassCard>
      </view>

      <GlassCard :pad="false" class="menu">
        <view class="menu__item" @click="go('/pages/order/list')">
          <text class="menu__text">我的订单</text>
          <text class="chev">›</text>
        </view>
        <view class="menu__item" @click="go('/pages/review/list')">
          <text class="menu__text">我的评价</text>
          <text class="chev">›</text>
        </view>
        <view class="menu__item" @click="go('/pages/proposal/list')">
          <text class="menu__text">我的提案</text>
          <text class="chev">›</text>
        </view>
        <view class="menu__item" @click="go('/pages/proposal/edit')">
          <text class="menu__text">提交新菜</text>
          <text class="chev">›</text>
        </view>
      </GlassCard>

      <GlassCard :pad="false" class="menu">
        <view v-if="userStore.canKitchen && userStore.tabMode === 'eater'" class="menu__item" @click="toKitchen">
          <text class="menu__text">厨师工作台</text>
          <text class="chev">›</text>
        </view>
        <view v-if="userStore.canKitchen && userStore.tabMode === 'kitchen'" class="menu__item" @click="toEaterView">
          <text class="menu__text">去点餐</text>
          <text class="chev">›</text>
        </view>
        <view v-if="userStore.isManager" class="menu__item">
          <text class="menu__text">家庭与成员</text>
          <text class="tiny">在管理端维护</text>
        </view>
      </GlassCard>

      <GlassCard :pad="false" class="menu">
        <view class="menu__item" @click="doLogout">
          <text class="menu__text menu__text--danger">退出登录</text>
          <text class="chev">›</text>
        </view>
      </GlassCard>
    </view>

    <TabBar active="mine" />
  </view>

  <AppDialog />
</template>

<style lang="scss" scoped>
.profile {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.avatar {
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, $lg-accent-2, $lg-accent);
  color: #fff;
  font-size: 40rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 16rpx 34rpx $lg-accent-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.profile__main {
  flex: 1;
}

.profile__name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}

.profile__name {
  font-size: 34rpx;
  font-weight: 700;
  color: $lg-ink;
}

.tag {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  color: $lg-accent;
  background: $lg-accent-soft;
  font-weight: 600;
}

.stats {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}

/* 用后代选择器提高权重，覆盖 GlassCard 默认内边距 */
.stats .stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 24rpx 8rpx;
}

.stat__value {
  font-size: 36rpx;
  font-weight: 700;
  color: $lg-ink;
}

/* 分组列表：一张玻璃卡内多行，行间用细分隔线 */
.menu {
  margin-top: 24rpx;
  padding: 8rpx 10rpx;
}

.menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 22rpx;
  border-radius: 16rpx;
}

.menu__item + .menu__item {
  border-top: 1px solid $lg-line;
}

.menu__text {
  font-size: 28rpx;
  color: $lg-ink;
}

.menu__text--danger {
  color: $meal-danger;
}

.chev {
  color: $lg-ink-3;
  font-size: 30rpx;
}
</style>
