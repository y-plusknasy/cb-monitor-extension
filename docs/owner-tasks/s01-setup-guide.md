# S01: オーナー作業タスク一覧

> **スプリント**: S01 — コアトラッキングパイプライン  
> **対象**: プロジェクトオーナー（保護者）

S01 の開発・動作確認にあたり、オーナーが実施する必要のあるタスク一覧です。

---

## タスク一覧

| #   | タスク                                      | 必須/任意 | 所要時間 | 状態   |
| --- | ------------------------------------------- | --------- | -------- | ------ |
| 1   | Firebase プロジェクトの作成                 | 必須      | 5分      | 未着手 |
| 2   | Firestore データベースの有効化              | 必須      | 2分      | 未着手 |
| 3   | `.firebaserc` にプロジェクトIDを設定        | 必須      | 1分      | 未着手 |
| 4   | Chrome Extension のインストール（テスト用） | 任意      | 3分      | 未着手 |

> **注**: S01 はローカル開発（Emulator）のみで完結するため、Firebase の本番環境デプロイは不要です。ただし、後続スプリントのためにプロジェクト作成を先に済ませておくことを推奨します。

---

## タスク 1: Firebase プロジェクトの作成

### 手順

1. [Firebase Console](https://console.firebase.google.com/) にアクセスし、Google アカウントでログイン
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（`cb-monitor-extension`）
   - プロジェクト ID が自動生成される（`cb-monitor-extension`）
   - このプロジェクト ID は後で使用するので控えておく
4. Google Analytics の設定
   - S01 では不要。「このプロジェクトで Google Analytics を有効にする」を **オフ** にして続行
5. 「プロジェクトを作成」をクリック

### 確認方法

- Firebase Console にプロジェクトが表示されること

---

## タスク 2: Firestore データベースの有効化

### 手順

1. Firebase Console で作成したプロジェクトを開く
2. 左メニューの「構築」→「Firestore Database」をクリック
3. 「データベースを作成」をクリック
4. ロケーションを選択（推奨: `asia-northeast1` = 東京）
5. セキュリティルール:
   - **「テストモードで開始」** を選択（S01 開発用。S04 で本番ルールに変更予定）
6. 「作成」をクリック

### 確認方法

- Firestore のデータタブが表示され、空のデータベースが確認できること

---

## タスク 3: `.firebaserc` にプロジェクトIDを設定

### 手順

DevContainer 内で以下のコマンドを実行する:

```bash
# 方法A: firebase CLI でログイン → プロジェクト紐付け
firebase login
firebase use --add
# プロジェクト一覧から作成済みプロジェクトを選択
# エイリアスは "default" を入力

# 方法B: 手動で .firebaserc を編集
# .firebaserc を以下のように編集する:
```

```json
{
  "projects": {
    "default": "your-project-id-here"
  }
}
```

`your-project-id-here` をタスク1で控えたプロジェクトIDに置き換える。

### 確認方法

```bash
firebase projects:list
# 作成したプロジェクトが一覧に表示されること
```

> **注**: S01 ではローカル Emulator のみ使用するため、この設定は必須ではありません。ただし、`firebase emulators:start` 時に `--project demo-cb-monitor` のようにデモプロジェクトIDを指定すれば、Firebase プロジェクトなしでも Emulator を利用できます。

---

## タスク 4: Chrome Extension のインストール（テスト用）

### 前提

- Chrome ブラウザがインストール済みであること
- DevContainer で Firebase Emulator が起動中であること

### 手順

1. Chrome ブラウザで `chrome://extensions/` を開く
2. 右上の **「デベロッパーモード」** をオンにする
3. **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. リポジトリ内の `extension/` フォルダを選択
5. 拡張機能が一覧に表示される（「Web Usage Tracker」）

### API エンドポイントの設定

1. 拡張機能の **「詳細」** → **「拡張機能のオプション」** をクリック
2. API エンドポイントに以下を入力:
   ```
   http://localhost:5001/demo-cb-monitor/us-central1/usageLogs
   ```
   > `demo-cb-monitor` の部分は、タスク3で設定したプロジェクトID（またはデモプロジェクトID）に合わせる
3. 「保存」をクリック

### 動作確認

1. DevContainer 内で Emulator を起動:
   ```bash
   cd /workspaces/cb-monitor-extension
   firebase emulators:start --only functions,firestore --project demo-cb-monitor
   ```
2. Chrome ブラウザで適当なページを開き、60秒以上待つ
3. Emulator UI (`http://localhost:4000/firestore`) で `usageLogs` コレクションにドキュメントが追加されていることを確認
4. 拡張機能のポップアップ（ツールバーアイコンをクリック）で:
   - 「計測対象: chrome」と表示
   - 「デバイスID: xxxxxxxx...」と表示
