# Chrome拡張機能のCORSエラー

## ローカル環境で Firebase エミュレーターを使用しての拡張機能テスト時のエラー

### 拡張機能開発者ツールのコンソールのエラー出力

```
[WebUsageTracker] 計測開始: chrome
service-worker.js:192 [WebUsageTracker] 計測停止: chrome (23秒)
Access to fetch at 'http://localhost:5001/cb-monitor-extension/us-central1/usageLogs' from origin 'chrome-extension://aemegegicmhdidcfmfgpbcepicogjdig' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.
api.js:37 [WebUsageTracker] ネットワークエラー: TypeError: Failed to fetch
    at sendUsageLogs (api.js:20:30)
    at flushUsageData (service-worker.js:240:27)
    at async handleWindowFocusChanged (service-worker.js:292:5)
sendUsageLogs	@	api.js:37
await in sendUsageLogs
flushUsageData	@	service-worker.js:240
await in flushUsageData
handleWindowFocusChanged	@	service-worker.js:292
service-worker.js:250 [WebUsageTracker] 2026-03-01 のログ送信失敗。次回リトライ
flushUsageData	@	service-worker.js:250
await in flushUsageData
handleWindowFocusChanged	@	service-worker.js:292
```

### Firebase エミュレータ

- 問題なく起動しており、`localhost:4000/firestore/default/data` でアクセス可能
- 拡張機能側からの API 接続に失敗しているため、データベースの更新はない

### extensions/options

- Web Usage Tracker ポップアップは問題なく表示される
- Chrome ブラウザ起動中、観測対象は chrome と表示される
- デバイスIDは新規に作成、登録されている
- 本日の合計は更新されているため、`chrome.storage.local` への問題なく保存ができている

### 拡張機能開発者ツールの Application/Extension storage/Local の保存状況

```
apiEndpoint	http://localhost:5001/cb-monitor-extension/us-central1/usageLogs
dailyUsage	{"2026-03-01":{"chrome":{"lastUpdated":"2026-03-01T07:35:52.598Z","totalSeconds":221}}}
deviceId	370a9ad8-988f-4cc4-b997-0a3c90ebfc20
sentDates	[]
trackingSession	null
{2026-03-01: {chrome: {lastUpdated: "2026-03-01T07:35:52.598Z", totalSeconds: 221}}}
2026-03-01
:
{chrome: {lastUpdated: "2026-03-01T07:35:52.598Z", totalSeconds: 221}}
```
