# ADR-013: Chromium 範囲外フォーカス移動の計測制約

> **ステータス**: Accepted  
> **作成日**: 2026-03-21  
> **決定者**: Owner + AI

---

## 背景 (Context)

CB Link 拡張機能は Chrome ブラウザおよび PWA の利用時間を計測している。計測の開始・停止は Chrome Extension API が提供するイベント（`windows.onFocusChanged`, `tabs.onActivated`, `idle.onStateChanged` 等）に依存している。

### 課題

ユーザーが Chrome/PWA から OS ネイティブアプリケーション（Finder, VS Code, ターミナル等）にフォーカスを移した場合、Chrome Extension API ではこの遷移を検出できないケースがある。

- **macOS**: `windows.onFocusChanged` で `WINDOW_ID_NONE` が**発火しない**場合がある。Chrome 側はフォーカスを「失っていない」と認識している。
- **ChromeOS**: Chromebook 上では Chrome がほぼ全画面のホスト環境であるため、この問題が発生する頻度は相対的に低い。ただし Android アプリ等の別ウィンドウに切り替えた場合は同様の問題が起こり得る。
- idle 状態にも即座にはならないため、ユーザーが別アプリで操作を続けている間、最後に Chrome でフォーカスしていたドメインの計測が走り続ける。

### 技術的制約

Chrome Extension (Manifest V3) の Service Worker は Chrome プロセス内で動作しており、OS レベルのウィンドウフォーカスイベントにアクセスする手段がない。

- `chrome.windows.onFocusChanged` — Chrome 管理下のウィンドウ間の遷移は検出可能だが、Chrome 外へのフォーカス移動は OS・プラットフォームに依存
- `chrome.idle.onStateChanged` — ユーザー（キーボード・マウス含む全入力デバイス）が OS レベルで無操作の場合のみ発火。別アプリで操作を続けている場合は「active」のままであり、idle にならない
- Native Messaging — OS ネイティブプロセスとの連携で原理的には検出可能だが、以下の理由で却下:
  - Chromebook（対象端末）では Native Messaging ホストの配布が困難
  - 子供のデバイスにネイティブバイナリをインストールさせる運用の複雑さ
  - メンテナンスコスト対効果が見合わない

---

## 決定 (Decision)

**この制約を「既知の制約」として受容し、現時点では対策を講じない。**

### 理由

1. **主要ターゲットは Chromebook**: CB Link の主な利用環境は子供の Chromebook であり、ChromeOS 上では Chrome がプライマリ環境のため、Chromium 外フォーカスの問題発生頻度は低い。
2. **idle による間接的な緩和**: 別アプリに移動後しばらく Chrome を操作しなければ、`idle.onStateChanged` が最終的に発火し、`IDLE_TOLERANCE_MS`（5分）を超過した分はアイドル時間として除外される。これにより、長時間の過大計上は自然に抑制される。
3. **過大計上の影響度**: 仮に数分〜数十分の過大計上が発生しても、保護者がリアルタイムで監視する用途では「概算としておおむね正しい」ことが重要であり、秒単位の精度は要件ではない。
4. **対策のコスト対効果**: Native Messaging ベースの解決策は、開発・配布・保守のコストが高く、Chromebook 環境での運用ハードルも高い。

### 将来的な改善余地

- **ChromeOS 固有 API**: 将来 Chrome が OS レベルのフォーカス情報を Extension に提供する API を実装する可能性がある。その際は活用を検討する。
- **定期的な `chrome.windows.getAll` ポーリング**: 1分間隔のアラーム時にフォーカスウィンドウの存在を確認し、`focused: true` のウィンドウがなければ計測を停止する、というヒューリスティクスを追加できる可能性がある。ただし Chrome が自身のウィンドウを focused と報告するかは OS 依存であり、効果は不確実。

---

## 影響 (Consequences)

### ポジティブ

- 実装の複雑さを回避し、Chrome Extension のみで完結するシンプルなアーキテクチャを維持
- Chromebook（主要対象）での計測精度は実用上問題のない水準

### ネガティブ

- macOS / Windows で Chrome と他アプリを頻繁に切り替えるユーザーの場合、Chrome の利用時間が実際より多く計上される可能性がある
- フォーカスが外れた状態でも idle 閾値未満であれば計測が継続する
