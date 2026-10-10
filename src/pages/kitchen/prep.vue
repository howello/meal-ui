<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { getDish } from "@/api/dish";
import { orderDetail } from "@/api/order";
import GlassNavBar from "@/components/GlassNavBar.vue";
import type { Ingredient } from "@/types";

/** 合并后某个食材的来源：哪道菜、该菜对它的用量 */
interface PrepSource {
  dishName: string;
  amount: string;
}

/** 合并后的备菜条目：按食材名去重，来源可追溯 */
interface PrepItem {
  name: string;
  sources: PrepSource[];
}

const orderId = ref(0);
const loading = ref(true);
const items = ref<PrepItem[]>([]);
/** 已买完的食材名集合 */
const checked = ref<Set<string>>(new Set());

/** 本地存储 key：按订单隔离，不同订单互不影响 */
const storageKey = computed(() => `meal-prep-${orderId.value}`);
const checkedCount = computed(() => items.value.filter((item) => checked.value.has(item.name)).length);

onLoad(async (options) => {
  orderId.value = Number(options?.orderId || 0);
  if (!orderId.value) {
    uni.showToast({ title: "订单不存在", icon: "none" });
    loading.value = false;
    return;
  }
  loadChecked();
  await loadItems();
});

/** 读取本地已勾选的食材名（损坏则忽略，当作尚未勾选） */
function loadChecked() {
  const names: string[] = [];
  try {
    const raw = uni.getStorageSync(storageKey.value);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      parsed.forEach((name) => {
        if (typeof name === "string") {
          names.push(name);
        }
      });
    }
  } catch (e) {
    // 解析失败按未勾选处理
  }
  checked.value = new Set(names);
}

/** 持久化已勾选的食材名 */
function persistChecked() {
  uni.setStorageSync(storageKey.value, JSON.stringify([...checked.value]));
}

/** 拉取订单明细，逐菜取用料并按食材名合并；单道菜失败不影响其余 */
async function loadItems() {
  loading.value = true;
  try {
    const order = await orderDetail(orderId.value);
    const list = order.items || [];
    const dishIngredients = await Promise.all(
      list.map(async (item) => {
        if (!item.dishId) {
          return { dishName: item.dishName, ingredients: [] as Ingredient[] };
        }
        try {
          const dish = await getDish(item.dishId);
          return { dishName: item.dishName, ingredients: parseIngredients(dish.ingredients) };
        } catch (e) {
          return { dishName: item.dishName, ingredients: [] as Ingredient[] };
        }
      }),
    );

    const map = new Map<string, PrepItem>();
    dishIngredients.forEach(({ dishName, ingredients }) => {
      ingredients.forEach((ingredient) => {
        const name = (ingredient.name || "").trim();
        if (!name) {
          return;
        }
        const merged = map.get(name) || { name, sources: [] };
        merged.sources.push({ dishName, amount: (ingredient.amount || "").trim() });
        map.set(name, merged);
      });
    });
    items.value = [...map.values()];
  } catch (e) {
    items.value = [];
  } finally {
    loading.value = false;
  }
}

/** 解析菜品 ingredients 字段（JSON 字符串），失败或非数组返回空 */
function parseIngredients(raw?: string): Ingredient[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/** 勾选/取消某食材的「已买完」并持久化 */
function toggle(item: PrepItem) {
  const next = new Set(checked.value);
  if (next.has(item.name)) {
    next.delete(item.name);
  } else {
    next.add(item.name);
  }
  checked.value = next;
  persistChecked();
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="备菜清单" />

    <view class="card head">
      <view class="row-between">
        <text class="head__title">备菜清单</text>
        <text class="head__progress">已买 {{ checkedCount }} / 共 {{ items.length }}</text>
      </view>
      <text class="tiny head__hint">按食材名合并，勾选表示已买好</text>
    </view>

    <view v-if="loading" class="empty">加载中…</view>
    <view v-else-if="!items.length" class="empty">这张订单暂时没有可用的用料清单</view>

    <view v-else class="list">
      <view
        v-for="item in items"
        :key="item.name"
        class="card item"
        :class="{ 'item--on': checked.has(item.name) }"
        @click="toggle(item)"
      >
        <view class="item__check" :class="{ 'item__check--on': checked.has(item.name) }">
          <text v-if="checked.has(item.name)">✓</text>
        </view>
        <view class="item__main">
          <text class="item__name">{{ item.name }}</text>
          <view v-for="(source, index) in item.sources" :key="index" class="source">
            <text class="source__dish">{{ source.dishName }}</text>
            <text v-if="source.amount" class="source__amount">{{ source.amount }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.head__title {
  font-size: 32rpx;
  font-weight: 700;
  color: $lg-ink;
}

.head__progress {
  font-size: 24rpx;
  font-weight: 600;
  color: $lg-accent;
  background-color: $lg-accent-soft;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
}

.head__hint {
  display: block;
  margin-top: 10rpx;
}

.list {
  margin-top: 24rpx;
}

.item {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
}

.item--on {
  opacity: 0.6;
}

.item--on .item__name {
  text-decoration: line-through;
}

/* 勾选框：与制作中页完成勾选一致的视觉语言 */
.item__check {
  flex: 0 0 auto;
  width: 48rpx;
  height: 48rpx;
  line-height: 48rpx;
  text-align: center;
  border-radius: 50%;
  border: 1rpx solid $lg-line;
  color: #fff;
  font-size: 28rpx;
  margin-top: 4rpx;
}

.item__check--on {
  background-color: $meal-success;
  border-color: $meal-success;
}

.item__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.item__name {
  font-size: 28rpx;
  font-weight: 600;
  color: $lg-ink;
}

.source {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}

.source__dish {
  font-size: 24rpx;
  color: $lg-ink-2;
}

.source__amount {
  font-size: 24rpx;
  color: $lg-ink-3;
}
</style>
