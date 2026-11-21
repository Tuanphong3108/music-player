package com.tuanphong.mediaplayer;

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
import android.view.View;
import android.widget.RemoteViews;

import java.io.File;
import java.io.FileOutputStream;

public class MediaWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "media_widget_state";
    static final String ACTION_CMD = "com.tuanphong.mediaplayer.WIDGET_CMD";
    static final String EXTRA_CMD = "cmd";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateSingleWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null) return;
        String action = intent.getAction();
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

    static void savePlaybackState(Context context, boolean playing, String title, String artist, String lyric, int themeColor) {
        SharedPreferences.Editor ed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        ed.putBoolean("playing", playing);
        if (title != null) ed.putString("title", title);
        if (artist != null) ed.putString("artist", artist);
        if (lyric != null) ed.putString("lyric", lyric);
        if (themeColor != 0) ed.putInt("theme", themeColor);
        ed.apply();
        updateAllWidgets(context);
    }

    static void saveLyricLine(Context context, String lyric) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String old = sp.getString("lyric", "");
        String next = lyric == null ? "" : lyric;
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
    }

    static void updateAllWidgets(Context context) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            ComponentName cn = new ComponentName(context, MediaWidgetProvider.class);
            int[] ids = mgr.getAppWidgetIds(cn);
            if (ids == null || ids.length == 0) return;
            for (int id : ids) {
                updateSingleWidget(context, mgr, id);
            }
        } catch (Throwable ignored) {}
    }

    private static void updateSingleWidget(Context context, AppWidgetManager mgr, int widgetId) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean playing = sp.getBoolean("playing", false);
        String title = sp.getString("title", "");
        String artist = sp.getString("artist", "");
        String lyric = sp.getString("lyric", "");
        int theme = sp.getInt("theme", 0xFF1E1B24);

        String lang = context.getSharedPreferences("app", Context.MODE_PRIVATE).getString("lang", "vi");
        boolean isEn = "en".equalsIgnoreCase(lang);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.media_widget);

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

        views.setImageViewResource(R.id.widget_play,
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);

        int bgColor = 0xFF000000 | (theme & 0x00FFFFFF);
        double lum = (0.299 * ((bgColor >> 16) & 255) + 0.587 * ((bgColor >> 8) & 255) + 0.114 * (bgColor & 255)) / 255.0;
        boolean lightBg = lum > 0.62;
        int primaryText = lightBg ? 0xFF1C1B1F : 0xFFF5EFF7;
        int secondaryText = lightBg ? 0xFF49454F : 0xFFCAC4D0;
        int accentText = lightBg ? 0xFF6750A4 : 0xFFD0BCFF;

        views.setInt(R.id.widget_root, "setBackgroundColor", bgColor);
        views.setTextColor(R.id.widget_title, primaryText);
        views.setTextColor(R.id.widget_artist, secondaryText);
        views.setTextColor(R.id.widget_lyric, accentText);
        views.setInt(R.id.widget_prev, "setColorFilter", primaryText);
        views.setInt(R.id.widget_next, "setColorFilter", primaryText);

        File artFile = new File(context.getCacheDir(), "widget_art.png");
        if (artFile.exists() && artFile.length() > 0) {
            Bitmap bmp = BitmapFactory.decodeFile(artFile.getAbsolutePath());
            if (bmp != null) {
                views.setImageViewBitmap(R.id.widget_art, bmp);
            } else {
                views.setImageViewResource(R.id.widget_art, R.drawable.ic_launcher);
            }
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

        views.setOnClickPendingIntent(R.id.widget_prev, buildCmdPendingIntent(context, "prev", 101));
        views.setOnClickPendingIntent(R.id.widget_play, buildCmdPendingIntent(context, "toggle", 102));
        views.setOnClickPendingIntent(R.id.widget_next, buildCmdPendingIntent(context, "next", 103));

        mgr.updateAppWidget(widgetId, views);
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
