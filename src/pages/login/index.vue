<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { reactive, ref } from "vue";
import { getCaptcha, login, type CaptchaInfo } from "@/api/auth";
import GlassButton from "@/components/GlassButton.vue";
import { useUserStore } from "@/store/user";
import { getToken } from "@/utils/auth";
import { stopOrderNotifier } from "@/utils/notify";

const LOGIN_REMEMBER_KEY = "meal-login-remember";
const REDIRECT_KEY = "meal-redirect";

interface RememberedLogin {
  username: string;
  password: string;
}

const userStore = useUserStore();

const form = reactive({
  username: "",
  password: "",
  code: "",
  uuid: "",
});

const captcha = ref<CaptchaInfo | null>(null);
const turnstileToken = ref("");
const submitting = ref(false);
const rememberPwd = ref(true);
/** 启动静默进首页时为 true：只渲染品牌占位，不渲染登录表单。
 *  初值直接看本地有无 token，保证有 token 时首帧就是占位、不闪一下表单。 */
const checking = ref(!!getToken());

onLoad(() => {
  // 本页是 pages.json 里的启动页，冷启动必然先到这。本地若还留着 token，
  // 就直接凭缓存的用户身份进首页（秒进），不再等 /getInfo；token 真失效时，
  // 首页 onShow 的后台刷新会拿到 401，由请求层清 token 并跳回本页。
  if (getToken()) {
    goNext();
    return;
  }
  const remembered = parseRemembered(uni.getStorageSync(LOGIN_REMEMBER_KEY));
  if (remembered) {
    form.username = remembered.username;
    form.password = remembered.password;
  }
  loadCaptcha();
});

/**
 * 读取本地记住的账号密码
 *
 * 存在本地的是明文（uni storage 本身没有加密能力）。这是个家庭内部使用的小应用，
 * 换取「打开就能登」的便利；真要更安全得换成刷新令牌方案。
 */
function parseRemembered(raw: unknown): RememberedLogin | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed.username === "string") {
      return {
        username: parsed.username,
        password: typeof parsed.password === "string" ? parsed.password : "",
      };
    }
  } catch (e) {
    // 存储被写坏时当作没记住过
  }
  return null;
}

function saveRemembered() {
  if (rememberPwd.value) {
    uni.setStorageSync(
      LOGIN_REMEMBER_KEY,
      JSON.stringify({ username: form.username, password: form.password }),
    );
  } else {
    uni.removeStorageSync(LOGIN_REMEMBER_KEY);
  }
}

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
    // 拿不到验证码配置时仍允许尝试登录，由后端决定是否放行
  }
}

/**
 * Cloudflare Turnstile 只在 H5 端渲染：它需要真实 DOM，
 * 小程序端留空，由后端在未开启人机校验时直接放行。
 */
function renderTurnstile(siteKey: string) {
  // #ifdef H5
  loadTurnstileScript()
    .then(() => {
      const turnstile = (window as unknown as { turnstile?: any }).turnstile;
      const box = document.getElementById("meal-turnstile");
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
  if (!form.username) {
    toast("请输入账号");
    return;
  }
  if (!form.password) {
    toast("请输入密码");
    return;
  }
  if (captcha.value?.captchaEnabled && !form.code) {
    toast("请输入验证码");
    return;
  }

  submitting.value = true;
  try {
    const res = await login({
      username: form.username,
      password: form.password,
      code: form.code,
      uuid: form.uuid,
      turnstileToken: turnstileToken.value,
      client: "meal",
    });
    userStore.setToken(res.token);
    stopOrderNotifier();
    saveRemembered();
    await userStore.fetchInfo();
    goNext();
  } catch (e) {
    // 登录失败后验证码已失效，重新拉一张
    loadCaptcha();
  } finally {
    submitting.value = false;
  }
}

function goNext() {
  const redirect = uni.getStorageSync(REDIRECT_KEY);
  if (redirect) {
    uni.removeStorageSync(REDIRECT_KEY);
    uni.reLaunch({ url: redirect });
    return;
  }
  uni.reLaunch({
    url: userStore.isChef ? "/pages/kitchen/waiting" : "/pages/menu/index",
  });
}
</script>

<template>
  <view class="login" :class="themeRootClass">
    <!-- 启动静默进首页的过渡帧：只显示品牌，避免登录表单闪一下 -->
    <view v-if="checking" class="login__logo glass glass--strong">
      <image class="login__logo-img" src="/static/logo.png" mode="aspectFit" />
    </view>
    <text v-if="checking" class="login__title">家里吃什么</text>

    <template v-else>
      <view class="login__logo glass glass--strong">
        <image class="login__logo-img" src="/static/logo.png" mode="aspectFit" />
      </view>
      <text class="login__title">家里吃什么</text>
      <text class="login__sub">登录后开始点餐</text>

      <view class="field glass">
        <text class="field__label">账号</text>
        <input v-model="form.username" class="field__input" placeholder="手机号 / 用户名" placeholder-class="field__ph" />
      </view>
      <view class="field glass">
        <text class="field__label">密码</text>
        <input v-model="form.password" class="field__input" password placeholder="请输入密码" placeholder-class="field__ph" />
      </view>
      <view v-if="captcha?.captchaEnabled" class="field field--captcha glass">
        <input v-model="form.code" class="field__input" placeholder="验证码" placeholder-class="field__ph" />
        <image v-if="captchaImage()" class="field__captcha" :src="captchaImage()" @click="loadCaptcha" />
        <text v-else class="field__captcha-text" @click="loadCaptcha">刷新</text>
      </view>

      <view id="meal-turnstile" class="turnstile"></view>

      <GlassButton class="login__btn" :disabled="submitting" @click="submit">
        {{ submitting ? "登录中…" : "登 录" }}
      </GlassButton>

      <view class="login__row">
        <view class="login__remember" @click="rememberPwd = !rememberPwd">
          <text class="login__checkbox" :class="{ 'login__checkbox--on': rememberPwd }">
            {{ rememberPwd ? "✓" : "" }}
          </text>
          <text class="tiny">记住密码</text>
        </view>
        <text class="tiny">忘记密码请联系家庭管理员</text>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.login {
  /* 全屏固定：固定定位铺满视口，整页不可上下滚动。
     不用 height: 100vh —— view 默认 content-box，100vh 再加上下 padding 会超出视口，
     手机浏览器的 100vh 还包含地址栏。
     背景由 page / uni-page 提供（浅蓝紫环境光渐变）。 */
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  box-sizing: border-box;
  overflow: hidden;
  /* 本页是自定义导航栏（navigationStyle: custom），App 端要给状态栏留出高度 */
  padding: calc(160rpx + var(--status-bar-height)) 52rpx 60rpx;
  display: flex;
  flex-direction: column;
}

.login__logo {
  width: 132rpx;
  height: 132rpx;
  border-radius: 40rpx;
  /* logo 自带白色底，这里做成圆角白色磁贴（App 图标观感），
     外面再套一层玻璃描边与柔和阴影，与整体玻璃语言统一 */
  overflow: hidden;
  margin-bottom: 44rpx;
}

.login__logo-img {
  width: 132rpx;
  height: 132rpx;
  display: block;
}

.login__title {
  font-size: 44rpx;
  font-weight: 700;
  color: $lg-ink;
}

.login__sub {
  font-size: 26rpx;
  color: $lg-ink-2;
  margin: 10rpx 0 60rpx;
}

/* 输入框：玻璃底由 .glass 提供，这里只负责布局 */
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
  width: 96rpx;
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

/* 主按钮高度由本页覆盖，底色/圆角/阴影来自 GlassButton。
   用后代选择器提高权重，避免与组件自身 .gbtn 同权重时被覆盖 */
.login .login__btn {
  margin-top: 24rpx;
  height: 96rpx;
  font-size: 32rpx;
}

.login__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 28rpx;
}

.login__remember {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.login__checkbox {
  width: 30rpx;
  height: 30rpx;
  line-height: 30rpx;
  text-align: center;
  border-radius: 8rpx;
  border: 1rpx solid $lg-border;
  color: transparent;
  font-size: 20rpx;
}

.login__checkbox--on {
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  border-color: transparent;
  color: #fff;
}
</style>
