import AdmZip from "adm-zip";
import { readFileSync } from "node:fs";

const wgt = process.argv[2] || "dist/release/wgt/__UNI__091B4F4.wgt";
const z = new AdmZip(wgt);
const m = JSON.parse(z.readAsText("manifest.json"));
const entries = z.getEntries();
const names = entries.map((e) => e.entryName);
const dirs = entries.filter((e) => e.isDirectory);
const files = entries.filter((e) => !e.isDirectory);

/**
 * 校验每个文件的父目录条目都排在它之前
 *
 * 原生安装器靠目录条目创建父目录；父目录条目必须出现在其内容之前，否则解压时
 * 父目录还不存在，安装会失败。
 */
function parentsBeforeChildren() {
  const index = new Map(names.map((n, i) => [n, i]));
  for (const e of files) {
    const parts = e.entryName.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      const parent = `${parts.slice(0, i).join("/")}/`;
      const pi = index.get(parent);
      if (pi === undefined || pi > index.get(e.entryName)) {
        return false;
      }
    }
  }
  return true;
}

const checks = [
  ["文件名与 appid 一致", wgt.endsWith(`${m.id}.wgt`)],
  ["manifest.json 在根目录", names.includes("manifest.json")],
  ["无外层目录", !names.some((n) => n.startsWith("app/") || n.startsWith("dist/"))],
  ["无 ./ 前缀", !names.some((n) => n.startsWith("./"))],
  ["无反斜杠", !names.some((n) => n.includes("\\"))],
  ["目录条目数 > 0", dirs.length > 0],
  ["目录条目以 / 结尾", dirs.every((e) => e.entryName.endsWith("/"))],
  ["目录条目均为 0 字节", dirs.every((e) => e.header.size === 0)],
  ["父目录条目先于其内容", parentsBeforeChildren()],
  ["plus.distribute 已剔除", !("distribute" in (m.plus || {}))],
  ["permissions.Push 已剔除", !("Push" in (m.permissions || {}))],
  ["id 为 __UNI__091B4F4", m.id === "__UNI__091B4F4"],
  ["文件条目数 > 70", files.length > 70],
];

console.log("=== wgt 产物校验 ===");
console.log("路径:", wgt);
console.log("version:", JSON.stringify(m.version));
console.log("目录条目:", dirs.length, "| 文件条目:", files.length);
console.log();
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "[OK]  " : "[FAIL]"} ${name}`);
  if (!pass) ok = false;
}
console.log();
console.log(ok ? "全部通过" : "存在失败项");
process.exitCode = ok ? 0 : 1;
