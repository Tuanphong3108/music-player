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
                println("Installing missing Android Platform SDK 37 via ${sdkManager.absolutePath} (sdkDir=$sdkDir, writable=${file(sdkDir).canWrite()})...")
                fun runSdk(printOut: Boolean, vararg args: String): Pair<Int, String> {
                    val cmd = listOf(sdkManager.absolutePath) + args.toList()
                    val proc = ProcessBuilder(cmd).redirectErrorStream(true).start()
                    val writer = Thread {
                        try {
                            proc.outputStream.bufferedWriter().use { w ->
                                repeat(100) { w.write("y\n") }
                                w.flush()
                            }
                        } catch (_: Throwable) {}
                    }
                    writer.isDaemon = true
                    writer.start()
                    val out = proc.inputStream.bufferedReader().readText()
                    val code = proc.waitFor()
                    if (printOut && out.isNotBlank()) println(out.takeLast(4000))
                    return code to out
                }
                runSdk(false, "--sdk_root=$sdkDir", "--licenses")
                var (exit, _) = runSdk(true, "--sdk_root=$sdkDir", "platforms;android-37")
                println("sdkmanager platforms;android-37 exited with code $exit")
                if (exit != 0 || !platformJar.exists()) {
                    val (exit3, _) = runSdk(true, "--sdk_root=$sdkDir", "--channel=3", "platforms;android-37")
                    println("sdkmanager --channel=3 platforms;android-37 exited with code $exit3")
                }
                if (!platformJar.exists()) {
                    val (_, listOut) = runSdk(false, "--sdk_root=$sdkDir", "--list")
                    val avail = listOut.lines().filter { it.contains("platforms;android-3") }.take(20)
                    println("Available android-3x platforms:\n" + avail.joinToString("\n"))
                }
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
