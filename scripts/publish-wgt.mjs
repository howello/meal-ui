#!/usr/bin/env node
/**
 * 一键发布 wgt 资源包
 *
 * 流程：自动递增 manifest 版本号 → 调 HBuilderX CLI 生成 wgt → 上传后端（存 R2）→ 生成版本记录。
 * 打包或上传失败时会把版本号回退到自增前，避免版本号空耗。
 *
 * 用法：
 *   npm run publish:wgt -- [--log "更新说明"] [--force] [--no-bump] [--name 1.1.0]
 *
 * 配置（优先级：命令行 > 环境变量 > scripts/publish.env.local）：
 *   MEAL_API_BASE         后端地址，默认 http://localhost:9527
 *   MEAL_PUBLISH_TOKEN    服务端发布令牌（**推荐**）：与「系统管理 > 参数设置」里的
 *                         meal.app.publishToken 一致；配一次长期可用，不走登录、不受验证码影响
 *   MEAL_ADMIN_USER       管理端账号（兜底路径，配合 MEAL_ADMIN_PASSWORD；需关闭登录验证码）
 *   MEAL_ADMIN_PASSWORD   管理端密码
 *   MEAL_TOKEN            管理端 token（兜底路径；会过期，不推荐）
 *   HBUILDERX_CLI         HBuilderX CLI 路径，默认 D:\IDE\HBuilderX\cli.exe
 *   HBUILDERX_PROJECT     HBuilderX 里的项目名，默认 meal-ui
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(projectRoot, "src", "manifest.json");
const appInfoPath = path.join(projectRoot, "src", "utils", "appInfo.ts");
const localConfigPath = path.join(scriptDir, "publish.env.local");

const DEFAULT_API_BASE = "http://localhost:9527";
const DEFAULT_CLI = "D:\\IDE\\HBuilderX\\cli.exe";
const DEFAULT_PROJECT = "meal-ui";
const DEFAULT_OUTPUT_DIR = path.join(projectRoot, "dist", "release", "wgt");
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

const VERSION_NAME_RE = /("versionName"\s*:\s*")([^"]*)(")/;
const VERSION_CODE_RE = /("versionCode"\s*:\s*)(\d+)/;
const APP_INFO_NAME_RE = /(versionName:\s*")([^"]*)(")/;
const APP_INFO_CODE_RE = /(versionCode:\s*")([^"]*)(")/;

/** 读取 scripts/publish.env.local（KEY=VALUE，忽略注释与空行） */
function readLocalConfig() {
  const config = {};
  if (!existsSync(localConfigPath)) {
    return config;
  }
  for (const line of readFileSync(localConfigPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      continue;
    }
    config[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return config;
}

/** 解析命令行参数 */
function parseArgs(argv) {
  const options = { log: "", force: false, bump: true, name: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-bump") {
      options.bump = false;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--log") {
      options.log = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--name") {
      options.name = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return options;
}

/** 版本名称修订号 +1（1.0.3 → 1.0.4） */
function bumpVersionName(versionName) {
  const parts = String(versionName).split(".");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`版本名称不是 x.y.z 格式，无法自动递增：${versionName}`);
  }
  return `${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}`;
}

/** 读取 manifest.json 与 appInfo.ts 的当前版本号 */
function readVersions() {
  const manifest = readFileSync(manifestPath, "utf8");
  const nameMatch = manifest.match(VERSION_NAME_RE);
  const codeMatch = manifest.match(VERSION_CODE_RE);
  if (!nameMatch || !codeMatch) {
    throw new Error("无法从 src/manifest.json 读取 versionName / versionCode");
  }
  return { versionName: nameMatch[2], versionCode: Number(codeMatch[2]) };
}

/** 把新版本号写回 manifest.json 与 appInfo.ts 的构建常量 */
function writeVersions(versionName, versionCode) {
  const manifest = readFileSync(manifestPath, "utf8");
  writeFileSync(
    manifestPath,
    manifest
      .replace(VERSION_NAME_RE, (_m, p1, _p2, p3) => `${p1}${versionName}${p3}`)
      .replace(VERSION_CODE_RE, (_m, p1) => `${p1}${versionCode}`),
    "utf8",
  );

  if (existsSync(appInfoPath)) {
    const appInfo = readFileSync(appInfoPath, "utf8");
    writeFileSync(
      appInfoPath,
      appInfo
        .replace(APP_INFO_NAME_RE, (_m, p1, _p2, p3) => `${p1}${versionName}${p3}`)
        .replace(APP_INFO_CODE_RE, (_m, p1, _p2, p3) => `${p1}${versionCode}${p3}`),
      "utf8",
    );
  }
}

/** 还原 manifest.json 与 appInfo.ts 到自增前 */
function restoreVersions(snapshots) {
  for (const [file, content] of snapshots) {
    writeFileSync(file, content, "utf8");
  }
  console.log("已回退版本号到自增前的值。");
}

/** 等待 HBuilderX CLI 产出 wgt 文件 */
async function waitForFile(filePath, startedAt) {
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) {
      const info = statSync(filePath);
      if (info.size > 0 && info.mtimeMs >= startedAt) {
        return info.size;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return 0;
}

/** 解析管理端 token：优先显式 token，其次账号密码登录 */
async function resolveToken(apiBase, cfg) {
  if (cfg.token) {
    return cfg.token;
  }
  if (!cfg.user || !cfg.password) {
    throw new Error(
      "缺少发布凭据：请设置 MEAL_PUBLISH_TOKEN（推荐，一次配置长期可用，不受验证码影响）；"
        + "或设置 MEAL_ADMIN_USER 与 MEAL_ADMIN_PASSWORD（要求关闭登录验证码）",
    );
  }
  const res = await fetch(`${apiBase}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: cfg.user, password: cfg.password }),
  });
  const body = await res.json().catch(() => ({}));
  if (body && body.token) {
    return body.token;
  }
  const message = body && body.msg ? body.msg : `HTTP ${res.status}`;
  if (String(message).includes("验证码")) {
    throw new Error(
      `登录被验证码拦截（${message}）。请在「系统管理 > 参数设置」关闭 sys.account.captchaEnabled，或改用 MEAL_TOKEN。`,
    );
  }
  throw new Error(`登录失败：${message}`);
}

/** 调用后端接口，非 200 业务码时抛出错误 */
async function callApi(apiBase, token, url, init) {
  const res = await fetch(`${apiBase}${url}`, {
    ...init,
    headers: { ...(init && init.headers), Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!body || body.code !== 200) {
    throw new Error(`${url} 调用失败：${(body && body.msg) || `HTTP ${res.status}`}`);
  }
  return body;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    return;
  }

  const local = readLocalConfig();
  const apiBase = (process.env.MEAL_API_BASE || local.MEAL_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
  const cli = process.env.HBUILDERX_CLI || local.HBUILDERX_CLI || DEFAULT_CLI;
  const hxProject = process.env.HBUILDERX_PROJECT || local.HBUILDERX_PROJECT || DEFAULT_PROJECT;
  const outputDir = process.env.MEAL_WGT_OUTPUT_DIR || local.MEAL_WGT_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
  const cfg = {
    publishToken: process.env.MEAL_PUBLISH_TOKEN || local.MEAL_PUBLISH_TOKEN || "",
    token: process.env.MEAL_TOKEN || local.MEAL_TOKEN || "",
    user: process.env.MEAL_ADMIN_USER || local.MEAL_ADMIN_USER || "",
    password: process.env.MEAL_ADMIN_PASSWORD || local.MEAL_ADMIN_PASSWORD || "",
  };

  if (!existsSync(cli)) {
    throw new Error(`找不到 HBuilderX CLI：${cli}（可用 HBUILDERX_CLI 覆盖）`);
  }

  const current = readVersions();
  const nextName = options.name || (options.bump ? bumpVersionName(current.versionName) : current.versionName);
  const nextCode = options.bump ? current.versionCode + 1 : current.versionCode;
  const snapshots = [
    [manifestPath, readFileSync(manifestPath, "utf8")],
    [appInfoPath, existsSync(appInfoPath) ? readFileSync(appInfoPath, "utf8") : ""],
  ];

  console.log(`当前版本：${current.versionName} (${current.versionCode})`);
  if (options.bump) {
    writeVersions(nextName, nextCode);
    console.log(`已自增版本号：${nextName} (${nextCode})`);
  } else {
    console.log(`--no-bump：沿用当前版本 ${nextName} (${nextCode})`);
  }

  try {
    const manifest = readFileSync(manifestPath, "utf8");
    const appidMatch = manifest.match(/("appid"\s*:\s*")([^"]*)(")/);
    const appid = appidMatch ? appidMatch[2] : "__UNI__";
    const wgtName = `${appid}.wgt`;
    mkdirSync(outputDir, { recursive: true });
    const wgtPath = path.join(outputDir, wgtName);
    if (existsSync(wgtPath)) {
      rmSync(wgtPath);
    }

    const args = [
      "publish",
      "--platform", "APP",
      "--type", "wgt",
      "--project", hxProject,
      "--path", `${outputDir}${path.sep}`,
      "--name", wgtName,
    ];
    console.log(`调用 HBuilderX CLI：${cli} ${args.join(" ")}`);
    const startedAt = Date.now();
    const build = await execFileAsync(cli, args, {
      cwd: projectRoot,
      maxBuffer: 16 * 1024 * 1024,
      timeout: BUILD_TIMEOUT_MS,
    });
    if (build.stdout) {
      console.log(build.stdout.trim());
    }
    if (build.stderr) {
      console.error(build.stderr.trim());
    }

    const size = await waitForFile(wgtPath, startedAt);
    if (!size) {
      throw new Error(`未等到 wgt 产物：${wgtPath}（HBuilderX 需已导入项目「${hxProject}」并保持可运行）`);
    }
    console.log(`wgt 产物：${wgtPath}（${(size / 1024 / 1024).toFixed(2)} MB）`);

    const buffer = await readFile(wgtPath);
    const updateLog = options.log || `更新至 v${nextName}`;

    // 首选：发布令牌一次请求完成「上传 wgt + 建版本记录」，不走登录、不受验证码/人机校验影响
    if (cfg.publishToken) {
      const form = new FormData();
      form.append("file", new Blob([buffer]), wgtName);
      form.append("versionName", nextName);
      form.append("versionCode", String(nextCode));
      form.append("updateLog", updateLog);
      form.append("forceUpdate", options.force ? "1" : "0");
      const res = await fetch(`${apiBase}/meal/app/version/publish`, {
        method: "POST",
        headers: { "X-Publish-Token": cfg.publishToken },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!body || body.code !== 200) {
        throw new Error(`发布失败：${(body && body.msg) || `HTTP ${res.status}`}`);
      }
      const created = body.data || {};
      console.log(`已上传 R2 并生成版本记录：${created.versionName} (${created.versionCode})`);
      console.log(`  versionId=${created.versionId} wgtUrl=${created.wgtUrl}`);
      console.log(`发布完成。${options.force ? "（强制更新）" : ""}`);
      return;
    }

    // 兜底：管理端账号/令牌登录后分两步「上传 + 建记录」；开启验证码或人机校验后此路径不可用
    console.log("未配置 MEAL_PUBLISH_TOKEN，改用管理端登录的兜底路径（开启验证码/人机校验后会失效）。");
    const token = await resolveToken(apiBase, cfg);
    const form = new FormData();
    form.append("file", new Blob([buffer]), wgtName);
    const upload = await callApi(apiBase, token, "/meal/app/version/upload", {
      method: "POST",
      body: form,
    });
    const uploaded = upload.data || {};
    console.log(`已上传 R2：${uploaded.url}`);

    const created = await callApi(apiBase, token, "/meal/app/version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionName: nextName,
        versionCode: nextCode,
        wgtUrl: uploaded.url,
        wgtSize: uploaded.size,
        fileName: uploaded.fileName || wgtName,
        updateLog,
        forceUpdate: options.force ? "1" : "0",
        status: "0",
      }),
    });
    console.log(`已生成版本记录：${nextName} (${nextCode})${options.force ? " · 强制更新" : ""}`);
    if (created.msg) {
      console.log(created.msg);
    }
    console.log("发布完成。");
  } catch (error) {
    restoreVersions(snapshots);
    throw error;
  }
}

main().catch((error) => {
  console.error(`发布失败：${error.message}`);
  process.exitCode = 1;
});
