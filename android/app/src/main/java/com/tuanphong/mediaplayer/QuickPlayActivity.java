package com.tuanphong.mediaplayer;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.AccelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Sheet mini hiện nổi phía dưới khi mở tệp nhạc từ app khác (trình quản lý tệp...): ảnh bìa, tên, thanh tua, điều khiển cơ bản và nút "Mở trình phát đầy đủ".
 * Tự phát bằng ExoPlayer riêng (không dựng WebView) nên mở gần như tức thì; bấm nút mới chuyển tệp + vị trí sang app chính.
 */
public class QuickPlayActivity extends Activity {
    private ExoPlayer player;
    private Uri uri;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private WavySeek seek;
    private TextView tvTitle, tvArtist, tvAlbum, tvPos, tvDur, btnOpen;
    private ImageView art, artNote, btnPlayIcon;
    private View btnPlay, btnPrev, btnNext, card;
    private long fallbackDur = 0;
    private boolean mainChecked = false, mainWasPlaying = false, mainResumed = false;
    private boolean vi, dark, handedOff = false, ended = false, closing = false;
    private Typeface gsfRegular, gsfBold, gsfRoundedBold;

    // Bảng màu đồng bộ với accent color trong app (SharedPreferences "app")
    private int cSurface, cOnSurface, cOnVariant, cPrimary, cTrack, cSecBtn, cOnSecBtn, cPlayBtn, cOnPlayBtn, cOpenBtn, cOnOpenBtn, cArtBg;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        SharedPreferences appSp = getSharedPreferences("app", MODE_PRIVATE);
        String savedLang = appSp.getString("lang", "");
        if (!savedLang.isEmpty()) {
            vi = "vi".equalsIgnoreCase(savedLang);
        } else {
            vi = Locale.getDefault().getLanguage().equals("vi");
        }
        dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        pickColors(appSp);
        loadGoogleSansFlexSync();
        uri = uriFrom(getIntent());
        if (uri == null) { finish(); return; }
        buildUi();
        ensureGoogleSansFlexAsync();
        initPlayer();
        loadMetaAsync();
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        Uri u = uriFrom(i);
        if (u == null) return;
        setIntent(i);
        uri = u;
        ended = false;
        closing = false;
        player.setMediaItem(MediaItem.fromUri(uri));
        player.prepare();
        player.play();
        fallbackDur = 0;
        loadMetaAsync();
    }

    private static Uri uriFrom(Intent i) {
        if (i == null) return null;
        Uri u = i.getData();
        if (u == null && i.getClipData() != null && i.getClipData().getItemCount() > 0) u = i.getClipData().getItemAt(0).getUri();
        return u;
    }

    private void pickColors(SharedPreferences appSp) {
        int savedTheme = appSp.getInt("theme", 0);
        int savedBg = appSp.getInt("widget_bg", 0);
        int savedAccent = appSp.getInt("widget_accent", 0);

        int baseSurface = 0;
        if (savedBg != 0) baseSurface = 0xFF000000 | savedBg;
        else if (savedTheme != 0) baseSurface = 0xFF000000 | savedTheme;

        if (baseSurface != 0) {
            dark = luminance(baseSurface) < 0.45;
        }

        int accent = 0;
        if (savedAccent != 0) {
            accent = 0xFF000000 | savedAccent;
        } else if (Build.VERSION.SDK_INT >= 31) {
            try {
                accent = getResources().getColor(dark ? android.R.color.system_accent1_200 : android.R.color.system_accent1_600, getTheme());
            } catch (Throwable ignored) {}
        }
        if (accent == 0) accent = dark ? 0xFFD0BCFF : 0xFF6750A4;

        float[] hsl = new float[3];
        Color.colorToHSV(accent, hsl);
        float hue = hsl[0];
        float sat = hsl[1];

        if (dark) {
            cSurface = baseSurface != 0 ? blendColors(baseSurface, 0xFF1F2129, 0.22f) : Color.HSVToColor(new float[]{hue, Math.min(0.18f, sat * 0.35f), 0.14f});
            cOnSurface = 0xFFE6E1E5;
            cOnVariant = 0xFFCAC4D0;
            cPrimary = accent;
            cTrack = Color.HSVToColor(new float[]{hue, Math.min(0.20f, sat * 0.3f), 0.30f});
            cSecBtn = Color.HSVToColor(new float[]{hue, Math.min(0.28f, sat * 0.45f), 0.25f});
            cOnSecBtn = Color.HSVToColor(new float[]{hue, Math.min(0.22f, sat * 0.3f), 0.92f});
            cPlayBtn = Color.HSVToColor(new float[]{hue, Math.min(0.42f, Math.max(0.25f, sat * 0.75f)), 0.34f});
            cOnPlayBtn = Color.HSVToColor(new float[]{hue, Math.min(0.20f, sat * 0.25f), 0.95f});
            cOpenBtn = accent;
            cOnOpenBtn = luminance(accent) > 0.55 ? 0xFF1C1B1F : 0xFFFFFFFF;
            cArtBg = Color.HSVToColor(new float[]{hue, Math.min(0.24f, sat * 0.4f), 0.21f});
        } else {
            cSurface = baseSurface != 0 ? blendColors(baseSurface, 0xFFF7F5FC, 0.18f) : Color.HSVToColor(new float[]{hue, Math.min(0.08f, sat * 0.18f), 0.97f});
            cOnSurface = 0xFF1D1B20;
            cOnVariant = 0xFF49454F;
            cPrimary = accent;
            cTrack = Color.HSVToColor(new float[]{hue, Math.min(0.16f, sat * 0.25f), 0.82f});
            cSecBtn = Color.HSVToColor(new float[]{hue, Math.min(0.24f, sat * 0.4f), 0.91f});
            cOnSecBtn = Color.HSVToColor(new float[]{hue, Math.min(0.55f, Math.max(0.3f, sat)), 0.18f});
            cPlayBtn = Color.HSVToColor(new float[]{hue, Math.min(0.34f, Math.max(0.2f, sat * 0.6f)), 0.88f});
            cOnPlayBtn = Color.HSVToColor(new float[]{hue, Math.min(0.60f, Math.max(0.35f, sat)), 0.16f});
            cOpenBtn = accent;
            cOnOpenBtn = luminance(accent) > 0.55 ? 0xFF1C1B1F : 0xFFFFFFFF;
            cArtBg = Color.HSVToColor(new float[]{hue, Math.min(0.18f, sat * 0.3f), 0.90f});
        }
    }

    private static double luminance(int c) {
        return (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255.0;
    }

    private static int blendColors(int c1, int c2, float ratio) {
        float ir = 1f - ratio;
        int r = Math.round(Color.red(c1) * ir + Color.red(c2) * ratio);
        int g = Math.round(Color.green(c1) * ir + Color.green(c2) * ratio);
        int b = Math.round(Color.blue(c1) * ir + Color.blue(c2) * ratio);
        return Color.rgb(r, g, b);
    }

    private void loadGoogleSansFlexSync() {
        try {
            File regFile = new File(new File(getCacheDir(), "fonts"), "GoogleSansFlex-Regular.ttf");
            if (regFile.exists() && regFile.length() > 1024) {
                applyLoadedFontFile(regFile);
            }
        } catch (Throwable ignored) {}
    }

    private void applyLoadedFontFile(File regFile) {
        gsfRegular = Typeface.createFromFile(regFile);
        gsfBold = Typeface.create(gsfRegular, Typeface.BOLD);
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                gsfRoundedBold = new Typeface.Builder(regFile)
                        .setFontVariationSettings("'wght' 700, 'ROND' 100")
                        .build();
            } catch (Throwable ignored) {}
        }
        if (gsfRoundedBold == null) gsfRoundedBold = gsfBold;
    }

    private void ensureGoogleSansFlexAsync() {
        if (gsfRegular != null) return;
        new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream in = null;
            FileOutputStream out = null;
            try {
                File fontDir = new File(getCacheDir(), "fonts");
                if (!fontDir.exists()) fontDir.mkdirs();
                File regFile = new File(fontDir, "GoogleSansFlex-Regular.ttf");
                HttpURLConnection cssConn = (HttpURLConnection) new URL(
                        "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght,ROND@400..700,0..100").openConnection();
                cssConn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14)");
                cssConn.setConnectTimeout(8000);
                cssConn.setReadTimeout(8000);
                BufferedReader br = new BufferedReader(new InputStreamReader(cssConn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line).append('\n');
                br.close();
                cssConn.disconnect();
                Matcher m = Pattern.compile("url\\((https://fonts\\.gstatic\\.com/[^)]+\\.ttf)\\)").matcher(sb.toString());
                if (m.find()) {
                    conn = (HttpURLConnection) new URL(m.group(1)).openConnection();
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(10000);
                    in = conn.getInputStream();
                    out = new FileOutputStream(regFile);
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                    out.flush();
                    out.close(); out = null;
                    in.close(); in = null;
                    applyLoadedFontFile(regFile);
                    ui.post(this::refreshTypefaces);
                }
            } catch (Throwable ignored) {
            } finally {
                try { if (out != null) out.close(); } catch (Exception ignored) {}
                try { if (in != null) in.close(); } catch (Exception ignored) {}
                try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
            }
        }, "qp-font").start();
    }

    private void applyTextStyle(TextView tv, boolean bold, boolean rounded) {
        if (tv == null) return;
        Typeface tf = rounded ? (gsfRoundedBold != null ? gsfRoundedBold : gsfBold)
                : (bold ? gsfBold : gsfRegular);
        if (tf != null) {
            tv.setTypeface(tf);
        } else {
            tv.setTypeface(Typeface.create("sans-serif-medium", bold ? Typeface.BOLD : Typeface.NORMAL));
        }
        if (rounded && Build.VERSION.SDK_INT >= 26) {
            try { tv.setFontVariationSettings("'wght' 700, 'ROND' 100"); } catch (Throwable ignored) {}
        }
    }

    private void refreshTypefaces() {
        applyTextStyle(tvTitle, true, true);
        applyTextStyle(tvArtist, false, false);
        applyTextStyle(tvAlbum, false, false);
        applyTextStyle(tvPos, false, false);
        applyTextStyle(tvDur, false, false);
        applyTextStyle(btnOpen, true, true);
    }

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    private GradientDrawable round(int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private void buildUi() {
        final FrameLayout root = new FrameLayout(this);
        root.setOnClickListener(v -> dismissSheet());   // chạm ra ngoài sheet = dừng nhạc + trượt xuống đóng

        card = new LinearLayout(this);
        final LinearLayout col = (LinearLayout) card;
        col.setOrientation(LinearLayout.VERTICAL);
        col.setBackground(round(cSurface, 36));
        col.setPadding(dp(24), dp(10), dp(24), dp(20));
        col.setClickable(true);
        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        clp.setMargins(dp(12), 0, dp(12), dp(12));
        if (getResources().getDisplayMetrics().widthPixels > dp(600)) clp.width = dp(520);
        root.addView(card, clp);

        // Tay nắm: kéo xuống để đóng
        View handle = new View(this);
        handle.setBackground(round(cTrack, 4));
        FrameLayout handleBox = new FrameLayout(this);
        handleBox.addView(handle, new FrameLayout.LayoutParams(dp(36), dp(4), Gravity.CENTER));
        col.addView(handleBox, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(24)));
        attachDragToDismiss(handleBox);

        // Hàng ảnh bìa + chữ
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        col.addView(row, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout artBox = new FrameLayout(this);
        artBox.setBackground(round(cArtBg, 22));
        artBox.setClipToOutline(true);
        artBox.setOutlineProvider(new android.view.ViewOutlineProvider() {
            @Override public void getOutline(View v, android.graphics.Outline o) { o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), dp(22)); }
        });
        art = new ImageView(this);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);
        artBox.addView(art, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        artNote = new ImageView(this);
        artNote.setImageResource(R.drawable.ic_music_note);
        artNote.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int notePad = dp(20);
        artNote.setPadding(notePad, notePad, notePad, notePad);
        artBox.addView(artNote, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        row.addView(artBox, new LinearLayout.LayoutParams(dp(96), dp(96)));

        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        tlp.leftMargin = dp(20);
        row.addView(texts, tlp);
        tvTitle = text(24, cOnSurface, true, true);
        tvTitle.setMaxLines(2);
        tvTitle.setEllipsize(TextUtils.TruncateAt.END);
        tvArtist = text(16, cOnVariant, false, false);
        tvArtist.setSingleLine(true);
        tvArtist.setEllipsize(TextUtils.TruncateAt.END);
        tvAlbum = text(13, cOnVariant, false, false);
        tvAlbum.setSingleLine(true);
        tvAlbum.setEllipsize(TextUtils.TruncateAt.END);
        texts.addView(tvTitle);
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        alp.topMargin = dp(6);
        texts.addView(tvArtist, alp);
        texts.addView(tvAlbum);

        // Thanh tua dạng sóng (dấu gạch dọc đứng yên theo trục Y giống WebView)
        seek = new WavySeek(this);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(36));
        slp.topMargin = dp(18);
        col.addView(seek, slp);
        seek.listener = (frac, fin) -> {
            long d = durationMs();
            if (d <= 0) return;
            if (player != null && !player.isCurrentMediaItemSeekable()) return;
            long pos = (long) (frac * d);
            if (d > 2000 && pos > d - 800) pos = d - 800;
            tvPos.setText(fmt(pos));
            if (fin && player != null) { player.seekTo(pos); ended = false; }
        };

        LinearLayout times = new LinearLayout(this);
        times.setOrientation(LinearLayout.HORIZONTAL);
        tvPos = text(13, cOnVariant, false, false);
        tvDur = text(13, cOnVariant, false, false);
        tvPos.setText("00:00"); tvDur.setText("00:00");
        View sp = new View(this);
        times.addView(tvPos);
        times.addView(sp, new LinearLayout.LayoutParams(0, 1, 1f));
        times.addView(tvDur);
        times.setPadding(dp(4), 0, dp(4), 0);
        col.addView(times, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Điều khiển
        LinearLayout ctr = new LinearLayout(this);
        ctr.setOrientation(LinearLayout.HORIZONTAL);
        ctr.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams ctrLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(76));
        ctrLp.topMargin = dp(20);
        col.addView(ctr, ctrLp);

        btnPrev = ctlButton(R.drawable.ic_qp_prev, cSecBtn, cOnSecBtn, 38);
        btnPlay = ctlButton(R.drawable.ic_qp_pause, cPlayBtn, cOnPlayBtn, 26);
        btnPlayIcon = (ImageView) ((FrameLayout) btnPlay).getChildAt(0);
        btnNext = ctlButton(R.drawable.ic_qp_next, cSecBtn, cOnSecBtn, 38);
        LinearLayout.LayoutParams b1 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
        LinearLayout.LayoutParams b2 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
        LinearLayout.LayoutParams b3 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
        b2.leftMargin = dp(10); b2.rightMargin = dp(10);
        ctr.addView(btnPrev, b1);
        ctr.addView(btnPlay, b2);
        ctr.addView(btnNext, b3);
        btnNext.setAlpha(0.38f);   // Mở từ ngoài chỉ có 1 tệp, không có bài kế
        btnNext.setEnabled(false);
        btnPrev.setOnClickListener(v -> { player.seekTo(0); ended = false; if (!player.isPlaying()) player.play(); });
        btnPlay.setOnClickListener(v -> {
            if (ended || player.getPlaybackState() == Player.STATE_ENDED) { player.seekTo(0); ended = false; player.play(); return; }
            if (player.isPlaying()) player.pause(); else player.play();
        });

        // Nút mở app chính (Google Sans Flex bo tròn trục ROND)
        btnOpen = text(17, cOnOpenBtn, true, true);
        btnOpen.setText(vi ? "Mở trình phát đầy đủ" : "Open full player");
        btnOpen.setGravity(Gravity.CENTER);
        btnOpen.setBackground(round(cOpenBtn, 28));
        btnOpen.setOnClickListener(v -> openFullPlayer());
        LinearLayout.LayoutParams olp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56));
        olp.topMargin = dp(20);
        col.addView(btnOpen, olp);

        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, wi) -> {
            Insets bars = wi.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return wi;
        });
        card.setTranslationY(dp(80));
        card.setAlpha(0f);
        card.animate().translationY(0).alpha(1f).setDuration(240).setInterpolator(new DecelerateInterpolator()).start();
    }

    private TextView text(int sp, int color, boolean bold, boolean rounded) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        applyTextStyle(t, bold, rounded);
        return t;
    }

    private View ctlButton(int icon, int bg, int fg, int radiusDp) {
        FrameLayout f = new FrameLayout(this);
        f.setBackground(round(bg, radiusDp));
        f.setClickable(true);
        ImageView iv = new ImageView(this);
        iv.setImageResource(icon);
        iv.setColorFilter(fg);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(34), dp(34), Gravity.CENTER);
        f.addView(iv, lp);
        f.setTag(new int[] { bg, fg });
        return f;
    }

    /** Dừng phát ngay, trượt card xuống đáy màn hình rồi mới đóng sheet. */
    private void dismissSheet() {
        if (closing) return;
        closing = true;
        if (player != null) {
            try { player.stop(); } catch (Throwable ignored) {}
        }
        releasePlayer();
        if (card != null) {
            float targetY = Math.max(dp(260), card.getHeight() + dp(40));
            card.animate()
                    .translationY(targetY)
                    .alpha(0f)
                    .setDuration(210)
                    .setInterpolator(new AccelerateInterpolator())
                    .withEndAction(this::finishQuickTask)
                    .start();
        } else {
            finishQuickTask();
        }
    }

    /** Đóng sheet và dọn sạch task riêng của QuickPlayActivity khỏi màn hình Đa nhiệm (không đụng tới task của MainActivity). */
    private void finishQuickTask() {
        try {
            if (Build.VERSION.SDK_INT >= 21) finishAndRemoveTask();
            else finish();
        } catch (Throwable ignored) {
            try { finish(); } catch (Throwable ignored2) {}
        }
        overridePendingTransition(0, 0);
    }

    private void attachDragToDismiss(View handle) {
        final float[] y0 = { 0 };
        handle.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN: y0[0] = e.getRawY(); return true;
                case MotionEvent.ACTION_MOVE: {
                    float dy = Math.max(0, e.getRawY() - y0[0]);
                    card.setTranslationY(dy);
                    return true;
                }
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL: {
                    float dy = Math.max(0, e.getRawY() - y0[0]);
                    if (dy > dp(80)) dismissSheet();
                    else card.animate().translationY(0).setDuration(160).start();
                    return true;
                }
            }
            return false;
        });
    }

    private void initPlayer() {
        androidx.media3.extractor.DefaultExtractorsFactory ef = new androidx.media3.extractor.DefaultExtractorsFactory()
                .setConstantBitrateSeekingEnabled(true)
                .setConstantBitrateSeekingAlwaysEnabled(true)
                .setMp3ExtractorFlags(androidx.media3.extractor.mp3.Mp3Extractor.FLAG_ENABLE_INDEX_SEEKING);
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new androidx.media3.exoplayer.source.DefaultMediaSourceFactory(this, ef))
                .build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.addListener(new Player.Listener() {
            @Override public void onIsPlayingChanged(boolean p) { syncPlayIcon(); }
            @Override public void onPlayWhenReadyChanged(boolean pwr, int r) { syncPlayIcon(); }
            @Override public void onPlaybackStateChanged(int st) {
                if (st == Player.STATE_ENDED) { ended = true; player.pause(); }
                syncPlayIcon();
            }
            @Override public void onPlayerError(PlaybackException e) { syncPlayIcon(); }
        });
        // App chính đang phát thì tạm dừng nhường sheet; nhớ lại để tự phát tiếp khi đóng sheet (nếu trước đó đã Pause thì giữ nguyên Pause)
        try {
            if (!mainChecked) {
                mainChecked = true;
                mainWasPlaying = NativeAudio.active() && new org.json.JSONObject(NativeAudio.stateJson()).optBoolean("pwr");
            }
            if (mainWasPlaying) NativeAudio.pause();
        } catch (Throwable ignored) {}
        player.setMediaItem(MediaItem.fromUri(uri));
        player.prepare();
        player.play();
        ui.post(tick);
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            long d = durationMs();
            long pos = Math.max(0, player.getCurrentPosition());
            if (d > 0 && pos > d) pos = d;
            boolean sk = player.isCurrentMediaItemSeekable();
            seek.setSeekable(sk);
            if (!seek.dragging) {
                seek.setProgress(d > 0 ? Math.min(1f, (float) pos / d) : 0f);
                tvPos.setText(fmt(ended && d > 0 ? d : pos));
            }
            tvDur.setText(fmt(d));
            seek.setPlaying(player.isPlaying());
            ui.postDelayed(this, 250);
        }
    };

    private long durationMs() {
        long d = player == null ? C.TIME_UNSET : player.getDuration();
        if (d == C.TIME_UNSET || d <= 0) d = fallbackDur;
        return Math.max(0, d);
    }

    private void syncPlayIcon() {
        if (player == null) return;
        boolean playing = player.getPlayWhenReady() && player.getPlaybackState() != Player.STATE_ENDED && !ended;
        btnPlayIcon.setImageResource(playing ? R.drawable.ic_qp_pause : R.drawable.ic_qp_play);
        // Đang phát: ô vuông bo tròn; tạm dừng: viên thuốc (đúng tinh thần MD3E)
        btnPlay.setBackground(round(cPlayBtn, playing ? 26 : 38));
    }

    private static String fmt(long ms) {
        long s = Math.max(0, ms) / 1000;
        long h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
        return h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, m, sec) : String.format(Locale.US, "%02d:%02d", m, sec);
    }

    private void loadMetaAsync() {
        final Uri u = uri;
        final Context ctx = getApplicationContext();
        tvTitle.setText(displayName(u));
        tvArtist.setText(vi ? "Không rõ nghệ sĩ" : "Unknown Artist");
        tvAlbum.setText(vi ? "Không rõ album" : "Unknown Album");
        new Thread(() -> {
            String title = null, artist = null, album = null;
            long dur = 0;
            Bitmap bmp = null;
            MediaMetadataRetriever r = new MediaMetadataRetriever();
            try {
                r.setDataSource(ctx, u);
                title = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE);
                artist = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
                if (empty(artist)) artist = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST);
                album = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM);
                String ds = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                if (ds != null) dur = Long.parseLong(ds.trim());
                byte[] pic = r.getEmbeddedPicture();
                if (pic != null && pic.length > 0) {
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(pic, 0, pic.length, o);
                    int ss = 1;
                    while (o.outWidth / (ss * 2) >= 512 && o.outHeight / (ss * 2) >= 512) ss *= 2;
                    o = new BitmapFactory.Options();
                    o.inSampleSize = ss;
                    bmp = BitmapFactory.decodeByteArray(pic, 0, pic.length, o);
                }
            } catch (Throwable ignored) {
            } finally { try { r.release(); } catch (Throwable ignored) {} }
            final String ft = title, fa = artist, fl = album; final long fd = dur; final Bitmap fb = bmp;
            ui.post(() -> {
                if (isDestroyed() || !u.equals(uri)) return;
                if (!empty(ft)) tvTitle.setText(ft);
                if (!empty(fa)) tvArtist.setText(fa);
                if (!empty(fl)) tvAlbum.setText(fl);
                fallbackDur = fd;
                if (fb != null) { art.setImageBitmap(fb); artNote.setVisibility(View.GONE); }
                else { art.setImageDrawable(null); artNote.setVisibility(View.VISIBLE); }
            });
        }, "qp-meta").start();
    }

    private static boolean empty(String s) { return s == null || s.trim().isEmpty(); }

    private String displayName(Uri u) {
        String n = null;
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) n = c.getString(0);
        } catch (Throwable ignored) {}
        if (empty(n)) n = u.getLastPathSegment();
        if (empty(n)) n = "Media";
        int dot = n.lastIndexOf('.');
        if (dot > 0 && n.length() - dot <= 6) n = n.substring(0, dot);
        return n;
    }

    private void openFullPlayer() {
        if (handedOff || closing) return;
        handedOff = true;
        long pos = player != null ? Math.max(0, player.getCurrentPosition()) : 0;
        boolean playing = player != null && player.getPlayWhenReady() && !ended;
        Intent i = new Intent(this, MainActivity.class);
        i.setAction(Intent.ACTION_VIEW);
        i.setData(uri);
        i.setClipData(ClipData.newRawUri("", uri));
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("qp_pos", ended ? 0L : pos);
        i.putExtra("qp_play", playing || ended);
        releasePlayer();
        startActivity(i);
        finishQuickTask();
    }

    private void releasePlayer() {
        ui.removeCallbacks(tick);
        if (player != null) { try { player.release(); } catch (Throwable ignored) {} player = null; }
        // Thoát sheet mà không mở app chính: phát tiếp nhạc của app chính nếu trước đó đang phát
        if (!handedOff && mainWasPlaying && !mainResumed) {
            mainResumed = true;
            try { NativeAudio.play(); } catch (Throwable ignored) {}
        }
    }

    @Override
    public void onBackPressed() {
        dismissSheet();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Thoát khi đang ở sheet nhanh (nhấn Home/Đa nhiệm) -> dừng nhạc & dọn task sheet nhanh luôn (chỉ khi mở sang app chính mới chạy nền)
        if (!handedOff) {
            releasePlayer();
            if (!isFinishing()) finishQuickTask();
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (!handedOff && !isChangingConfigurations()) {
            releasePlayer();
            if (!isFinishing()) finishQuickTask();
        }
    }

    @Override
    protected void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }

    /** Thanh tua dạng sóng (MD3E): phần đã phát là sóng chuyển động khi đang phát, nút kéo là dấu gạch dọc bo tròn cố định theo trục Y giống WebView. */
    static class WavySeek extends View {
        interface L { void onSeek(float frac, boolean fin); }
        L listener;
        boolean dragging;
        private float prog, amp, phase;
        private boolean playing, seekable = true;
        private final Paint wave = new Paint(Paint.ANTI_ALIAS_FLAG), track = new Paint(Paint.ANTI_ALIAS_FLAG), thumb = new Paint(Paint.ANTI_ALIAS_FLAG), dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final RectF thumbRect = new RectF();
        private final ValueAnimator anim;
        private final float dens;

        WavySeek(Context c) {
            super(c);
            dens = c.getResources().getDisplayMetrics().density;
            QuickPlayActivity a = (QuickPlayActivity) c;
            wave.setStyle(Paint.Style.STROKE); wave.setStrokeCap(Paint.Cap.ROUND); wave.setStrokeWidth(4 * dens); wave.setColor(a.cPrimary);
            track.setStyle(Paint.Style.STROKE); track.setStrokeCap(Paint.Cap.ROUND); track.setStrokeWidth(4 * dens); track.setColor(a.cTrack);
            thumb.setStyle(Paint.Style.FILL); thumb.setColor(a.cPrimary);
            dot.setColor(a.cPrimary);
            anim = ValueAnimator.ofFloat(0f, 1f);
            anim.setDuration(1600);
            anim.setRepeatCount(ValueAnimator.INFINITE);
            anim.setInterpolator(new android.view.animation.LinearInterpolator());
            anim.addUpdateListener(an -> {
                phase = -(float) an.getAnimatedValue() * (float) (Math.PI * 2);
                float target = (playing || dragging) ? 3f * dens : 0f;
                amp += (target - amp) * 0.12f;
                invalidate();
            });
        }

        @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); anim.start(); }
        @Override protected void onDetachedFromWindow() { anim.cancel(); super.onDetachedFromWindow(); }

        void setProgress(float p) { prog = p; invalidate(); }
        void setPlaying(boolean p) { playing = p; }
        void setSeekable(boolean sk) {
            if (seekable != sk) {
                seekable = sk;
                setAlpha(sk ? 1f : 0.45f);
                invalidate();
            }
        }

        @Override protected void onDraw(Canvas cv) {
            float w = getWidth(), h = getHeight(), cy = h / 2f;
            float padX = 8 * dens;
            float x0 = padX, x1 = w - padX;
            float px = x0 + (x1 - x0) * Math.max(0f, Math.min(1f, prog));
            float wl = 24 * dens;
            float barW = (dragging ? 5.5f : 4.5f) * dens;
            float barH = (dragging ? 26f : 22f) * dens;
            float gap = barW * 0.5f + 4 * dens;
            float waveEnd = Math.max(x0, px - gap);
            path.reset();
            path.moveTo(x0, cy);
            for (float x = x0; x <= waveEnd; x += 2f) {
                float fade = Math.min(1f, (x - x0) / (12 * dens));   // sóng nở dần từ đầu thanh
                path.lineTo(x, cy + amp * fade * (float) Math.sin((x / wl) * 2 * Math.PI + phase));
            }
            if (waveEnd > x0) cv.drawPath(path, wave);
            if (px + gap < x1) cv.drawLine(px + gap, cy, x1, cy, track);
            dot.setColor(wave.getColor());
            cv.drawCircle(x1, cy, 2 * dens, dot);
            // Dấu gạch dọc bo tròn cố định tại cy (không nhấp nhô theo trục Y)
            thumbRect.set(px - barW * 0.5f, cy - barH * 0.5f, px + barW * 0.5f, cy + barH * 0.5f);
            cv.drawRoundRect(thumbRect, barW * 0.5f, barW * 0.5f, thumb);
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            if (!seekable) return false;
            float padX = 8 * dens;
            float frac = (e.getX() - padX) / Math.max(1f, getWidth() - 2 * padX);
            frac = Math.max(0f, Math.min(1f, frac));
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    getParent().requestDisallowInterceptTouchEvent(true);
                    dragging = true; prog = frac;
                    if (listener != null) listener.onSeek(frac, false);
                    invalidate();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    prog = frac;
                    if (listener != null) listener.onSeek(frac, false);
                    invalidate();
                    return true;
                case MotionEvent.ACTION_UP:
                    prog = frac; dragging = false;
                    if (listener != null) listener.onSeek(frac, true);
                    invalidate();
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    dragging = false;
                    invalidate();
                    return true;
            }
            return super.onTouchEvent(e);
        }
    }
}
