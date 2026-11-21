plugins { id("com.android.application") }
android {
    namespace = "com.tuanphong.mediaplayer"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.tuanphong.mediaplayer"
        minSdk = 24
        targetSdk = 34
        versionCode = (System.getenv("VERSION_CODE") ?: "9").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "1.0.9"
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
    implementation("androidx.core:core:1.13.1") }
