plugins { id("com.android.application") }
android {
    namespace = "com.tuanphong.mediaplayer"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.tuanphong.mediaplayer"
        minSdk = 24
        targetSdk = 36
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

val copyMusicNoteRes by tasks.registering(Copy::class) {
    from(rootProject.file("../music_note.png"))
    into(layout.projectDirectory.dir("src/main/res/drawable-nodpi"))
    rename { "ic_music_note.png" }
}
tasks.named("preBuild") { dependsOn(copyMusicNoteRes) }

