package com.tuanphong.mediaplayer;

import android.app.Application;

/** Khi app sập: đưa các widget về trạng thái chưa mở bài nào ngay lúc đó (nếu kịp), rồi để hệ thống xử lý lỗi như thường. */
public class App extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                String msg = (e == null) ? "Unknown exception" : (e.getClass().getSimpleName() + (e.getMessage() != null ? ": " + e.getMessage() : ""));
                MainActivity.recordCrashSync(App.this, "APP_UNCAUGHT_EXCEPTION", msg);
                MediaWidgetProvider.resetToIdle(App.this);
                MediaWidgetProvider.resetWidgetColors(App.this);
                if (MainActivity.instance != null) {
                    MainActivity.instance.destroyWebViewForSelfDestruct();
                }
            } catch (Throwable ignored) {}
            if (prev != null) prev.uncaughtException(t, e);
        });
    }
}
