plugins { id("com.android.application") }

run {
    val sdkDir = System.getenv("ANDROID_HOME")
        ?: System.getenv("ANDROID_SDK_ROOT")
        ?: rootProject.file("local.properties").takeIf { it.exists() }?.readLines()
            ?.firstOrNull { it.startsWith("sdk.dir=") }?.substringAfter("=")?.trim()
    if (!sdkDir.isNullOrBlank()) {
        val platformJar = file("$sdkDir/platforms/android-37/android.jar")
        if (!platformJar.exists()) {
            val isWin = System.getProperty("os.name").lowercase().contains("win")
            val exe = if (isWin) "sdkmanager.bat" else "sdkmanager"
            val candidates = mutableListOf(
                file("$sdkDir/cmdline-tools/latest/bin/$exe"),
                file("$sdkDir/tools/bin/$exe")
            )
            file("$sdkDir/cmdline-tools").listFiles()?.forEach { dir ->
                candidates.add(file("${dir.absolutePath}/bin/$exe"))
            }
            val sdkManager = candidates.firstOrNull { it.isFile }
            if (sdkManager != null) {
                println("Installing missing Android Platform SDK 37 via ${sdkManager.absolutePath}...")
                try {
                    val licProc = ProcessBuilder(sdkManager.absolutePath, "--licenses")
                        .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                        .redirectError(ProcessBuilder.Redirect.DISCARD)
                        .start()
                    licProc.outputStream.bufferedWriter().use { w ->
                        repeat(100) { w.write("y\n") }
                    }
                    licProc.waitFor()
                } catch (_: Throwable) {}
                val instProc = ProcessBuilder(sdkManager.absolutePath, "platforms;android-37")
                    .inheritIO()
                    .start()
                val exit = instProc.waitFor()
                println("sdkmanager platforms;android-37 exited with code $exit")
            } else {
                println("Warning: sdkmanager not found under $sdkDir; cannot auto-install platforms;android-37")
            }
        }
    }
}

android {
    namespace = "com.tuanphong.mediaplayer"
    compileSdk = 37
    defaultConfig {
        applicationId = "com.tuanphong.mediaplayer"
        minSdk = 24
        targetSdk = 37
        versionCode = (System.getenv("VERSION_CODE") ?: "10").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "1.0.10"
    }
    signingConfigs {
        create("rel") {
            storeFile = file("release.jks"); storePassword = "mediaplayer"
            keyAlias = "mp"; keyPassword = "mediaplayer"
        }
    }
    buildTypes {
        release { signingConfig = signingConfigs.getByName("rel"); isMinifyEnabled = false }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
dependencies { implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.core:core:1.13.1")
    implementation("androidx.media3:media3-exoplayer:1.4.1") }
