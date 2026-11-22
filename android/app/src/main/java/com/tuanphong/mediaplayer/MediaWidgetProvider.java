package com.tuanphong.mediaplayer;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

import java.io.File;
import java.io.FileOutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MediaWidgetProvider extends AppWidgetProvider {
    /** 3 kiểu widget: tự co giãn 4x2 (mặc định), vuông tối giản 2x2, đầy đủ điều khiển 4x2 (có trộn bài + lặp lại). */
    static final int V_RESPONSIVE = 0, V_SQUARE = 1, V_FULL = 2;
    protected int variant() { return V_RESPONSIVE; }
    static final String PREFS = "media_widget_state";
    static final String ACTION_CMD = "com.tuanphong.mediaplayer.WIDGET_CMD";
    static final String EXTRA_CMD = "cmd";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateSingleWidget(context, appWidgetManager, appWidgetId, variant());
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions);
        updateSingleWidget(context, appWidgetManager, appWidgetId, variant());
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null) return;
        String action = intent.getAction();
        if (ACTION_STALE.equals(action)) { checkStale(context); return; }
        if (ACTION_CMD.equals(action)) {
            String cmd = intent.getStringExtra(EXTRA_CMD);
            if (cmd == null || cmd.isEmpty()) return;
            if (MainActivity.instance != null) {
                MainActivity.instance.sendCmd(cmd);
            } else {
                Intent launch = new Intent(context, MainActivity.class);
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                launch.putExtra("widget_cmd", cmd);
                try {
                    context.startActivity(launch);
                } catch (Throwable ignored) {}
            }
        }
    }

    /** Màu widget đồng bộ với accent đang chọn trong app (do trang gửi sang qua setWidgetColors). */
    static void saveWidgetColors(Context context, int bg, int accent) {
        context.getSharedPreferences("app", Context.MODE_PRIVATE).edit()
                .putInt("widget_bg", 0xFF000000 | bg).putInt("widget_accent", 0xFF000000 | accent).apply();
        updateAllWidgets(context);
        QueueWidgetProvider.updateAllWidgets(context);
        LyricsWidgetProvider.updateAllWidgets(context);
    }

    static int widgetBg(Context context, int fallback) {
        return context.getSharedPreferences("app", Context.MODE_PRIVATE).getInt("widget_bg", fallback);
    }

    static int widgetAccent(Context context, int fallback) {
        return context.getSharedPreferences("app", Context.MODE_PRIVATE).getInt("widget_accent", fallback);
    }

    static boolean hasWidgetColors(Context context) {
        return context.getSharedPreferences("app", Context.MODE_PRIVATE).contains("widget_accent");
    }

    /** Tô màu nút phát theo accent (API 31+) và chọn màu icon dễ đọc trên nền accent. */
    static void tintPlayButton(Context context, RemoteViews views, int viewId) {
        if (!hasWidgetColors(context)) return;
        int accent = widgetAccent(context, 0xFFD0BCFF);
        double lum = (0.299 * ((accent >> 16) & 255) + 0.587 * ((accent >> 8) & 255) + 0.114 * (accent & 255)) / 255.0;
        views.setInt(viewId, "setColorFilter", lum > 0.55 ? 0xFF1C1B1F : 0xFFFFFFFF);
        if (Build.VERSION.SDK_INT >= 31) {
            try { views.setColorStateList(viewId, "setBackgroundTintList", android.content.res.ColorStateList.valueOf(accent)); } catch (Throwable ignored) {}
        }
    }

    /** Khôi phục màu widget & theme gốc về mặc định / hệ thống (xóa màu động từ bài hát cũ). */
    static void resetWidgetColors(Context context) {
        try {
            context.getSharedPreferences("app", Context.MODE_PRIVATE).edit()
                    .remove("widget_bg")
                    .remove("widget_accent")
                    .remove("theme")
                    .commit();
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .remove("theme")
                    .commit();
            context.getSharedPreferences(QueueWidgetProvider.PREFS, Context.MODE_PRIVATE).edit()
                    .remove("theme")
                    .commit();
            context.getSharedPreferences(LyricsWidgetProvider.PREFS, Context.MODE_PRIVATE).edit()
                    .remove("theme")
                    .commit();
            updateAllWidgets(context);
            QueueWidgetProvider.updateAllWidgets(context);
            LyricsWidgetProvider.updateAllWidgets(context);
        } catch (Throwable ignored) {}
    }

    /** Đưa tất cả widget về trạng thái "chưa mở bài nào" (dùng khi app khởi động lại sau khi bị sập/đóng). */
    static void resetToIdle(Context context) {
        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putBoolean("playing", false)
                    .remove("title").remove("artist").remove("lyric")
                    .putLong("pos_ms", 0L).putLong("dur_ms", 0L)
                    .commit();
            File artFile = new File(context.getCacheDir(), "widget_art.png");
            if (artFile.exists()) artFile.delete();
            QueueWidgetProvider.clearQueue(context);
            LyricsWidgetProvider.clearLyrics(context);
            updateAllWidgets(context);
        } catch (Throwable ignored) {}
    }

    static final String ACTION_STALE = "com.tuanphong.mediaplayer.WIDGET_STALE_CHECK";

    /** Đặt báo thức (đánh thức tiến trình app ở nền) để kiểm tra xem app còn báo trạng thái phát không; nếu app đã sập thì reset widget. */
    static void scheduleStaleCheck(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(context, MediaWidgetProvider.class).setAction(ACTION_STALE);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent pi = PendingIntent.getBroadcast(context, 77, i, flags);
            long at = System.currentTimeMillis() + 30000L;
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC, at, pi); else am.set(AlarmManager.RTC, at, pi);
        } catch (Throwable ignored) {}
    }

    static void checkStale(Context context) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!sp.getBoolean("playing", false)) return;
        long age = System.currentTimeMillis() - sp.getLong("last_report_ms", 0L);
        boolean appAlive = MainActivity.instance != null;
        if (age > 120000L || (!appAlive && age > 45000L)) {
            MainActivity.recordCrashSyncIfEmpty(context, "BG_STALE_WATCHDOG",
                    "App stopped responding or was killed in background while playing (stale " + (age / 1000L) + "s)");
            resetToIdle(context);
            resetWidgetColors(context);
        }
        else scheduleStaleCheck(context);
    }

    static void savePlaybackState(Context context, boolean playing, String title, String artist, String lyric, int themeColor) {
        SharedPreferences.Editor ed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        ed.putBoolean("playing", playing);
        ed.putLong("last_report_ms", System.currentTimeMillis());
        if (title != null) ed.putString("title", title);
        if (artist != null) ed.putString("artist", artist);
        if (lyric != null) ed.putString("lyric", lyric);
        if (themeColor != 0) ed.putInt("theme", themeColor);
        ed.apply();
        updateAllWidgets(context);
        QueueWidgetProvider.updateAllWidgets(context);
        if (playing) scheduleStaleCheck(context);
    }

    static void saveProgress(Context context, long posMs, long durMs) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long oldPos = sp.getLong("pos_ms", 0L);
        long oldDur = sp.getLong("dur_ms", 0L);
        if (Math.abs(posMs - oldPos) < 400 && durMs == oldDur) return;
        sp.edit().putLong("pos_ms", Math.max(0L, posMs)).putLong("dur_ms", Math.max(0L, durMs))
                .putLong("last_report_ms", System.currentTimeMillis()).apply();
        updateAllWidgets(context);
    }

    static void saveModesAndProgress(Context context, boolean shuffle, int repeatMode, long posMs, long durMs) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("shuffle", shuffle)
                .putInt("repeat_mode", repeatMode)
                .putLong("pos_ms", Math.max(0L, posMs))
                .putLong("dur_ms", Math.max(0L, durMs))
                .putLong("last_report_ms", System.currentTimeMillis())
                .apply();
        updateAllWidgets(context);
    }

    static void saveLyricLine(Context context, String lyric) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String old = sp.getString("lyric", "");
        String next = LyricsWidgetProvider.stripLyricCredit(lyric);
        if (next.equals(old)) return;
        sp.edit().putString("lyric", next).apply();
        updateAllWidgets(context);
    }

    static void saveArtwork(Context context, Bitmap raw) {
        try {
            File artFile = new File(context.getCacheDir(), "widget_art.png");
            if (raw == null) {
                if (artFile.exists()) artFile.delete();
            } else {
                Bitmap rounded = getRoundedCornerBitmap(raw, 28);
                try (FileOutputStream out = new FileOutputStream(artFile)) {
                    rounded.compress(Bitmap.CompressFormat.PNG, 95, out);
                }
            }
        } catch (Throwable ignored) {}
        updateAllWidgets(context);
        QueueWidgetProvider.updateAllWidgets(context);
    }

    static void updateAllWidgets(Context context) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            Class<?>[] cls = {MediaWidgetProvider.class, MediaWidgetSquareProvider.class, MediaWidgetFullProvider.class};
            int[] vars = {V_RESPONSIVE, V_SQUARE, V_FULL};
            for (int k = 0; k < cls.length; k++) {
                int[] ids = mgr.getAppWidgetIds(new ComponentName(context, cls[k]));
                if (ids == null) continue;
                for (int id : ids) updateSingleWidget(context, mgr, id, vars[k]);
            }
        } catch (Throwable ignored) {}
    }

    private static void updateSingleWidget(Context context, AppWidgetManager mgr, int widgetId, int variant) {
        try {
            if (variant != V_RESPONSIVE) {
                mgr.updateAppWidget(widgetId, buildViews(context, variant, false));
                return;
            }
            if (Build.VERSION.SDK_INT >= 31) {
                Map<SizeF, RemoteViews> sizeMap = new HashMap<>();
                sizeMap.put(new SizeF(180f, 56f), buildViews(context, V_RESPONSIVE, false));
                sizeMap.put(new SizeF(180f, 118f), buildViews(context, V_RESPONSIVE, true));
                mgr.updateAppWidget(widgetId, new RemoteViews(sizeMap));
                return;
            }
            Bundle opts = mgr.getAppWidgetOptions(widgetId);
            int minH = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 64) : 64;
            mgr.updateAppWidget(widgetId, buildViews(context, V_RESPONSIVE, minH >= 115));
        } catch (Throwable ignored) {}
    }

    private static RemoteViews buildViews(Context context, int variant, boolean large) {
        final boolean square = variant == V_SQUARE;
        final boolean full = variant == V_FULL;
        final boolean hasText = !square;
        final boolean hasProgress = variant == V_RESPONSIVE && large;
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean playing = sp.getBoolean("playing", false);
        boolean shuffle = sp.getBoolean("shuffle", false);
        int repeatMode = sp.getInt("repeat_mode", 0);
        long posMs = sp.getLong("pos_ms", 0L);
        long durMs = sp.getLong("dur_ms", 0L);
        String title = sp.getString("title", "");
        String artist = sp.getString("artist", "");
        String lyric = sp.getString("lyric", "");
        int theme = widgetBg(context, sp.getInt("theme", 0xFF1E1B24));
        boolean idle = title.isEmpty();

        String lang = context.getSharedPreferences("app", Context.MODE_PRIVATE).getString("lang", "vi");
        boolean isEn = "en".equalsIgnoreCase(lang);

        RemoteViews views = new RemoteViews(context.getPackageName(),
                square ? R.layout.media_widget_square
                        : full ? R.layout.media_widget_expanded
                        : large ? R.layout.media_widget_large : R.layout.media_widget);

        if (hasText) {
            views.setTextViewText(R.id.widget_title, title.isEmpty() ? "Media Player" : title);
            views.setTextViewText(R.id.widget_artist, artist.isEmpty()
                    ? (isEn ? "Tap to open player" : "Chạm để mở trình phát")
                    : artist);
            if (lyric != null && !lyric.trim().isEmpty()) {
                views.setViewVisibility(R.id.widget_lyric, View.VISIBLE);
                views.setTextViewText(R.id.widget_lyric, lyric.trim());
            } else {
                views.setViewVisibility(R.id.widget_lyric, View.GONE);
            }
        }

        views.setImageViewResource(R.id.widget_play,
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
        tintPlayButton(context, views, R.id.widget_play);

        int bgColor = 0xFF000000 | (theme & 0x00FFFFFF);
        double lum = (0.299 * ((bgColor >> 16) & 255) + 0.587 * ((bgColor >> 8) & 255) + 0.114 * (bgColor & 255)) / 255.0;
        boolean lightBg = lum > 0.62;
        int primaryText = lightBg ? 0xFF1C1B1F : 0xFFF5EFF7;
        int secondaryText = lightBg ? 0xFF49454F : 0xFFCAC4D0;
        int accentText = widgetAccent(context, lightBg ? 0xFF6750A4 : 0xFFD0BCFF);

        // API 31+: nhuộm nền bằng tint để giữ góc bo của drawable; thấp hơn thì đổi màu phẳng như trước
        if (Build.VERSION.SDK_INT >= 31 && variant != V_RESPONSIVE || (Build.VERSION.SDK_INT >= 31 && large)) {
            try { views.setColorStateList(R.id.widget_root, "setBackgroundTintList", android.content.res.ColorStateList.valueOf(bgColor)); }
            catch (Throwable t) { views.setInt(R.id.widget_root, "setBackgroundColor", bgColor); }
        } else {
            views.setInt(R.id.widget_root, "setBackgroundColor", bgColor);
        }
        if (hasText) {
            views.setTextColor(R.id.widget_title, primaryText);
            views.setTextColor(R.id.widget_artist, secondaryText);
            views.setTextColor(R.id.widget_lyric, accentText);
        }
        views.setInt(R.id.widget_prev, "setColorFilter", primaryText);
        views.setInt(R.id.widget_next, "setColorFilter", primaryText);

        if (hasProgress) {
            views.setTextViewText(R.id.widget_pos_time, formatTime(posMs));
            views.setTextViewText(R.id.widget_dur_time, formatTime(durMs));
            views.setTextColor(R.id.widget_pos_time, secondaryText);
            views.setTextColor(R.id.widget_dur_time, secondaryText);
            int progress = (durMs > 0) ? (int) Math.min(1000L, Math.max(0L, (posMs * 1000L) / durMs)) : 0;
            views.setProgressBar(R.id.widget_progress, 1000, progress, false);
        }

        if (full) {
            views.setInt(R.id.widget_shuffle, "setBackgroundResource",
                    shuffle ? R.drawable.widget_pill_active_bg : R.drawable.widget_pill_bg);
            views.setInt(R.id.widget_shuffle, "setColorFilter", shuffle ? accentText : primaryText);
            if (hasWidgetColors(context) && Build.VERSION.SDK_INT >= 31) {
                try {
                    views.setColorStateList(R.id.widget_shuffle, "setBackgroundTintList", shuffle ? android.content.res.ColorStateList.valueOf(accentText) : null);
                    views.setColorStateList(R.id.widget_repeat, "setBackgroundTintList", repeatMode > 0 ? android.content.res.ColorStateList.valueOf(accentText) : null);
                } catch (Throwable ignored) {}
            }

            views.setImageViewResource(R.id.widget_repeat,
                    repeatMode == 2 ? R.drawable.ic_widget_repeat_one : R.drawable.ic_widget_repeat);
            views.setInt(R.id.widget_repeat, "setBackgroundResource",
                    repeatMode > 0 ? R.drawable.widget_pill_active_bg : R.drawable.widget_pill_bg);
            views.setInt(R.id.widget_repeat, "setColorFilter", repeatMode > 0 ? accentText : primaryText);
        }

        File artFile = new File(context.getCacheDir(), "widget_art.png");
        if (artFile.exists() && artFile.length() > 0) {
            Bitmap bmp = BitmapFactory.decodeFile(artFile.getAbsolutePath());
            if (bmp != null) {
                views.setImageViewBitmap(R.id.widget_art, bmp);
            } else {
                views.setImageViewResource(R.id.widget_art, R.drawable.ic_launcher);
            }
        } else if (idle) {
            views.setImageViewBitmap(R.id.widget_art, null);   // chưa mở bài nào: album art trống
        } else {
            views.setImageViewResource(R.id.widget_art, R.drawable.ic_launcher);
        }

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(
                context, 100, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        views.setOnClickPendingIntent(R.id.widget_root, openPi);
        views.setOnClickPendingIntent(R.id.widget_art_box, openPi);
        if (large || full) views.setOnClickPendingIntent(R.id.widget_meta_box, openPi);
        if (full) {
            views.setOnClickPendingIntent(R.id.widget_shuffle, buildCmdPendingIntent(context, "shuffle", 104));
            views.setOnClickPendingIntent(R.id.widget_repeat, buildCmdPendingIntent(context, "repeat", 105));
        }

        views.setOnClickPendingIntent(R.id.widget_prev, buildCmdPendingIntent(context, "prev", 101));
        views.setOnClickPendingIntent(R.id.widget_play, buildCmdPendingIntent(context, "toggle", 102));
        views.setOnClickPendingIntent(R.id.widget_next, buildCmdPendingIntent(context, "next", 103));

        return views;
    }

    private static String formatTime(long ms) {
        if (ms <= 0) return "0:00";
        long totalSec = ms / 1000L;
        long m = totalSec / 60L;
        long s = totalSec % 60L;
        return String.format(Locale.US, "%d:%02d", m, s);
    }

    private static PendingIntent buildCmdPendingIntent(Context context, String cmd, int reqCode) {
        Intent i = new Intent(context, MediaWidgetProvider.class);
        i.setAction(ACTION_CMD);
        i.putExtra(EXTRA_CMD, cmd);
        return PendingIntent.getBroadcast(
                context, reqCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
    }

    private static Bitmap getRoundedCornerBitmap(Bitmap bitmap, int radiusPx) {
        int size = Math.min(bitmap.getWidth(), bitmap.getHeight());
        Bitmap cropped = Bitmap.createBitmap(bitmap, (bitmap.getWidth() - size) / 2, (bitmap.getHeight() - size) / 2, size, size);
        Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        final Rect rect = new Rect(0, 0, size, size);
        final RectF rectF = new RectF(rect);
        canvas.drawRoundRect(rectF, radiusPx, radiusPx, paint);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(cropped, rect, rect, paint);
        return output;
    }
}
