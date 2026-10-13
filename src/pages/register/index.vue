<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { reactive, ref } from "vue";
import { getCaptcha, registerFamily, type CaptchaInfo } from "@/api/auth";
import GlassButton from "@/components/GlassButton.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";

const form = reactive({
  familyCode: "",
  username: "",
  password: "",
  nickName: "",
  phonenumber: "",
  code: "",
  uuid: "",
});

const captcha = ref<CaptchaInfo | null>(null);
const turnstileToken = ref("");
const submitting = ref(false);

onLoad(() => {
  loadCaptcha();
});

async function loadCaptcha() {
  try {
    const res = await getCaptcha();
    captcha.value = res;
    form.uuid = res.uuid || "";
    form.code = "";
    if (res.turnstileEnabled && res.turnstileSiteKey) {
      renderTurnstile(res.turnstileSiteKey);
    }
  } catch (e) {
    // 拿不到验证码配置时仍允许尝试注册，由后端决定是否放行
  }
}

/**
 * Cloudflare Turnstile 只在 H5 端渲染：它需要真实 DOM，
 * 小程序/App 端留空，由后端在未开启人机校验时直接放行。
 */
function renderTurnstile(siteKey: string) {
  // #ifdef H5
  loadTurnstileScript()
    .then(() => {
      const turnstile = (window as unknown as { turnstile?: any }).turnstile;
      const box = document.getElementById("meal-register-turnstile");
      if (!turnstile || !box) {
        return;
      }
      turnstile.render(box, {
        sitekey: siteKey,
        callback: (token: string) => {
          turnstileToken.value = token;
        },
      });
    })
    .catch(() => {
      // 脚本加载失败时留给后端判断，不阻塞用户操作
    });
  // #endif
}

// #ifdef H5
function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-meal-turnstile]");
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.mealTurnstile = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(script);
  });
}
// #endif

function captchaImage(): string {
  const info = captcha.value;
  if (!info || !info.img) {
    return "";
  }
  if (info.img.startsWith("data:")) {
    return info.img;
  }
  return `data:image/${info.imgType || "png"};base64,${info.img}`;
}

function toast(title: string) {
  uni.showToast({ title, icon: "none" });
}

async function submit() {
  if (!form.familyCode.trim()) {
    toast("请输入家庭代码");
    return;
  }
  if (!form.username.trim()) {
    toast("请输入账号");
    return;
  }
  if (!form.password) {
    toast("请输入密码");
    return;
  }
  if (!form.nickName.trim()) {
    toast("请输入昵称");
    return;
  }
  if (captcha.value?.captchaEnabled && !form.code) {
    toast("请输入验证码");
    return;
  }
  if (submitting.value) {
    return;
  }

  submitting.value = true;
  try {
    await registerFamily({
      familyCode: form.familyCode.trim(),
      username: form.username.trim(),
      password: form.password,
      nickName: form.nickName.trim(),
      phonenumber: form.phonenumber.trim() || undefined,
      code: form.code,
      uuid: form.uuid,
      turnstileToken: turnstileToken.value,
    });
    uni.showToast({ title: "注册成功，请登录", icon: "none" });
    setTimeout(() => {
      uni.navigateBack({ delta: 1 });
    }, 800);
  } catch (e) {
    // 注册失败后验证码已失效，重新拉一张
    loadCaptcha();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="注册" />

    <text class="tip">请向家庭管理员索取「家庭代码」，注册后即加入对应家庭</text>

    <view class="field glass">
      <text class="field__label">家庭代码</text>
      <input
        v-model="form.familyCode"
        class="field__input"
        type="number"
        placeholder="家庭管理员提供的数字代码"
        placeholder-class="field__ph"
      />
    </view>
    <view class="field glass">
      <text class="field__label">账号</text>
      <input v-model="form.username" class="field__input" placeholder="2-20 个字符" placeholder-class="field__ph" />
    </view>
    <view class="field glass">
      <text class="field__label">密码</text>
      <input v-model="form.password" class="field__input" password placeholder="5-20 个字符" placeholder-class="field__ph" />
    </view>
    <view class="field glass">
      <text class="field__label">昵称</text>
      <input v-model="form.nickName" class="field__input" placeholder="家人看到的名字" placeholder-class="field__ph" />
    </view>
    <view class="field glass">
      <text class="field__label">手机号</text>
      <input
        v-model="form.phonenumber"
        class="field__input"
        type="number"
        placeholder="选填"
        placeholder-class="field__ph"
      />
    </view>
    <view v-if="captcha?.captchaEnabled" class="field field--captcha glass">
      <input v-model="form.code" class="field__input" placeholder="验证码" placeholder-class="field__ph" />
      <image v-if="captchaImage()" class="field__captcha" :src="captchaImage()" @click="loadCaptcha" />
      <text v-else class="field__captcha-text" @click="loadCaptcha">刷新</text>
    </view>

    <view id="meal-register-turnstile" class="turnstile"></view>

    <GlassButton class="register__btn" :disabled="submitting" @click="submit">
      {{ submitting ? "注册中…" : "注 册" }}
    </GlassButton>

    <text class="tip tip--foot">注册后默认是「点餐员」，家庭管理员可再调整角色</text>
  </view>
</template>

<style lang="scss" scoped>
.tip {
  display: block;
  font-size: 24rpx;
  color: $lg-ink-2;
  margin-bottom: 24rpx;
}

.tip--foot {
  margin: 24rpx 0 0;
  text-align: center;
}

.field {
  display: flex;
  align-items: center;
  border-radius: 32rpx;
  padding: 26rpx 24rpx;
  margin-bottom: 20rpx;
}

.field--captcha {
  padding-right: 16rpx;
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

.field__captcha {
  width: 176rpx;
  height: 76rpx;
  border-radius: 16rpx;
}

.field__captcha-text {
  font-size: 26rpx;
  color: $lg-accent;
  padding: 0 16rpx;
}

.turnstile {
  margin-bottom: 20rpx;
}

.register__btn {
  margin-top: 24rpx;
  height: 96rpx;
  font-size: 32rpx;
}
</style>
