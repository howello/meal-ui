<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { updateProfile, uploadAvatar } from "@/api/profile";
import AppDialog from "@/components/AppDialog.vue";
import CachedImage from "@/components/CachedImage.vue";
import GlassButton from "@/components/GlassButton.vue";
import GlassCard from "@/components/GlassCard.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import { useUserStore } from "@/store/user";

const userStore = useUserStore();

/** 性别可选项，取值与后端 sys_user.sex 一致（0 男 / 1 女 / 2 未知） */
const SEX_OPTIONS = [
  { value: "0", label: "男" },
  { value: "1", label: "女" },
  { value: "2", label: "未知" },
];

const form = reactive({
  nickName: "",
  email: "",
  phonenumber: "",
  sex: "2",
});

/** 当前展示的头像地址：有则显示图片，否则回退昵称首字 */
const avatarUrl = ref("");
/** 头像上传中 */
const uploading = ref(false);
/** 资料保存中 */
const submitting = ref(false);

const avatarText = computed(() => {
  const name = form.nickName || userStore.nickName;
  return name ? name.slice(0, 1) : "我";
});

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
    // 已从本地缓存恢复身份：先渲染，再后台刷新一次（token 失效由请求层踢回登录）
    userStore.refreshInfo();
  }
  prefill();
});

/** 用当前登录用户资料预填表单 */
function prefill() {
  const user = userStore.user;
  form.nickName = user?.nickName || "";
  form.email = user?.email || "";
  form.phonenumber = user?.phonenumber || "";
  form.sex = user?.sex || "2";
  avatarUrl.value = user?.avatar || "";
}

/** 选择并上传头像：后端压缩后转存 R2，返回图床链接 */
function chooseAvatar() {
  if (uploading.value) {
    return;
  }
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (res) => {
      const path = res.tempFilePaths?.[0];
      if (!path) {
        return;
      }
      uploading.value = true;
      try {
        const url = await uploadAvatar(path);
        avatarUrl.value = url;
        if (userStore.user) {
          userStore.user.avatar = url;
          userStore.persistUserCache();
        }
        uni.showToast({ title: "头像已更新", icon: "none" });
      } catch (e) {
        // 失败原因已由请求层提示
      } finally {
        uploading.value = false;
      }
    },
  });
}

/** 邮箱格式校验 */
function isValidEmail(value: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
}

/** 手机号格式校验（11 位大陆手机号） */
function isValidPhone(value: string): boolean {
  return /^1[3-9]\d{9}$/.test(value);
}

async function save() {
  const nickName = form.nickName.trim();
  if (!nickName) {
    uni.showToast({ title: "请填写昵称", icon: "none" });
    return;
  }
  if (nickName.length > 30) {
    uni.showToast({ title: "昵称不能超过 30 个字符", icon: "none" });
    return;
  }
  const email = form.email.trim();
  if (email && !isValidEmail(email)) {
    uni.showToast({ title: "邮箱格式不正确", icon: "none" });
    return;
  }
  const phonenumber = form.phonenumber.trim();
  if (phonenumber && !isValidPhone(phonenumber)) {
    uni.showToast({ title: "手机号格式不正确", icon: "none" });
    return;
  }
  if (submitting.value) {
    return;
  }

  submitting.value = true;
  try {
    // 邮箱/手机号传空串表示清空（后端按 null 判断是否更新，传 null 不会清空）
    await updateProfile({
      nickName,
      email,
      phonenumber,
      sex: form.sex,
    });
    // 后端保存时已刷新登录态缓存，这里再拉一次让本地资料与库一致
    await userStore.fetchInfo().catch(() => {});
    uni.showToast({ title: "已保存", icon: "none" });
    setTimeout(() => uni.navigateBack({ delta: 1 }), 400);
  } catch (e) {
    // 失败原因（含唯一性冲突）已由请求层提示
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="资料设置" />

    <GlassCard class="avatar-card">
      <view class="avatar" @click="chooseAvatar">
        <CachedImage v-if="avatarUrl" class="avatar__img" :src="avatarUrl" mode="aspectFill" />
        <text v-else class="avatar__text">{{ avatarText }}</text>
        <view v-if="uploading" class="avatar__mask">
          <text class="avatar__mask-text">上传中</text>
        </view>
      </view>
      <text class="avatar__hint">{{ uploading ? "正在压缩上传…" : "点击更换头像" }}</text>
    </GlassCard>

    <GlassCard class="form">
      <view class="field glass">
        <text class="field__label">昵称</text>
        <input
          v-model="form.nickName"
          class="field__input"
          maxlength="30"
          placeholder="家人看到的名字"
          placeholder-class="field__ph"
        />
      </view>
      <view class="field glass">
        <text class="field__label">邮箱</text>
        <input v-model="form.email" class="field__input" placeholder="选填" placeholder-class="field__ph" />
      </view>
      <view class="field glass">
        <text class="field__label">手机号</text>
        <input
          v-model="form.phonenumber"
          class="field__input"
          type="number"
          maxlength="11"
          placeholder="选填"
          placeholder-class="field__ph"
        />
      </view>
      <view class="sex">
        <text class="sex__label">性别</text>
        <view class="sex__list">
          <view
            v-for="opt in SEX_OPTIONS"
            :key="opt.value"
            class="sex__chip"
            :class="{ 'sex__chip--on': form.sex === opt.value }"
            @click="form.sex = opt.value"
          >
            {{ opt.label }}
          </view>
        </view>
      </view>
    </GlassCard>

    <GlassButton class="save-btn" :disabled="submitting" @click="save">
      {{ submitting ? "保存中…" : "保存" }}
    </GlassButton>

    <AppDialog :class="themeRootClass" />
  </view>
</template>

<style lang="scss" scoped>
.avatar-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx 24rpx;
}

.avatar {
  position: relative;
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, $lg-accent-2, $lg-accent);
  box-shadow: 0 16rpx 34rpx $lg-accent-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar__img {
  width: 100%;
  height: 100%;
}

.avatar__text {
  color: #fff;
  font-size: 60rpx;
  font-weight: 700;
}

.avatar__mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar__mask-text {
  color: #fff;
  font-size: 22rpx;
}

.avatar__hint {
  margin-top: 20rpx;
  font-size: 24rpx;
  color: $lg-ink-3;
}

.form {
  margin-top: 24rpx;
}

.field {
  display: flex;
  align-items: center;
  border-radius: 28rpx;
  padding: 24rpx 22rpx;
  margin-bottom: 16rpx;
}

.field__label {
  width: 140rpx;
  font-size: 28rpx;
  color: $lg-ink;
}

.field__input {
  flex: 1;
  font-size: 28rpx;
  color: $lg-ink;
}

.field__ph {
  color: $lg-ink-3;
}

.sex {
  margin: 8rpx 0 4rpx;
}

.sex__label {
  font-size: 28rpx;
  color: $lg-ink;
}

.sex__list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.sex__chip {
  padding: 14rpx 26rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: $lg-ink-2;
  background: $lg-fill-2;
  border: 1px solid $lg-border;
}

.sex__chip--on {
  color: #fff;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  border-color: transparent;
}

.save-btn {
  margin-top: 32rpx;
}
</style>
