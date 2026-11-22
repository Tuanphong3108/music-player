package com.tuanphong.mediaplayer;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.widget.RemoteViews;

public class LyricsWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "media_lyrics_widget_state";
    static final String ACTION_TOGGLE_MODE = "com.tuanphong.mediaplayer.LYRICS_WIDGET_TOGGLE_MODE";

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
        if (ACTION_TOGGLE_MODE.equals(intent.getAction())) {
            SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            boolean isStatic = sp.getBoolean("static_mode", false);
            sp.edit().putBoolean("static_mode", !isStatic).apply();
            updateAllWidgets(context);
        }
    }

    static String stripLyricCredit(String text) {
        if (text == null || text.isEmpty()) return "";
        String[] lines = text.split("\\r?\\n");
        StringBuilder sb = new StringBuilder();
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            if (trimmed.matches("(?i)^Lyric by\\b.*") || trimmed.matches("(?i)^Lyric powered by LRCLIB\\b.*")) {
                continue;
            }
            trimmed = trimmed.replaceAll("(?i)\\s*Lyric by\\s+[^•\\n]+(?:\\s*•\\s*Lyric powered by LRCLIB)?$", "");
            trimmed = trimmed.replaceAll("(?i)\\s*Lyric powered by LRCLIB$", "");
            trimmed = trimmed.trim();
            if (!trimmed.isEmpty()) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(trimmed);
            }
        }
        return sb.toString();
    }

    static void saveLyricsData(Context context, String syncedLine, String staticBlock, String trackTitle, boolean hasLyrics) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String oldSync = sp.getString("synced_line", "");
        String oldStatic = sp.getString("static_block", "");
        String oldTitle = sp.getString("track_title", "");
        boolean oldHas = sp.getBoolean("has_lyrics", false);

        String nextSync = stripLyricCredit(syncedLine);
        String nextStatic = stripLyricCredit(staticBlock);
        String nextTitle = trackTitle == null ? "" : trackTitle;

        if (nextSync.equals(oldSync) && nextStatic.equals(oldStatic)
                && nextTitle.equals(oldTitle) && hasLyrics == oldHas) {
            return;
        }
        sp.edit()
                .putString("synced_line", nextSync)
                .putString("static_block", nextStatic)
                .putString("track_title", nextTitle)
                .putBoolean("has_lyrics", hasLyrics)
                .apply();
        updateAllWidgets(context);
    }

    static void clearLyrics(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .remove("synced_line")
                .remove("static_block")
                .remove("track_title")
                .putBoolean("has_lyrics", false)
                .apply();
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
            ComponentName cn = new ComponentName(context, LyricsWidgetProvider.class);
            int[] ids = mgr.getAppWidgetIds(cn);
            if (ids == null || ids.length == 0) return;
            for (int id : ids) {
                updateSingleWidget(context, mgr, id);
            }
        } catch (Throwable ignored) {}
    }

    private static void updateSingleWidget(Context context, AppWidgetManager mgr, int widgetId) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences mainSp = context.getSharedPreferences(MediaWidgetProvider.PREFS, Context.MODE_PRIVATE);

        boolean staticMode = sp.getBoolean("static_mode", false);
        boolean hasLyrics = sp.getBoolean("has_lyrics", false);
        String syncedLine = sp.getString("synced_line", "");
        String staticBlock = sp.getString("static_block", "");
        String trackTitle = sp.getString("track_title", "");
        int theme = sp.getInt("theme", mainSp.getInt("theme", 0xFF1E1B24));

        String lang = context.getSharedPreferences("app", Context.MODE_PRIVATE).getString("lang", "vi");
        boolean isEn = "en".equalsIgnoreCase(lang);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.lyrics_widget);

        views.setTextViewText(R.id.lyrics_widget_track,
                trackTitle.isEmpty() ? "Media Player • Lyrics" : trackTitle);
        views.setTextViewText(R.id.lyrics_widget_mode_btn, staticMode ? "Static" : "Synced");

        String displayBody;
        if (!hasLyrics && syncedLine.isEmpty() && staticBlock.isEmpty()) {
            displayBody = trackTitle.isEmpty()
                    ? (isEn ? "Tap to open lyrics in Media Player" : "Chạm để mở lời bài hát trong Media Player")
                    : (isEn ? "No lyrics available for this track" : "Bài hát này chưa có lời");
        } else if (staticMode) {
            displayBody = !staticBlock.isEmpty() ? staticBlock : syncedLine;
        } else {
            displayBody = !syncedLine.isEmpty() ? syncedLine : staticBlock;
        }
        views.setTextViewText(R.id.lyrics_widget_body, displayBody);

        int bgColor = 0xFF000000 | (theme & 0x00FFFFFF);
        double lum = (0.299 * ((bgColor >> 16) & 255) + 0.587 * ((bgColor >> 8) & 255) + 0.114 * (bgColor & 255)) / 255.0;
        boolean lightBg = lum > 0.62;
        int primaryText = lightBg ? 0xFF1C1B1F : 0xFFF5EFF7;
        int secondaryText = lightBg ? 0xFF49454F : 0xFFCAC4D0;
        int accentText = lightBg ? 0xFF6750A4 : 0xFFD0BCFF;

        views.setInt(R.id.lyrics_widget_root, "setBackgroundColor", bgColor);
        views.setTextColor(R.id.lyrics_widget_track, secondaryText);
        views.setTextColor(R.id.lyrics_widget_mode_btn, accentText);
        views.setTextColor(R.id.lyrics_widget_body,
                (hasLyrics || !syncedLine.isEmpty() || !staticBlock.isEmpty()) ? primaryText : secondaryText);

        Intent toggleIntent = new Intent(context, LyricsWidgetProvider.class);
        toggleIntent.setAction(ACTION_TOGGLE_MODE);
        PendingIntent togglePi = PendingIntent.getBroadcast(
                context, 301, toggleIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        views.setOnClickPendingIntent(R.id.lyrics_widget_mode_btn, togglePi);

        Intent openLyricsIntent = new Intent(context, MainActivity.class);
        openLyricsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openLyricsIntent.putExtra("widget_cmd", "open_lyrics");
        PendingIntent openPi = PendingIntent.getActivity(
                context, 300, openLyricsIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        views.setOnClickPendingIntent(R.id.lyrics_widget_root, openPi);
        views.setOnClickPendingIntent(R.id.lyrics_widget_body, openPi);

        mgr.updateAppWidget(widgetId, views);
    }
}
