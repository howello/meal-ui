#!/usr/bin/env node
/**
 * CI 用 wgt 自动发布脚本
 *
 * 流程：读线上最新已发布版本 → 以它为基准自动递增版本号 → 调发布接口一次完成
 * 「上传 wgt 到 R2 + 新建版本记录」。
 *
 * 为什么以线上版本为基准：后端按 version_code 判定有无更新，版本号必须严格递增。
 * 若以仓库源码版本号为基准，本地 publish:wgt（走 HBuilderX 路径、自己也在自增）
 * 与本脚本会各自从同一个源码版本号出发，产生撞号或倒退，客户端将收不到更新。
 *
 * 递增结果写入待发布 wgt 内的 manifest（由 build-wgt.mjs 完成）；加 --write-back 时
 * 额外把新版本号写回仓库源码（src/manifest.json 与 src/utils/appInfo.ts），
 * 供 CI 在发布成功后提交推送，避免源码版本号长期落后于线上（否则本地 publish:wgt
 * 会从落后的源码版本号自增，产生「发布记录生成但用户收不到」的无效发布）。
 *
 * 用法：
 *   node scripts/publish-wgt-ci.mjs [--log "更新说明"] [--force] [--dry-run] [--write-back]
 *   node scripts/publish-wgt-ci.mjs --align-only   # 只把源码版本号对齐到线上最新，不打包不发布
 *
 * 配置（环境变量，CI 里来自 GitHub Secrets）：
 *   MEAL_API_BASE       后端地址，默认 https://admin.wyantao.com/api
 *   MEAL_PUBLISH_TOKEN  发布令牌，与后端 sys_config 的 meal.app.publishToken 一致
 *   WGT_PATH            wgt 产物路径（可选；不填按构建产物的 appid 自动推断）
 *   WGT_DIR             wgt 输出目录（可选；默认 dist/release/wgt）
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const DEFAULT_API_BASE = "https://admin.wyantao.com/api";

// 与本地脚本 publish-wgt.mjs 完全一致的四处正则，保证写回格式不变
const VERSION_NAME_RE = /("versionName"\s*:\s*")([^"]*)(")/;
const VERSION_CODE_RE = /("versionCode"\s*:\s*)(\d+)/;
const APP_INFO_NAME_RE = /(versionName:\s*")([^"]*)(")/;
const APP_INFO_CODE_RE = /(versionCode:\s*")([^"]*)(")/;

const manifestPath = path.join(projectRoot, "src", "manifest.json");
const appInfoPath = path.join(projectRoot, "src", "utils", "appInfo.ts");

/** 解析命令行参数 */
function parseArgs(argv) {
  const options = { log: "", force: false, dryRun: false, writeBack: false, alignOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--log") {
      options.log = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--write-back") {
      options.writeBack = true;
    } else if (arg === "--align-only") {
      options.alignOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return options;
}

/** 版本名称修订号 +1（1.0.6 → 1.0.7） */
function bumpVersionName(versionName) {
  const parts = String(versionName).split(".");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`线上版本名称不是 x.y.z 格式，无法自动递增：${versionName}`);
  }
  return `${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}`;
}

/**
 * 把新版本号写回仓库源码
 *
 * 只替换版本号本身，不动文件其余内容与既有格式（正则与本地 publish-wgt.mjs 一致）。
 * 返回是否真的产生了改动——值已相同时返回 false，供 CI 跳过空提交。
 */
function writeBackVersions(versionName, versionCode) {
  let changed = false;

  if (!existsSync(manifestPath)) {
    throw new Error(`找不到待写回的文件：${manifestPath}`);
  }
  if (!existsSync(appInfoPath)) {
    throw new Error(`找不到待写回的文件：${appInfoPath}`);
  }

  // manifest.json：versionName 是字符串（正则第三组是闭合引号），versionCode 是数字（无引号组）
  const manifestBefore = readFileSync(manifestPath, "utf8");
  const manifestAfter = manifestBefore
    .replace(VERSION_NAME_RE, (_m, p1, _p2, p3) => `${p1}${versionName}${p3}`)
    .replace(VERSION_CODE_RE, (_m, p1) => `${p1}${versionCode}`);
  if (manifestAfter !== manifestBefore) {
    writeFileSync(manifestPath, manifestAfter, "utf8");
    changed = true;
    console.log(`已写回版本号：${manifestPath}`);
  }

  // appInfo.ts：两个都是字符串，闭合引号必须保留（第三捕获组）
  const appInfoBefore = readFileSync(appInfoPath, "utf8");
  const appInfoAfter = appInfoBefore
    .replace(APP_INFO_NAME_RE, (_m, p1, _p2, p3) => `${p1}${versionName}${p3}`)
    .replace(APP_INFO_CODE_RE, (_m, p1, _p2, p3) => `${p1}${versionCode}${p3}`);
  if (appInfoAfter !== appInfoBefore) {
    writeFileSync(appInfoPath, appInfoAfter, "utf8");
    changed = true;
    console.log(`已写回版本号：${appInfoPath}`);
  }

  if (!changed) {
    console.log("源码版本号已与本次发布一致，无需写回。");
  }
  return changed;
}

/**
 * 读取线上最新已发布版本
 *
 * 检测接口不带参数时即返回最新已发布版本（后端 selectLatestPublished 按 version_code 倒序取一条）。
 * 无已发布记录时后端返回 update=false 且无版本号，此时以 1.0.0 / 1 起步。
 */
async function fetchLatestVersion(apiBase) {
  let res;
  try {
    res = await fetch(`${apiBase}/meal/app/version/check`, { method: "GET" });
  } catch (e) {
    // 网络层异常（DNS/连接失败/超时）也要说清是「读取线上版本」失败，而不是泛化的 fetch failed
    const reason = e instanceof Error && e.message ? e.message : String(e);
    throw new Error(`读取线上版本失败：无法连接 ${apiBase}（${reason}）。请在网络可达环境重试，不要跳过该步骤发版。`);
  }
  if (!res.ok) {
    throw new Error(`读取线上版本失败：HTTP ${res.status}`);
  }
  const body = await res.json().catch(() => null);
  if (!body || body.code !== 200) {
    throw new Error(`读取线上版本失败：${(body && body.msg) || "响应格式异常"}`);
  }
  const data = body.data || {};
  if (!data.versionCode) {
    console.log("线上暂无已发布版本，从 1.0.0 (1) 起步。");
    return { versionName: "1.0.0", versionCode: 1 };
  }
  return { versionName: String(data.versionName || "1.0.0"), versionCode: Number(data.versionCode) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    return;
  }

  const apiBase = (process.env.MEAL_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
  const token = process.env.MEAL_PUBLISH_TOKEN || "";
  // wgt 路径可显式指定；未指定时按构建产物里的 appid 推断（appid 变了也不会找不到）
  const wgtDir = process.env.WGT_DIR || path.join(projectRoot, "dist", "release", "wgt");
  let wgtPath = process.env.WGT_PATH || "";

  // --align-only 只读线上版本并写回源码，不需要令牌
  if (!token && !options.alignOnly) {
    throw new Error("缺少发布令牌：请在 CI 里配置 Secret 并注入环境变量 MEAL_PUBLISH_TOKEN");
  }

  // 1. 读线上最新版本
  const latest = await fetchLatestVersion(apiBase);
  console.log(`线上最新版本：${latest.versionName} (${latest.versionCode})`);

  // --align-only：把源码版本号对齐到线上最新后结束（不递增、不打包、不发布）
  if (options.alignOnly) {
    const changed = writeBackVersions(latest.versionName, latest.versionCode);
    console.log(changed ? "源码版本号已对齐到线上最新版本。" : "源码版本号已与线上一致，无需对齐。");
    console.log(`VERSION_WRITTEN_BACK=${changed ? "1" : "0"}`);
    return;
  }

  // 2. 以线上版本为基准递增
  const nextName = bumpVersionName(latest.versionName);
  const nextCode = latest.versionCode + 1;
  console.log(`递增后版本：${nextName} (${nextCode})`);

  if (options.dryRun) {
    console.log("--dry-run：仅计算版本号，不上传。");
    return;
  }

  // 3. 重新打包，把新版本号写入 wgt 内 manifest（不改仓库源码）
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, [
    path.join(scriptDir, "build-wgt.mjs"),
    "--version-name", nextName,
    "--version-code", String(nextCode),
    "--output", wgtDir,
  ], { cwd: projectRoot, stdio: "inherit" });

  // 未显式指定 wgt 路径时，从构建产物 manifest 的 appid 推断（与 build-wgt.mjs 的命名规则一致）
  if (!wgtPath) {
    const appManifest = path.join(projectRoot, "dist", "build", "app", "manifest.json");
    const appid = (readFileSync(appManifest, "utf8").match(/"id"\s*:\s*"([^"]*)"/) || [])[1];
    if (!appid) {
      throw new Error(`无法从 ${appManifest} 读取 appid，请用 WGT_PATH 显式指定产物路径`);
    }
    wgtPath = path.join(wgtDir, `${appid}.wgt`);
  }
  if (!existsSync(wgtPath)) {
    throw new Error(`找不到 wgt 产物：${wgtPath}`);
  }

  // 4. 上传前先校验产物结构，不合格就不发出去
  execFileSync(process.execPath, [path.join(scriptDir, "verify-wgt.mjs"), wgtPath], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  // 5. 发布：一次请求完成「上传 wgt 到 R2 + 新建版本记录」
  const buffer = readFileSync(wgtPath);
  const updateLog = options.log || `更新至 v${nextName}`;
  const form = new FormData();
  form.append("file", new Blob([buffer]), path.basename(wgtPath));
  form.append("versionName", nextName);
  form.append("versionCode", String(nextCode));
  form.append("updateLog", updateLog);
  form.append("forceUpdate", options.force ? "1" : "0");

  const res = await fetch(`${apiBase}/meal/app/version/publish`, {
    method: "POST",
    headers: { "X-Publish-Token": token },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!body || body.code !== 200) {
    throw new Error(`发布失败：${(body && body.msg) || `HTTP ${res.status}`}`);
  }
  const created = body.data || {};
  console.log(`已上传 R2 并生成版本记录：${created.versionName} (${created.versionCode})`);
  console.log(`  versionId=${created.versionId} wgtUrl=${created.wgtUrl}`);
  console.log(`  包大小=${(statSync(wgtPath).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`发布完成。${options.force ? "（强制更新）" : ""}`);

  // 发布成功后才写回源码（失败路径已在上面抛错终止，不会走到这里）
  let writtenBack = false;
  if (options.writeBack) {
    writtenBack = writeBackVersions(nextName, nextCode);
  }

  // 供 CI 写入 step summary 与后续提交步骤判断
  console.log(`PUBLISHED_VERSION=${created.versionName}`);
  console.log(`PUBLISHED_VERSION_CODE=${created.versionCode}`);
  console.log(`PUBLISHED_WGT_URL=${created.wgtUrl}`);
  console.log(`VERSION_WRITTEN_BACK=${writtenBack ? "1" : "0"}`);
}

main().catch((error) => {
  console.error(`自动发布失败：${error.message}`);
  process.exitCode = 1;
});
