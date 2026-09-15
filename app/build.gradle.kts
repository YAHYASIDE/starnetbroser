import java.time.Instant
import java.time.format.DateTimeFormatter

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Shown in-app (see AccountListScreen's footer) so whoever is testing a
// build can confirm they're actually looking at the version they expect,
// not a stale install. CI passes the real commit via -PgitCommit=<sha> (see
// .github/workflows/staging.yml); a local `./gradlew` build falls back to
// reading it from git directly, or "local" if that also fails (e.g. no git
// available in a stripped-down build environment).
val gitCommit: String = (project.findProperty("gitCommit") as String?)
    ?: runCatching {
        providers.exec { commandLine("git", "rev-parse", "--short=10", "HEAD") }
            .standardOutput.asText.get().trim()
    }.getOrDefault("local")
val buildTimestamp: String = DateTimeFormatter.ISO_INSTANT.format(Instant.now())

android {
    namespace = "com.starnet.browser"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.starnet.browser"
        minSdk = 26
        targetSdk = 35
        versionCode = 6
        versionName = "0.5.0"

        buildConfigField("String", "GIT_COMMIT", "\"$gitCommit\"")
        buildConfigField("String", "BUILD_TIMESTAMP", "\"$buildTimestamp\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
