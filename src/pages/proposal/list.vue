<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { myProposals } from "@/api/proposal";
import { PROPOSAL_STATUS_TEXT, type Proposal } from "@/types";

const proposals = ref<Proposal[]>([]);
const loading = ref(false);

onShow(() => {
  loadProposals();
});

async function loadProposals() {
  loading.value = true;
  try {
    const res = await myProposals({ pageSize: 50 });
    proposals.value = res.rows;
  } catch (e) {
    proposals.value = [];
  } finally {
    loading.value = false;
  }
}

function statusText(status?: string): string {
  return PROPOSAL_STATUS_TEXT[status || "0"] || "未知";
}

function statusClass(status?: string): string {
  if (status === "1") {
    return "tag tag--ok";
  }
  if (status === "2") {
    return "tag tag--err";
  }
  return "tag tag--warn";
}

function hint(proposal: Proposal): string {
  if (proposal.status === "1") {
    return "已上架，去点餐区看看吧";
  }
  if (proposal.status === "2") {
    return "这条提案被驳回了，可以换个思路再提";
  }
  return "管理员还没看，通过后会出现在点餐区";
}
</script>

<template>
  <view class="page-body">
    <view v-for="proposal in proposals" :key="proposal.proposalId" class="card">
      <view class="row-between">
        <text class="name">{{ proposal.name }}</text>
        <text :class="statusClass(proposal.status)">{{ statusText(proposal.status) }}</text>
      </view>
      <text class="tiny meta">
        提交于 {{ proposal.createTime }}
        <template v-if="proposal.categoryName"> · 建议分类 {{ proposal.categoryName }}</template>
      </text>
      <view class="note" :class="{ 'note--err': proposal.status === '2', 'note--gray': proposal.status === '1' }">
        <template v-if="proposal.auditRemark">审核意见：{{ proposal.auditRemark }}</template>
        <template v-else>{{ hint(proposal) }}</template>
      </view>
    </view>

    <view v-if="!proposals.length" class="empty">{{ loading ? "加载中…" : "还没有提交过新菜" }}</view>
  </view>
</template>

<style lang="scss" scoped>
.name {
  font-size: 30rpx;
  font-weight: 700;
  color: $meal-text;
}

.meta {
  display: block;
  margin: 10rpx 0 16rpx;
}

.note {
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  background-color: $meal-primary-soft;
  color: $meal-primary;
  font-size: 24rpx;
  line-height: 1.5;
}

.note--gray {
  background-color: $meal-line;
  color: $meal-text-2;
}

.note--err {
  background-color: #fdecec;
  color: #dc2626;
}

.tag {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
  font-weight: 600;
}

.tag--warn {
  background-color: #fff4e5;
  color: $meal-warning;
}

.tag--ok {
  background-color: #e7f8f0;
  color: $meal-success;
}

.tag--err {
  background-color: #fdecec;
  color: #dc2626;
}
</style>
