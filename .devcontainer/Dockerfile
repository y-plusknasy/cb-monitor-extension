# DevContainer for cb-monitor-extension
# Node.js 20 + Firebase CLI + Java (for Firebase Emulators)
FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Java 21 は Firebase Emulator (Firestore, Auth 等) の実行に必要
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openjdk-21-jre-headless \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Firebase CLI をグローバルインストール
RUN npm install -g firebase-tools
