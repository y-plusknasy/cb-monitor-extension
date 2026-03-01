# AppName が Null になる & 拡張機能の計測対象アプリが0の状態でも60秒ごとにアップロードしている問題

## AppName が Null の UsageLog がアップロードされる

### Firebase エミューレーターの storage のデータ

```
appName
"null"
(string)
date
"2026-03-01"
(string)
deviceId
"370a9ad8-988f-4cc4-b997-0a3c90ebfc20"
(string)
expireAt
Tue Mar 31 2026 09:00:00 GMT+0900 (日本標準時)
(timestamp)
lastUpdated
Sun Mar 01 2026 16:50:18 GMT+0900 (日本標準時)
(timestamp)
parentId
"unlinked"
(string)
totalSeconds
16
(number)
updatedAt
Sun Mar 01 2026 16:56:01 GMT+0900 (日本標準時)
(timestamp)
```

### Null があることはむしろ望ましい

- 使用しているアプリまでは特定できていないが、Chromebookの利用時間を監視・集計したいという本来の目的を鑑みると、このデータを捨ててはいけない
- 保護者アプリUI側で、特定できなかったアプリとして「その他」のようなまとめ方をして表示、1日の利用時間の内訳とすることで、本来の目的により忠実なデータになる
- Nullはこのまま収集対象とし、UI表示側で実装を考える（ADRを作成してください）

## 拡張機能の計測対象アプリが0の状態でも60秒ごとにアップロードしている問題

### Chrome ブラウザと PWA の切り分けは正常に行われている

- 試しに Firebase エミュレーターの PWA をインストールしたところ、localhost として AppName が送信されていた

### 前回の送信内容と全く同じ内容を60秒毎にPOSTしている

- 現在の開発環境は Mac の VSCode なので、この文書作成中の今現在は、拡張機能の監視対象は0 = UsageLog は更新されない
- ただし、ServiceWorker が生きている限り、Firebase Function API を叩き続けている。これは、以下の2点で問題
  1. Chromebook の貧弱な性能下では、無駄なペイロードは削減したい（ユーザビリティの向上のため）
  2. Firebase Function API を叩く回数を削減しないと、コストが無駄にかかる
- 60秒毎に API リクエストを行う前に、chrome.storage.local の dailyUsage を前回送信時の内容と比較して、変更がなければ API を叩かないようにしたい
- 毎回 usage を比較するのは実行コストがかかるようであれば、例えば、lastUpdatedを連結した文字列のハッシュ値をetagとして保存しておくのもありだと思っています。そこは適宜考えてください。
- これもADRに加えてください。
