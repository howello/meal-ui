<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { listCategory } from "@/api/dish";
import { submitProposal } from "@/api/proposal";
import { uploadImage } from "@/api/upload";
import type { Category } from "@/types";

const categories = ref<Category[]>([]);
const categoryIndex = ref(-1);
const name = ref("");
const description = ref("");
const reason = ref("");
const image = ref("");
const submitting = ref(false);

onLoad(async () => {
  try {
    const res = await listCategory();
    categories.value = res.rows;
  } catch (e) {
    categories.value = [];
  }
});

const categoryNames = computed(() => categories.value.map((item) => item.name));

const selectedCategoryName = computed(() =>
  categoryIndex.value >= 0 ? categoryNames.value[categoryIndex.value] : "请选择",
);

function onCategoryChange(event: { detail: { value: number | string } }) {
  categoryIndex.value = Number(event.detail.value);
}

function pickImage() {
  uni.chooseImage({
    count: 1,
    success: async (res) => {
      const path = (res.tempFilePaths as string[])[0];
      if (!path) {
        return;
      }
      try {
        image.value = await uploadImage(path);
      } catch (e) {
        // 上传失败已提示
      }
    },
  });
}

async function submit() {
  if (!name.value.trim()) {
    uni.showToast({ title: "请填写菜名", icon: "none" });
    return;
  }
  if (submitting.value) {
    return;
  }
  submitting.value = true;
  try {
    await submitProposal({
      name: name.value.trim(),
      categoryId: categoryIndex.value >= 0 ? categories.value[categoryIndex.value].categoryId : undefined,
      description: description.value,
      reason: reason.value,
      image: image.value || undefined,
    });
    uni.showToast({ title: "提案已提交", icon: "none" });
    setTimeout(() => {
      uni.redirectTo({ url: "/pages/proposal/list" });
    }, 700);
  } catch (e) {
    // 提示已由请求层给出
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="page-body">
    <view class="note">想吃什么就提，管理员审核通过后就会出现在点餐区</view>

    <view class="field">
      <text class="field__label">菜名</text>
      <input v-model="name" class="field__input" placeholder="如：水煮牛肉" placeholder-class="ph" />
    </view>

    <picker mode="selector" :range="categoryNames" @change="onCategoryChange">
      <view class="field">
        <text class="field__label">建议分类</text>
        <text class="field__value">{{ selectedCategoryName }}</text>
      </view>
    </picker>

    <view class="card">
      <text class="section-title">菜品介绍</text>
      <textarea
        v-model="description"
        class="textarea"
        maxlength="500"
        placeholder="这道菜大概是什么味道、什么做法"
        placeholder-class="ph"
      />
    </view>

    <view class="card">
      <text class="section-title">参考图（选填）</text>
      <view class="upl">
        <view v-if="image" class="upl__box">
          <image class="upl__img" :src="image" mode="aspectFill" @click="image = ''" />
        </view>
        <view v-else class="upl__box upl__box--add" @click="pickImage">＋</view>
      </view>
    </view>

    <view class="card">
      <text class="section-title">想吃的理由</text>
      <textarea
        v-model="reason"
        class="textarea"
        maxlength="500"
        placeholder="这周想吃点辣的…"
        placeholder-class="ph"
      />
    </view>

    <view class="submit" :class="{ 'submit--disabled': submitting }" @click="submit">
      {{ submitting ? "提交中…" : "提交提案" }}
    </view>
  </view>
</template>

<style lang="scss" scoped>
.note {
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  background-color: $meal-primary-soft;
  color: $meal-primary;
  font-size: 24rpx;
  line-height: 1.5;
  margin-bottom: 24rpx;
}

.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: $meal-card;
  border-radius: 20rpx;
  padding: 28rpx 24rpx;
  margin-bottom: 16rpx;
}

.field__label {
  font-size: 28rpx;
  color: $meal-text;
}

.field__input {
  flex: 1;
  text-align: right;
  font-size: 28rpx;
  color: $meal-text;
}

.field__value {
  font-size: 28rpx;
  color: $meal-text;
}

.ph {
  color: $meal-text-2;
}

.textarea {
  width: 100%;
  min-height: 150rpx;
  font-size: 26rpx;
  color: $meal-text;
}

.upl {
  display: flex;
  gap: 16rpx;
}

.upl__box {
  width: 150rpx;
  height: 150rpx;
  border-radius: 18rpx;
  overflow: hidden;
}

.upl__img {
  width: 150rpx;
  height: 150rpx;
}

.upl__box--add {
  border: 2rpx dashed $meal-line;
  color: $meal-text-2;
  font-size: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit {
  margin-top: 40rpx;
  height: 96rpx;
  line-height: 96rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: $meal-primary;
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
}

.submit--disabled {
  opacity: 0.6;
}
</style>
