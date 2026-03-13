# S03 モバイルアプリ データフロー図

## ホーム画面のデータフロー

```mermaid
flowchart TD
    subgraph "Chrome Extension"
        EXT[Extension Service Worker]
    end

    subgraph "Firebase"
        CF[Cloud Functions<br/>usageLogs endpoint]
        FS_UL[(Firestore<br/>usageLogs)]
        FS_USERS[(Firestore<br/>users)]
        FS_DEVICES[(Firestore<br/>devices)]
    end

    subgraph "Mobile App - ホーム画面"
        AUTH[useAuth]
        UL[useUsageLogs<br/>onSnapshot: today]
        UH[useUsageHistory<br/>onSnapshot: 7days×page]
        DEV[useDevices<br/>onSnapshot: users + devices]

        SUMMARY[UsageSummaryCard<br/>合計利用時間]
        CHART[UsageHistoryChart<br/>7日間バーチャート]
        SECTIONS[SectionList<br/>デバイス別→アプリ別内訳]
        ROW[AppUsageRow<br/>displayName / iconUrl]
    end

    EXT -->|POST /usageLogs| CF
    CF -->|upsert| FS_UL

    AUTH -->|parentId| UL
    AUTH -->|parentId| UH
    AUTH -->|uid| DEV

    FS_UL -->|onSnapshot<br/>date == today| UL
    FS_UL -->|onSnapshot<br/>date range| UH
    FS_USERS -->|onSnapshot<br/>childDevices| DEV
    FS_DEVICES -->|onSnapshot<br/>syncAvailable, lastSeenAt| DEV

    UL -->|totalSeconds| SUMMARY
    UL -->|logs, deviceTotals| SECTIONS
    UH -->|dailySummaries| CHART
    DEV -->|deviceNameMap| SECTIONS
    DEV -->|deviceNameMap| CHART
    SECTIONS --> ROW
```

## デバイス管理画面のデータフロー

```mermaid
flowchart TD
    subgraph "Firebase"
        CF_OTP[Cloud Functions<br/>generateOtp]
        FS_USERS[(Firestore<br/>users)]
        FS_DEVICES[(Firestore<br/>devices)]
    end

    subgraph MobileApp["Mobile App - デバイス画面"]
        AUTH[useAuth]
        DEV[useDevices<br/>onSnapshot]

        CARD[DeviceCard<br/>deviceName / registeredAt<br/>syncAvailable / lastSeenAt]
        OTP_BTN[OTP発行ボタン]
        OTP_DISP[OtpDisplay<br/>6桁コード + タイマー]
    end

    AUTH -->|uid| DEV
    FS_USERS -.->|onSnapshot<br/>childDevices| DEV
    FS_DEVICES -.->|onSnapshot<br/>syncAvailable, lastSeenAt| DEV
    DEV -->|"DeviceInfo[]"| CARD

    AUTH -->|idToken| OTP_BTN
    OTP_BTN -->|POST /generateOtp| CF_OTP
    CF_OTP -->|otp, expiresIn| OTP_DISP
```

## コンポーネント階層

```mermaid
graph TD
    ROOT["_layout.tsx<br/>(Root Layout + Auth Guard)"]

    ROOT --> AUTH_LAYOUT["(auth)/_layout.tsx"]
    AUTH_LAYOUT --> LOGIN["login.tsx"]

    ROOT --> TABS_LAYOUT["(tabs)/_layout.tsx<br/>(Tab Navigator)"]
    TABS_LAYOUT --> HOME["index.tsx<br/>(ホーム)"]
    TABS_LAYOUT --> DEVICES["devices.tsx<br/>(デバイス管理)"]
    TABS_LAYOUT --> SETTINGS["settings.tsx<br/>(設定)"]

    HOME --> SUMMARY_CARD[UsageSummaryCard]
    HOME --> HISTORY_CHART[UsageHistoryChart]
    HOME --> APP_ROW_H[AppUsageRow]

    HISTORY_CHART --> APP_ROW_C[AppUsageRow<br/>(内訳表示)]

    DEVICES --> DEVICE_CARD[DeviceCard]
    DEVICES --> OTP_DISPLAY[OtpDisplay]

    HOME -.->|hooks| USE_AUTH_H[useAuth]
    HOME -.->|hooks| USE_LOGS[useUsageLogs]
    HOME -.->|hooks| USE_HISTORY[useUsageHistory]
    HOME -.->|hooks| USE_DEVICES_H[useDevices]

    DEVICES -.->|hooks| USE_AUTH_D[useAuth]
    DEVICES -.->|hooks| USE_DEVICES_D[useDevices]
```
