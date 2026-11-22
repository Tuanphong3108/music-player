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
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;

public class QueueWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "media_queue_widget_state";

    private static final int[] ROW_IDS = {
            R.id.queue_row_0, R.id.queue_row_1, R.id.queue_row_2, R.id.queue_row_3
    };
    private static final int[] NUM_IDS = {
            R.id.queue_row_0_num, R.id.queue_row_1_num, R.id.queue_row_2_num, R.id.queue_row_3_num
    };
    private static final int[] TITLE_IDS = {
            R.id.queue_row_0_title, R.id.queue_row_1_title, R.id.queue_row_2_title, R.id.queue_row_3_title
    };
    private static final int[] ARTIST_IDS = {
            R.id.queue_row_0_artist, R.id.queue_row_1_artist, R.id.queue_row_2_artist, R.id.queue_row_3_artist
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateSingleWidget(context, appWidgetManager, appWidgetId);
        }
    }

    static void saveQueue(Context context, String queueJson) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String old = sp.getString("queue_json", "");
        String next = queueJson == null ? "" : queueJson;
        if (next.equals(old)) return;
        sp.edit().putString("queue_json", next).apply();
        updateAllWidgets(context);
    }

    static void clearQueue(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("queue_json").apply();
        updateAllWidgets(context);
    }

    static void updateTheme(Context context, int themeColor) {
        if (themeColor == 0) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt("theme", themeColor).apply();
        updateAllWidgets(context);
    }

    static void updateAllWidgets(Context context) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            ComponentName cn = new ComponentName(context, QueueWidgetProvider.class);
            int[] ids = mgr.getAppWidgetIds(cn);
            if (ids == null || ids.length == 0) return;
            for (int id : ids) {
                updateSingleWidget(context, mgr, id);
            }
        } catch (Throwable ignored) {}
    }

    private static void updateSingleWidget(Context context, AppWidgetManager mgr, int widgetId) {
        SharedPreferences mainSp = context.getSharedPreferences(MediaWidgetProvider.PREFS, Context.MODE_PRIVATE);
        SharedPreferences queueSp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        boolean playing = mainSp.getBoolean("playing", false);
        String nowTitle = mainSp.getString("title", "");
        int theme = MediaWidgetProvider.widgetBg(context, queueSp.getInt("theme", mainSp.getInt("theme", 0xFF1E1B24)));
        String queueJson = queueSp.getString("queue_json", "");

        String lang = context.getSharedPreferences("app", Context.MODE_PRIVATE).getString("lang", "vi");
        boolean isEn = "en".equalsIgnoreCase(lang);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.queue_widget);

        views.setTextViewText(R.id.queue_widget_now_title, nowTitle.isEmpty() ? "Media Player" : nowTitle);
        views.setTextViewText(R.id.queue_widget_subtitle,
                isEn ? "Up next in queue" : "Tiếp theo trong hàng đợi");
        views.setTextViewText(R.id.queue_widget_empty,
                isEn ? "No upcoming tracks in queue" : "Chưa có bài hát nào trong hàng đợi");

        views.setImageViewResource(R.id.queue_widget_play,
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
        MediaWidgetProvider.tintPlayButton(context, views, R.id.queue_widget_play);

        int bgColor = 0xFF000000 | (theme & 0x00FFFFFF);
        double lum = (0.299 * ((bgColor >> 16) & 255) + 0.587 * ((bgColor >> 8) & 255) + 0.114 * (bgColor & 255)) / 255.0;
        boolean lightBg = lum > 0.62;
        int primaryText = lightBg ? 0xFF1C1B1F : 0xFFF5EFF7;
        int secondaryText = lightBg ? 0xFF49454F : 0xFFCAC4D0;
        int accentText = MediaWidgetProvider.widgetAccent(context, lightBg ? 0xFF6750A4 : 0xFFD0BCFF);

        views.setInt(R.id.queue_widget_root, "setBackgroundColor", bgColor);
        views.setTextColor(R.id.queue_widget_now_title, primaryText);
        views.setTextColor(R.id.queue_widget_subtitle, accentText);
        views.setTextColor(R.id.queue_widget_empty, secondaryText);

        File artFile = new File(context.getCacheDir(), "widget_art.png");
        if (artFile.exists() && artFile.length() > 0) {
            Bitmap bmp = BitmapFactory.decodeFile(artFile.getAbsolutePath());
            if (bmp != null) views.setImageViewBitmap(R.id.queue_widget_art, bmp);
            else views.setImageViewResource(R.id.queue_widget_art, R.drawable.ic_launcher);
        } else if (nowTitle.isEmpty()) {
            views.setImageViewBitmap(R.id.queue_widget_art, null);   // chưa mở bài nào: album art trống
        } else {
            views.setImageViewResource(R.id.queue_widget_art, R.drawable.ic_launcher);
        }

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(
                context, 200, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        views.setOnClickPendingIntent(R.id.queue_widget_header, openPi);
        views.setOnClickPendingIntent(R.id.queue_widget_empty, openPi);
        views.setOnClickPendingIntent(R.id.queue_widget_play, buildCmdPendingIntent(context, "toggle", 201));

        for (int rowId : ROW_IDS) views.setViewVisibility(rowId, View.GONE);

        int count = 0;
        if (queueJson != null && !queueJson.isEmpty()) {
            try {
                JSONArray arr = new JSONArray(queueJson);
                int max = Math.min(arr.length(), ROW_IDS.length);
                for (int k = 0; k < max; k++) {
                    JSONObject item = arr.optJSONObject(k);
                    if (item == null) continue;
                    int idx = item.optInt("index", -1);
                    String title = item.optString("title", "");
                    String artist = item.optString("artist", "");
                    if (idx < 0 || title.isEmpty()) continue;

                    views.setViewVisibility(ROW_IDS[k], View.VISIBLE);
                    views.setTextViewText(NUM_IDS[k], String.valueOf(idx + 1));
                    views.setTextViewText(TITLE_IDS[k], title);
                    views.setTextViewText(ARTIST_IDS[k], artist);
                    views.setTextColor(NUM_IDS[k], accentText);
                    views.setTextColor(TITLE_IDS[k], primaryText);
                    views.setTextColor(ARTIST_IDS[k], secondaryText);
                    views.setOnClickPendingIntent(ROW_IDS[k],
                            buildCmdPendingIntent(context, "play_index:" + idx, 210 + k));
                    count++;
                }
            } catch (Throwable ignored) {}
        }

        views.setViewVisibility(R.id.queue_widget_list, count > 0 ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.queue_widget_empty, count > 0 ? View.GONE : View.VISIBLE);

        mgr.updateAppWidget(widgetId, views);
    }

    private static PendingIntent buildCmdPendingIntent(Context context, String cmd, int reqCode) {
        Intent i = new Intent(context, MediaWidgetProvider.class);
        i.setAction(MediaWidgetProvider.ACTION_CMD);
        i.putExtra(MediaWidgetProvider.EXTRA_CMD, cmd);
        return PendingIntent.getBroadcast(
                context, reqCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
    }
}
