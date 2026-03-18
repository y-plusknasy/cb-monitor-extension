/**
 * Expo Config Plugin: Gradle ビルド設定を調整する
 *
 * 1. Gradle 9.0 で JvmVendorSpec.IBM_SEMERU が削除された問題の
 *    ワークアラウンドとして Gradle バージョンを固定する。
 * 2. DevContainer 等メモリ制約がある環境での OOM クラッシュを
 *    防ぐため gradle.properties の JVM ヒープサイズを調整する。
 */
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withGradleVersion(config, gradleVersion) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;

      // Gradle バージョンを固定
      const wrapperPropsPath = path.join(
        projectRoot,
        "gradle",
        "wrapper",
        "gradle-wrapper.properties",
      );

      if (fs.existsSync(wrapperPropsPath)) {
        let content = fs.readFileSync(wrapperPropsPath, "utf-8");
        content = content.replace(
          /distributionUrl=.*/,
          `distributionUrl=https\\://services.gradle.org/distributions/gradle-${gradleVersion}-bin.zip`,
        );
        fs.writeFileSync(wrapperPropsPath, content);
      }

      // JVM ヒープサイズを調整（OOM 対策）
      const gradlePropsPath = path.join(projectRoot, "gradle.properties");
      let gradleProps = "";
      if (fs.existsSync(gradlePropsPath)) {
        gradleProps = fs.readFileSync(gradlePropsPath, "utf-8");
      }
      if (!gradleProps.includes("org.gradle.jvmargs")) {
        gradleProps +=
          "\norg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m\n";
      } else {
        gradleProps = gradleProps.replace(
          /org\.gradle\.jvmargs=.*/,
          "org.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m",
        );
      }
      fs.writeFileSync(gradlePropsPath, gradleProps);

      return config;
    },
  ]);
}

module.exports = withGradleVersion;
