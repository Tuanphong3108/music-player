package com.tuanphong.mediaplayer;

import android.app.Application;

/** Khi app sập: đưa các widget về trạng thái chưa mở bài nào ngay lúc đó (nếu kịp), rồi để hệ thống xử lý lỗi như thường. */
public class App extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try { MediaWidgetProvider.resetToIdle(App.this); } catch (Throwable ignored) {}
            if (prev != null) prev.uncaughtException(t, e);
        });
    }
}
