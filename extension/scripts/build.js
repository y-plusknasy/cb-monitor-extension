#!/usr/bin/env node

/**
 * Extension ビルドスクリプト
 *
 * Chrome Web Store 用 zip ファイルを生成する。
 * - DEV ONLY セクションを HTML / JS から除去
 * - manifest.json から localhost の host_permissions を除去
 * - dist/ に出力し zip 圧縮
 *
 * Usage: node scripts/build.js
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  existsSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const PROJECT_ROOT = join(ROOT, "..");
const DIST = join(PROJECT_ROOT, "build", "extension");

/**
 * DEV ONLY マーカーで囲まれたセクションを除去する
 * @param {string} content - ファイル内容
 * @param {string} startPattern - 開始マーカーの正規表現文字列
 * @param {string} endPattern - 終了マーカーの正規表現文字列
 * @returns {string}
 */
function stripDevOnly(content, startPattern, endPattern) {
  const regex = new RegExp(
    `[ \\t]*${startPattern}[\\s\\S]*?${endPattern}[^\\n]*\\n?`,
    "g",
  );
  return content.replace(regex, "");
}

/**
 * options.html から DEV ONLY セクション（HTML コメントマーカー）を除去
 */
function processOptionsHtml(filePath) {
  let content = readFileSync(filePath, "utf-8");
  content = stripDevOnly(
    content,
    "<!--\\s*=+\\s*DEV ONLY[^>]*START\\s*=+\\s*-->",
    "<!--\\s*=+\\s*DEV ONLY[^>]*END\\s*=+\\s*-->",
  );
  writeFileSync(filePath, content, "utf-8");
}

/**
 * options.js から DEV ONLY セクション（JS コメントマーカー）を除去
 */
function processOptionsJs(filePath) {
  let content = readFileSync(filePath, "utf-8");
  content = stripDevOnly(
    content,
    "\\/\\/\\s*=+\\s*DEV ONLY[^\\n]*START\\s*=+",
    "\\/\\/\\s*=+\\s*DEV ONLY[^\\n]*END\\s*=+",
  );
  writeFileSync(filePath, content, "utf-8");
}

/**
 * manifest.json から localhost の host_permissions を除去
 */
function processManifest(filePath) {
  const manifest = JSON.parse(readFileSync(filePath, "utf-8"));

  if (manifest.host_permissions) {
    manifest.host_permissions = manifest.host_permissions.filter(
      (p) => !p.includes("localhost"),
    );
    if (manifest.host_permissions.length === 0) {
      delete manifest.host_permissions;
    }
  }

  writeFileSync(filePath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------

console.log("[build] Chrome Web Store 用パッケージを作成します...");

// 1. dist/ を初期化
if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true });
}
mkdirSync(DIST, { recursive: true });

// 2. ソースをコピー（node_modules, scripts, dist, テストファイル を除外）
const EXCLUDE = [
  "node_modules",
  "scripts",
  "dist",
  "package.json",
  "package-lock.json",
  "vitest.config.js",
];
cpSync(ROOT, DIST, {
  recursive: true,
  filter: (src) => {
    const relPath = src.replace(ROOT, "").replace(/^\//, "");
    if (!relPath) return true; // root itself
    const topLevel = relPath.split("/")[0];
    if (EXCLUDE.includes(topLevel)) return false;
    // Exclude test files
    if (relPath.endsWith(".test.js")) return false;
    return true;
  },
});

// 3. DEV ONLY セクションを除去
processOptionsHtml(join(DIST, "options", "options.html"));
processOptionsJs(join(DIST, "options", "options.js"));

// 4. manifest.json の本番調整
processManifest(join(DIST, "manifest.json"));

// 5. バージョン番号を取得して zip 作成
const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf-8"));
const version = manifest.version || "0.0.0";
const zipName = `cb-link-extension-v${version}.zip`;
const zipPath = join(PROJECT_ROOT, "build", zipName);

// 既存の zip を削除
if (existsSync(zipPath)) {
  rmSync(zipPath);
}

execSync(`cd "${DIST}" && zip -r "${zipPath}" . -x '*.DS_Store'`, {
  stdio: "inherit",
});

console.log(`[build] ✓ ${zipName} を作成しました`);
