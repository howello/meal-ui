<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { myOrders } from "@/api/order";
import { myProposals } from "@/api/proposal";
import { myReviews } from "@/api/review";
import TabBar from "@/components/TabBar.vue";
import { useUserStore } from "@/store/user";

const userStore = useUserStore();

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
  uni.switchTab({ url: "/pages/menu/index" });
}

function doLogout() {
  uni.showModal({
    title: "退出登录",
    content: "确定要退出登录吗？",
    success: async (res) => {
      if (!res.confirm) {
        return;
      }
      await userStore.logout();
      uni.reLaunch({ url: "/pages/login/index" });
    },
  });
}

const avatarText = (): string => {
  const name = userStore.nickName;
  return name ? name.slice(0, 1) : "我";
};
</script>

<template>
  <view class="page-body page-body--tabbed">
    <view class="card profile">
      <view class="avatar">{{ avatarText() }}</view>
      <view class="profile__main">
        <view class="profile__name-row">
          <text class="profile__name">{{ userStore.nickName || "未登录" }}</text>
          <text v-for="label in userStore.roleLabels" :key="label" class="tag">{{ label }}</text>
        </view>
        <text class="tiny">家庭成员 · {{ userStore.user?.userName || "" }}</text>
      </view>
    </view>

    <view class="stats">
      <view class="stat" @click="go('/pages/order/list')">
        <text class="stat__value">{{ stats.orders }}</text>
        <text class="tiny">我的订单</text>
      </view>
      <view class="stat" @click="go('/pages/review/list')">
        <text class="stat__value">{{ stats.reviews }}</text>
        <text class="tiny">我的评价</text>
      </view>
      <view class="stat" @click="go('/pages/proposal/list')">
        <text class="stat__value">{{ stats.proposals }}</text>
        <text class="tiny">我的提案</text>
      </view>
    </view>

    <view class="menu">
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
    </view>

    <view class="menu">
      <view v-if="userStore.canKitchen" class="menu__item" @click="uni.switchTab({ url: '/pages/kitchen/waiting' })">
        <text class="menu__text">厨师工作台</text>
        <text class="chev">›</text>
      </view>
      <view v-if="userStore.canKitchen" class="menu__item" @click="toEaterView">
        <text class="menu__text">去点餐</text>
        <text class="chev">›</text>
      </view>
      <view v-if="userStore.isManager" class="menu__item">
        <text class="menu__text">家庭与成员</text>
        <text class="tiny">在管理端维护</text>
      </view>
    </view>

    <view class="menu">
      <view class="menu__item" @click="doLogout">
        <text class="menu__text menu__text--danger">退出登录</text>
        <text class="chev">›</text>
      </view>
    </view>

    <TabBar active="mine" />
  </view>
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
  background: linear-gradient(135deg, #ffc49b, #ff7a45);
  color: #fff;
  font-size: 40rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
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
  color: $meal-text;
}

.tag {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  background-color: $meal-primary-soft;
  color: $meal-primary;
  font-weight: 600;
}

.stats {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}

.stat {
  flex: 1;
  background-color: $meal-card;
  border-radius: 24rpx;
  padding: 24rpx 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  box-shadow: 0 6rpx 20rpx rgba(30, 33, 38, 0.06);
}

.stat__value {
  font-size: 36rpx;
  font-weight: 700;
  color: $meal-text;
}

.menu {
  margin-top: 24rpx;
}

.menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: $meal-card;
  padding: 28rpx 24rpx;
  border-radius: 20rpx;
  margin-bottom: 12rpx;
}

.menu__text {
  font-size: 28rpx;
  color: $meal-text;
}

.menu__text--danger {
  color: $meal-danger;
}

.chev {
  color: $meal-text-2;
  font-size: 30rpx;
}
</style>
