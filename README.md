# 吃了么 · 家庭点餐端

一个面向家庭日常用餐场景的跨端点餐应用。家人可以一起维护菜谱、点餐、查看订单，厨师或家庭管理员可以接单、管理制作进度；客户端支持 H5 与原生 App，并内置 App 资源热更新能力。

项目基于 **uni-app + Vue 3 + TypeScript** 开发，复用 `howe-system` 后端的登录、JWT 会话、角色权限、数据权限与对象存储能力。

## 功能

### 点餐区

- 按分类浏览家庭菜谱，支持搜索菜品、查看用料 / 做法 / 小贴士
- 将菜品加入本地购物车，确认后一次性下单
- 查看「我的订单」与订单详情，跟踪待接单、制作中、已完成等状态
- 对已完成订单发表评价，查看历史评价
- 提交新菜提案，查看审核进度；通过后可进入家庭菜谱

### 厨师 / 家庭管理

- 厨师工作台：查看待接单、制作中订单，更新制作状态
- 备菜清单：按当前订单汇总待准备食材
- 家庭管理员：生成家庭邀请码、查看成员、调整家庭角色、停用 / 启用 / 移除成员，或直接新增成员账号
- 通过家庭邀请码自助注册并加入已有家庭

### 通用能力

- 点餐区与厨师工作台双模式切换，底部导航随当前视图变化
- 浅色 / 深色 / 跟随系统 / 按时间自动切换主题
- 订单通知轮询：App 使用本地通知，H5 使用页面弹窗
- App 端支持 wgt 资源热更新，分为自动检测与「关于」页手动检测
- 登录会话默认 30 天并按 TTL 滑动续期，减少家庭场景下的重复登录

## 技术栈

| 分类 | 技术 |
|---|---|
| 跨端框架 | uni-app（App / H5） |
| 视图框架 | Vue 3.4 + TypeScript |
| 状态管理 | Pinia |
| UI 组件 | Wot Design Uni |
| 构建工具 | Vite 5 |
| 样式 | SCSS |
| H5 部署 | Cloudflare Pages |
| App 构建 | HBuilderX / uni-app CLI |
| App 热更新 | wgt 资源包 + 后端版本检测接口 |
| 自动化发布 | GitHub Actions |

> `vue`、`@vue/*`、`pinia` 与 `@dcloudio/*` 的版本是配套锁定的，升级时需要整体验证，不能只给 Vue 或 Pinia 加 `^`。

## 快速开始

### 环境要求

- Node.js 18+（CI 使用 Node.js 20）
- npm
- 原生 App 调试或打包需要 HBuilderX
- 可访问的 `howe-system` 后端服务（默认端口 `9527`）

### 本地运行 H5

```bash
npm install
npm run dev:h5
```

访问 `http://localhost:5180`。开发服务器会把 `/dev-api` 代理到 `http://localhost:9527`。

### 类型检查

```bash
npm run type-check
```

## 环境变量

| 文件 | 变量 | 用途 |
|---|---|---|
| `.env.development` | `VITE_APP_BASE_API` | H5 开发环境接口前缀，默认 `/dev-api` |
| `.env.development` | `VITE_APP_BASE_API_PHONE` | 真机原生 App 调试使用的局域网后端地址 |
| `.env.production` | `VITE_APP_BASE_API` | 生产后端地址，App 构建时会被写入安装包，必须使用可公网访问的 HTTPS 地址 |

H5 通过 Vite 代理访问后端；原生 App 没有代理，必须使用手机可访问的绝对地址。生产包不要填写局域网 IP 或明文 HTTP 地址。

## 构建与发布

### H5

```bash
npm run build:h5
```

构建产物位于 `dist/`，可部署到 Cloudflare Pages。Cloudflare Pages 的环境变量只影响对应构建环境，不需要把后端地址写死在页面代码里。

### 原生 App

```bash
npm run build:app
```

使用 HBuilderX 完成 Android / iOS 的签名、渠道配置与整包发布。Android 包名为 `com.wyantao.meal`，默认只构建 `armeabi-v7a` 与 `arm64-v8a`。

### wgt 资源热更新

```bash
npm run build:wgt       # 构建 wgt 资源包
npm run verify:wgt      # 校验 wgt 目录结构和 manifest
npm run publish:wgt     # 构建、递增版本并发布
```

热更新只更新应用资源，不替代 APK / IPA 整包升级。发布前需要在后端配置发布令牌，并在本地环境变量或 `scripts/publish.env.local` 中设置 `MEAL_PUBLISH_TOKEN`。

合入 `main` 且改动命中构建路径时，GitHub Actions 会自动构建、校验、发布 wgt，并把新版本号写回源码。仓库需要配置 Secret `MEAL_PUBLISH_TOKEN`。

> wgt 包内的资源必须直接位于压缩包根目录，并包含正确的目录条目；否则原生安装器会安装失败。相关逻辑已由构建脚本处理，发布前仍建议执行 `npm run verify:wgt`。

## 目录结构

```text
src/
├─ api/          # 登录、菜品、订单、评价、提案、成员、版本等接口
├─ components/   # TabBar、AppDialog 等通用组件
├─ composables/  # 组合式函数
├─ pages/        # 登录、点餐、购物车、订单、厨师工作台、个人中心等页面
├─ store/        # 用户、购物车、主题状态
├─ static/       # 图标与静态资源
├─ types/        # 接口类型与状态文案
└─ utils/        # 请求、鉴权、环境、通知、更新等工具

scripts/         # wgt 构建、校验与发布脚本
.github/         # App 自动发布工作流
```

## 后端依赖

本项目不是独立运行的应用，需要部署配套的 `howe-system` 后端，并完成以下准备：

1. 创建 MySQL 数据库并导入 `howe-system/server/sql/base.sql`
2. 导入点餐模块脚本 `meal.sql`，按需导入博客、AI、文件分享等其他模块脚本
3. 准备 Redis
4. 配置后端 `.env` 中的数据库、Redis、JWT 与敏感值主密钥
5. 在管理端配置家庭、角色、菜品分类与公共菜谱

接口地址、CORS、短信或推送等能力需要根据实际部署环境配置。

## 已知限制

- 购物车仅保存在本地，不会跨设备同步
- wgt 热更新只更新资源层，涉及原生权限、插件或启动配置的变更仍需发布新的 APK / IPA
- iOS 上架需要 Apple Developer 账号、签名证书与 App Store 审核材料
- 中国大陆 Android 应用商店通常还需要软件著作权、隐私政策、备案信息等材料，具体以各商店要求为准

## 相关项目

- 后端与管理端：[howe-system](https://github.com/howello/howe-system)

## License

本项目为私有项目，未声明开源许可证。如需开源，请先补充明确的 LICENSE。
