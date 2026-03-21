#!/usr/bin/env node

/**
 * コンポーネントバージョン一括更新スクリプト
 *
 * ルート package.json の componentVersions に定義されたバージョンを、
 * 各ワークスペースの package.json / manifest.json / app.json に反映する。
 *
 * 使い方:
 *   npm run update-version                     # 全コンポーネント更新
 *   npm run update-version -- extension        # extension のみ更新
 *   npm run update-version -- extension functions  # 複数指定
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** コンポーネントごとの更新対象ファイル定義 */
const COMPONENT_FILES = {
  extension: [
    { path: "extension/package.json", key: ["version"] },
    { path: "extension/manifest.json", key: ["version"] },
  ],
  functions: [{ path: "functions/package.json", key: ["version"] }],
  mobile: [
    { path: "mobile/package.json", key: ["version"] },
    { path: "mobile/app.json", key: ["expo", "version"] },
  ],
};

/**
 * JSON ファイルのネストされたキーの値を更新する
 * @param {object} obj - JSON オブジェクト
 * @param {string[]} keyPath - キーパス (例: ["expo", "version"])
 * @param {string} value - 新しい値
 */
function setNestedValue(obj, keyPath, value) {
  let current = obj;
  for (let i = 0; i < keyPath.length - 1; i++) {
    current = current[keyPath[i]];
  }
  current[keyPath[keyPath.length - 1]] = value;
}

/**
 * JSON ファイルを読み込み、指定キーを更新して書き戻す。
 * 既存のインデントとフォーマットを維持するため、
 * JSON.stringify の indent を検出して使用する。
 */
function updateJsonFile(filePath, keyPath, newVersion) {
  const fullPath = resolve(ROOT, filePath);
  const raw = readFileSync(fullPath, "utf-8");
  const obj = JSON.parse(raw);

  // 現在の値を取得
  let current = obj;
  for (const k of keyPath) current = current[k];
  const oldVersion = current;

  if (oldVersion === newVersion) {
    return { filePath, oldVersion, newVersion, changed: false };
  }

  setNestedValue(obj, keyPath, newVersion);

  // インデント検出 (2 or 4 spaces)
  const indent = raw.match(/^(\s+)"/m)?.[1]?.length || 2;
  const newRaw = JSON.stringify(obj, null, indent) + "\n";
  writeFileSync(fullPath, newRaw, "utf-8");

  return { filePath, oldVersion, newVersion, changed: true };
}

// --- main ---
const rootPkg = JSON.parse(
  readFileSync(resolve(ROOT, "package.json"), "utf-8"),
);
const versions = rootPkg.componentVersions;

if (!versions) {
  console.error(
    'エラー: ルート package.json に "componentVersions" が見つかりません',
  );
  process.exit(1);
}

// CLI 引数でコンポーネントを絞り込み
const args = process.argv.slice(2);
const targets =
  args.length > 0
    ? args.filter((a) => {
        if (!COMPONENT_FILES[a]) {
          console.error(`エラー: 不明なコンポーネント "${a}"`);
          console.error(
            `  有効なコンポーネント: ${Object.keys(COMPONENT_FILES).join(", ")}`,
          );
          process.exit(1);
        }
        return true;
      })
    : Object.keys(COMPONENT_FILES);

let anyChanged = false;

for (const component of targets) {
  const version = versions[component];
  if (!version) {
    console.warn(
      `警告: componentVersions に "${component}" が未定義。スキップ`,
    );
    continue;
  }

  const files = COMPONENT_FILES[component];
  for (const { path, key } of files) {
    const result = updateJsonFile(path, key, version);
    if (result.changed) {
      console.log(
        `  ✓ ${result.filePath}: ${result.oldVersion} → ${result.newVersion}`,
      );
      anyChanged = true;
    } else {
      console.log(`  – ${result.filePath}: ${result.newVersion} (変更なし)`);
    }
  }
}

if (anyChanged) {
  console.log("\nバージョン更新完了。git add & commit してください。");
} else {
  console.log("\nすべて最新です。変更はありません。");
}
