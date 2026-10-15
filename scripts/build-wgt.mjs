#!/usr/bin/env node
/**
 * CI 用 wgt 打包脚本（不依赖 HBuilderX）
 *
 * wgt 就是 `uni build -p app` 产物（dist/build/app）打的 zip 改后缀：HBuilderX 的
 * 「制作应用 wgt 包」也只做「build + zip」两步，没有私有加工。CI 跑在 Linux 上，
 * 无法运行 HBuilderX，因此这里直接对构建产物打包。
 *
 * 与 HBuilderX 产物对齐的三处处理：
 *   1. 写入目录条目（zip 内以 / 结尾的条目）——原生安装器靠它创建父目录，缺了会安装失败；
 *   2. 从 manifest.json 剔除 plus.distribute 与 permissions.Push——这两段是原生打包
 *      （apk/ipa）才需要的配置，wgt 热更新不携带原生能力；
 *   3. 文件名取 manifest 的 id（如 __UNI__091B4F4.wgt）。
 *
 * 用法：
 *   node scripts/build-wgt.mjs [--version-name 1.0.7] [--version-code 110]
 *                              [--input dist/build/app] [--output dist/release/wgt]
 *
 * 不传版本号时沿用产物 manifest 里的版本号（本地手动打包场景）。
 * 输出路径打到 stdout，供 CI 后续步骤使用。
 */
import AdmZip from "adm-zip";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

/** 解析命令行参数 */
function parseArgs(argv) {
  const options = {
    input: path.join(projectRoot, "dist", "build", "app"),
    output: path.join(projectRoot, "dist", "release", "wgt"),
    versionName: "",
    versionCode: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      options.input = path.resolve(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--output") {
      options.output = path.resolve(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--version-name") {
      options.versionName = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--version-code") {
      options.versionCode = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return options;
}

/** 递归收集目录下的文件与子目录（相对路径用 / 分隔） */
function collectEntries(root) {
  const files = [];
  const dirs = [];
  const walk = (dir, base) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        // 先记目录条目，再递归，保证父目录排在子项之前
        dirs.push(`${rel}/`);
        walk(full, rel);
      } else {
        files.push({ name: rel, full });
      }
    }
  };
  walk(root, "");
  return { files, dirs };
}

/**
 * 处理 wgt 内的 manifest.json
 *
 * 剔除 plus.distribute 与 permissions.Push（原生打包配置），并在传入版本号时覆盖
 * version.name / version.code——CI 自动递增的版本号只写进包内，不改仓库源码。
 */
function buildManifest(rawManifest, versionName, versionCode) {
  const manifest = JSON.parse(rawManifest);
  if (manifest.plus && typeof manifest.plus === "object") {
    delete manifest.plus.distribute;
  }
  if (manifest.permissions && typeof manifest.permissions === "object") {
    delete manifest.permissions.Push;
  }
  if (versionName || versionCode) {
    manifest.version = manifest.version || {};
    if (versionName) {
      manifest.version.name = versionName;
    }
    if (versionCode) {
      manifest.version.code = Number(versionCode);
    }
  }
  return JSON.stringify(manifest);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    return;
  }

  if (!existsSync(options.input)) {
    throw new Error(`找不到构建产物目录：${options.input}（请先执行 npm run build:app）`);
  }

  const manifestPath = path.join(options.input, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`构建产物缺少 manifest.json：${manifestPath}`);
  }
  const rawManifest = readFileSync(manifestPath, "utf8");
  const appid = (rawManifest.match(/"id"\s*:\s*"([^"]*)"/) || [])[1];
  if (!appid) {
    throw new Error("无法从构建产物 manifest.json 读取应用 id（appid）");
  }

  const { files, dirs } = collectEntries(options.input);
  if (files.length === 0) {
    throw new Error(`构建产物目录为空：${options.input}`);
  }

  const zip = new AdmZip();
  // 目录条目必须写入：原生安装器靠它创建父目录，只有文件条目会导致安装失败
  for (const dir of dirs) {
    zip.addFile(dir, Buffer.alloc(0));
  }
  for (const file of files) {
    if (file.name === "manifest.json") {
      // manifest 需二次加工，稍后统一写入
      continue;
    }
    zip.addFile(file.name, readFileSync(file.full));
  }
  zip.addFile("manifest.json", Buffer.from(buildManifest(rawManifest, options.versionName, options.versionCode), "utf8"));

  mkdirSync(options.output, { recursive: true });
  const wgtPath = path.join(options.output, `${appid}.wgt`);
  if (existsSync(wgtPath)) {
    rmSync(wgtPath);
  }
  zip.writeZip(wgtPath);

  const size = statSync(wgtPath).size;
  console.log(`wgt 产物：${wgtPath}（${(size / 1024 / 1024).toFixed(2)} MB，${files.length} 个文件 + ${dirs.length} 个目录）`);
  // 供 CI 读取产物路径
  console.log(`WGT_PATH=${wgtPath}`);
}

main();
