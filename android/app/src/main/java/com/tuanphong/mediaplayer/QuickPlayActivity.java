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
import android.view.WindowManager;
import android.view.animation.AccelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
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
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
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
    private ImageView art, artNote, btnPlayIcon, btnInfoIcon;
    private View btnPlay, btnPrev, btnNext, btnInfo, card;
    private LinearLayout playerPane, infoList;
    private ScrollView infoScroll;
    private long fallbackDur = 0;
    private boolean mainChecked = false, mainWasPlaying = false, mainResumed = false;
    private boolean vi, dark, handedOff = false, ended = false, closing = false, cueRebuilt = false, infoOpen = false;
    private String metaTitle = "", metaArtist = "", metaAlbum = "", metaComposer = "", metaYear = "";
    private String metaMime = "", metaExt = "", metaPath = "", metaRealFmt = "", metaFmtShort = "";
    private boolean metaExtMismatch = false;
    private long metaSize = -1L, metaModified = 0L;
    private int metaSampleRate = 0, metaBitrateKbps = 0;
    private Typeface gsfRegular, gsfBold, gsfRoundedBold;
    private boolean prefDyn = false, prefGlass = false;   // "Đổi màu theo Album Art" và "Kính mờ (Blur)" lấy từ cài đặt trong app
    private View handleView, artBoxView;
    private ValueAnimator backdropAnim;
    private float backdropT = 0f;
    private Object backCallback;

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
        setupBackCallback();
        buildUi();
        ensureGoogleSansFlexAsync();
        initPlayer();
        loadMetaAsync();
    }

    private void setupBackCallback() {
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            android.window.OnBackInvokedCallback cb = () -> {
                if (infoOpen) toggleInfo(false);
                else dismissSheet();
            };
            backCallback = cb;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
        } catch (Throwable ignored) { backCallback = null; }
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
        cueRebuilt = false;
        toggleInfo(false);
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
        try {
            String js = appSp.getString("qp_prefs", "");
            if (!js.isEmpty()) {
                org.json.JSONObject o = new org.json.JSONObject(js);
                prefDyn = o.optBoolean("dyn", false);
                prefGlass = o.optBoolean("glass", false);
                String mode = o.optString("mode", "");
                if (!mode.isEmpty()) dark = "dark".equals(mode);
                org.json.JSONObject pal = o.optJSONObject("pal");
                if (pal != null) {
                    applyPalette(new int[] {
                            Color.parseColor(pal.getString("primary")), Color.parseColor(pal.getString("onPrimary")),
                            Color.parseColor(pal.getString("primaryContainer")), Color.parseColor(pal.getString("onPrimaryContainer")),
                            Color.parseColor(pal.getString("secondaryContainer")), Color.parseColor(pal.getString("surface")),
                            Color.parseColor(pal.getString("onSurface")), Color.parseColor(pal.getString("surfaceVariant")),
                            Color.parseColor(pal.getString("onSurfaceVariant"))
                    });
                    return;
                }
            }
        } catch (Throwable ignored) {}
        pickColorsLegacy(appSp);
    }

    /** pal = {primary, onPrimary, primaryContainer, onPrimaryContainer, secondaryContainer, surface, onSurface, surfaceVariant, onSurfaceVariant} */
    private void applyPalette(int[] p) {
        cPrimary = p[0]; cOnOpenBtn = p[1]; cPlayBtn = p[2]; cOnPlayBtn = p[3]; cSecBtn = p[4];
        cSurface = dark ? blendColors(p[5], 0xFFFFFFFF, 0.05f) : p[5];
        cOnSurface = p[6]; cTrack = p[7]; cOnVariant = p[8];
        cOnSecBtn = p[6]; cOpenBtn = p[0]; cArtBg = p[7];
    }

    // --- Bảng màu từ ảnh bìa: cùng thuật toán HSL với buildPaletteFromHex của WebView ---
    private static float[] rgbToHsl(int c) {
        float r = Color.red(c) / 255f, g = Color.green(c) / 255f, b = Color.blue(c) / 255f;
        float mx = Math.max(r, Math.max(g, b)), mn = Math.min(r, Math.min(g, b));
        float l = (mx + mn) / 2f, h = 0, s = 0, d = mx - mn;
        if (d > 1e-6f) {
            s = l > 0.5f ? d / (2f - mx - mn) : d / (mx + mn);
            if (mx == r) h = ((g - b) / d + (g < b ? 6 : 0));
            else if (mx == g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60f;
        }
        return new float[] { h, s, l };
    }

    private static int hslToColor(float h, float s, float l) {
        s = Math.max(0f, Math.min(1f, s)); l = Math.max(0f, Math.min(1f, l));
        float c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60f) % 2 - 1)), m = l - c / 2f;
        float r, g, b;
        if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
        return Color.rgb(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
    }

    private int[] paletteFromColor(int base, boolean dk) {
        float[] hsl = rgbToHsl(base);
        float h = hsl[0], s0 = hsl[1];
        float sp = s0 < 0.12f ? s0 : Math.max(0.3f, Math.min(0.9f, s0));
        float sn = Math.min(0.14f, s0 * 0.3f), sm = Math.min(0.28f, s0 * 0.5f);
        if (dk) {
            return new int[] { hslToColor(h, sp, 0.80f), hslToColor(h, sp, 0.20f), hslToColor(h, sp, 0.30f), hslToColor(h, sp, 0.90f),
                    hslToColor(h, sm, 0.23f), hslToColor(h, sn, 0.105f), hslToColor(h, sn, 0.90f), hslToColor(h, sn, 0.29f), hslToColor(h, sn, 0.80f) };
        }
        return new int[] { hslToColor(h, sp, 0.40f), 0xFFFFFFFF, hslToColor(h, Math.min(1f, sp + 0.1f), 0.90f), hslToColor(h, sp, 0.14f),
                hslToColor(h, Math.min(0.5f, sm + 0.2f), 0.89f), hslToColor(h, Math.min(1f, sn + 0.3f), 0.98f), hslToColor(h, sn, 0.11f),
                hslToColor(h, Math.min(0.3f, sn + 0.1f), 0.90f), hslToColor(h, sn, 0.29f) };
    }

    /** Màu chủ đạo của ảnh bìa: gom theo 24 dải màu, ưu tiên màu đậm/sáng vừa phải (bỏ gần-trắng/gần-đen/xám). */
    private static int dominantColor(Bitmap bmp) {
        Bitmap sm = Bitmap.createScaledBitmap(bmp, 48, 48, true);
        double[] w = new double[24], rr = new double[24], gg = new double[24], bb = new double[24];
        double tr = 0, tg = 0, tb = 0; int tn = 0;
        for (int y = 0; y < 48; y++) for (int x = 0; x < 48; x++) {
            int c = sm.getPixel(x, y);
            if (Color.alpha(c) < 128) continue;
            tr += Color.red(c); tg += Color.green(c); tb += Color.blue(c); tn++;
            float[] hsl = rgbToHsl(c);
            double wt = hsl[1] * (1.0 - Math.abs(2 * hsl[2] - 1.0));
            if (hsl[2] < 0.1f || hsl[2] > 0.92f) wt *= 0.1;
            int bin = Math.min(23, (int) (hsl[0] / 15f));
            w[bin] += wt; rr[bin] += Color.red(c) * wt; gg[bin] += Color.green(c) * wt; bb[bin] += Color.blue(c) * wt;
        }
        if (sm != bmp) sm.recycle();
        int best = 0;
        for (int i = 1; i < 24; i++) if (w[i] > w[best]) best = i;
        if (w[best] > 0.5) return Color.rgb((int) (rr[best] / w[best]), (int) (gg[best] / w[best]), (int) (bb[best] / w[best]));
        if (tn > 0) return Color.rgb((int) (tr / tn), (int) (tg / tn), (int) (tb / tn));
        return 0xFF808080;
    }

    /** Gán lại toàn bộ màu cho các view đã dựng (dùng sau khi lấy màu từ ảnh bìa). */
    private void recolor() {
        if (card == null) return;
        card.setBackground(round(cSurface, 36));
        if (handleView != null) handleView.setBackground(round(cTrack, 4));
        if (artBoxView != null) artBoxView.setBackground(round(cArtBg, 22));
        tvTitle.setTextColor(cOnSurface);
        tvArtist.setTextColor(cOnVariant); tvAlbum.setTextColor(cOnVariant);
        tvPos.setTextColor(cOnVariant); tvDur.setTextColor(cOnVariant);
        btnPrev.setBackground(round(cSecBtn, 38)); ((ImageView) ((FrameLayout) btnPrev).getChildAt(0)).setColorFilter(cOnSecBtn);
        btnNext.setBackground(round(cSecBtn, 38)); ((ImageView) ((FrameLayout) btnNext).getChildAt(0)).setColorFilter(cOnSecBtn);
        btnPlayIcon.setColorFilter(cOnPlayBtn);
        syncPlayIcon();
        btnOpen.setBackground(round(cOpenBtn, 28)); btnOpen.setTextColor(cOnOpenBtn);
        syncInfoButton();
        if (infoOpen) renderInfoCards();
        seek.recolor(cPrimary, cTrack);
    }

    private void pickColorsLegacy(SharedPreferences appSp) {
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
        if (infoOpen) renderInfoCards();
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

        // Tay nắm (giữa) + nút Info (góc phải trên)
        View handle = new View(this);
        handle.setBackground(round(cTrack, 4));
        handleView = handle;
        FrameLayout handleBox = new FrameLayout(this);
        handleBox.addView(handle, new FrameLayout.LayoutParams(dp(36), dp(4), Gravity.CENTER));
        FrameLayout infoBtnWrap = new FrameLayout(this);
        infoBtnWrap.setClickable(true);
        infoBtnWrap.setContentDescription(vi ? "Thông tin" : "Info");
        btnInfoIcon = new ImageView(this);
        btnInfoIcon.setImageResource(R.drawable.ic_qp_info);
        infoBtnWrap.addView(btnInfoIcon, new FrameLayout.LayoutParams(dp(20), dp(20), Gravity.CENTER));
        btnInfo = infoBtnWrap;
        syncInfoButton();
        btnInfo.setOnClickListener(v -> toggleInfo(!infoOpen));
        handleBox.addView(btnInfo, new FrameLayout.LayoutParams(dp(34), dp(34), Gravity.END | Gravity.CENTER_VERTICAL));
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(36));
        hlp.bottomMargin = dp(4);
        col.addView(handleBox, hlp);
        attachDragToDismiss(handleBox);

        // Hàng ảnh bìa + chữ
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        col.addView(row, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout artBox = new FrameLayout(this);
        artBox.setBackground(round(cArtBg, 22));
        artBoxView = artBox;
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

        // Khối điều khiển phát (ẩn khi mở bảng Thông tin)
        playerPane = new LinearLayout(this);
        playerPane.setOrientation(LinearLayout.VERTICAL);
        col.addView(playerPane, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Thanh tua dạng sóng (dấu gạch dọc đứng yên theo trục Y giống WebView)
        seek = new WavySeek(this);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(36));
        slp.topMargin = dp(18);
        playerPane.addView(seek, slp);
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
        playerPane.addView(times, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Điều khiển
        LinearLayout ctr = new LinearLayout(this);
        ctr.setOrientation(LinearLayout.HORIZONTAL);
        ctr.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams ctrLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(76));
        ctrLp.topMargin = dp(20);
        playerPane.addView(ctr, ctrLp);

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
        playerPane.addView(btnOpen, olp);

        // Khối Thông tin (thẻ nhóm bo góc MD3 Expressive giống tab INFO của Media Player)
        infoScroll = new ScrollView(this);
        infoScroll.setVerticalScrollBarEnabled(false);
        infoScroll.setVisibility(View.GONE);
        infoList = new LinearLayout(this);
        infoList.setOrientation(LinearLayout.VERTICAL);
        infoScroll.addView(infoList, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        int maxInfoH = Math.min(dp(380), Math.round(getResources().getDisplayMetrics().heightPixels * 0.52f));
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, maxInfoH);
        ilp.topMargin = dp(16);
        col.addView(infoScroll, ilp);

        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, wi) -> {
            Insets bars = wi.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return wi;
        });
        card.setTranslationY(dp(80));
        card.setAlpha(0f);
        card.animate().translationY(0).alpha(1f).setDuration(240).setInterpolator(new DecelerateInterpolator()).start();
        animateBackdrop(true, 260);
    }

    /** Nền phía sau sheet: bật "Kính mờ (Blur)" thì làm mờ ứng dụng bên dưới, tắt thì làm tối. Mở/đóng đều fade. */
    private boolean blurSupported() {
        if (Build.VERSION.SDK_INT < 31 || !prefGlass) return false;
        try {
            WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
            return wm.isCrossWindowBlurEnabled();
        } catch (Throwable t) { return false; }
    }

    private void animateBackdrop(final boolean in, long dur) {
        final boolean blur = blurSupported();
        final float to = in ? 1f : 0f;
        if (backdropAnim != null) backdropAnim.cancel();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        final int radius = dp(28);
        backdropAnim = ValueAnimator.ofFloat(backdropT, to);
        backdropAnim.setDuration(dur);
        backdropAnim.setInterpolator(new android.view.animation.LinearInterpolator());
        backdropAnim.addUpdateListener(a -> {
            backdropT = (float) a.getAnimatedValue();
            try {
                if (blur) {
                    getWindow().setBackgroundBlurRadius(Math.round(radius * backdropT));
                    getWindow().setDimAmount(0.18f * backdropT);
                } else {
                    getWindow().setDimAmount(0.5f * backdropT);
                }
            } catch (Throwable ignored) {}
        });
        backdropAnim.start();
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
        animateBackdrop(false, 210);
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
                if (st == Player.STATE_READY && player != null && !player.isCurrentMediaItemSeekable() && !cueRebuilt) {
                    cueRebuilt = true;
                    final Uri src = uri;
                    final Context ctx = getApplicationContext();
                    new Thread(() -> {
                        Uri fixed = WebmCueIndexer.ensureSeekable(ctx, src);
                        if (fixed == null) return;
                        ui.post(() -> {
                            if (isDestroyed() || closing || player == null || !src.equals(uri)) return;
                            if (player.isCurrentMediaItemSeekable()) return;
                            long pos = Math.max(0L, player.getCurrentPosition());
                            boolean wasPlaying = player.getPlayWhenReady();
                            player.setMediaItem(MediaItem.fromUri(fixed), pos);
                            player.prepare();
                            player.setPlayWhenReady(wasPlaying);
                        });
                    }, "qp-webm-cues").start();
                }
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

    private void syncInfoButton() {
        if (btnInfo == null || btnInfoIcon == null) return;
        btnInfo.setBackground(round(infoOpen ? cPlayBtn : cSecBtn, 18));
        btnInfoIcon.setImageResource(infoOpen ? R.drawable.ic_qp_back : R.drawable.ic_qp_info);
        btnInfoIcon.setColorFilter(infoOpen ? cOnPlayBtn : cOnSecBtn);
    }

    private void toggleInfo(boolean show) {
        if (infoOpen == show) return;
        infoOpen = show;
        syncInfoButton();
        if (playerPane != null) playerPane.setVisibility(show ? View.GONE : View.VISIBLE);
        if (infoScroll != null) {
            infoScroll.setVisibility(show ? View.VISIBLE : View.GONE);
            if (show) {
                renderInfoCards();
                infoScroll.scrollTo(0, 0);
            }
        }
    }

    private GradientDrawable round4(int color, float tlDp, float trDp, float brDp, float blDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        float tl = dp(tlDp), tr = dp(trDp), br = dp(brDp), bl = dp(blDp);
        g.setCornerRadii(new float[]{tl, tl, tr, tr, br, br, bl, bl});
        return g;
    }

    private void renderInfoCards() {
        if (infoList == null) return;
        infoList.removeAllViews();
        String unknown = vi ? "Không rõ" : "Unknown";
        List<String[]> rows = new ArrayList<>();

        // 1. Định dạng tệp & dung lượng
        String fileLabel = !empty(metaMime) ? metaMime : ((vi ? "Tệp" : "File") + (empty(metaExt) ? "" : " ." + metaExt.toUpperCase(Locale.US)));
        String sizeVal = metaSize >= 0
                ? String.format(vi ? new Locale("vi", "VN") : Locale.US, "%.2f MB", metaSize / (1024.0 * 1024.0))
                : unknown;
        rows.add(new String[]{fileLabel, sizeVal});

        // 2. Định dạng theo cấu trúc tệp
        StringBuilder structSb = new StringBuilder(!empty(metaRealFmt) ? metaRealFmt : unknown);
        if (metaExtMismatch && !empty(metaExt)) {
            structSb.append(" • ").append(vi ? ("khác đuôi ." + metaExt) : ("differs from ." + metaExt));
        }
        if (player != null && !player.isCurrentMediaItemSeekable()) {
            structSb.append(" • ").append(vi ? "Không hỗ trợ tua" : "Unseekable");
        }
        rows.add(new String[]{vi ? "Định dạng theo cấu trúc tệp" : "Format by file structure", structSb.toString()});

        // 3. File Path
        if (!empty(metaPath)) {
            rows.add(new String[]{"File Path", metaPath});
        }

        // 4. Chất lượng âm thanh
        if (metaSampleRate > 0 || metaBitrateKbps > 0) {
            List<String> qParts = new ArrayList<>();
            if (metaSampleRate > 0) {
                double khz = metaSampleRate / 1000.0;
                qParts.add((khz == Math.floor(khz) ? String.format(Locale.US, "%.0f", khz) : String.format(Locale.US, "%.1f", khz)) + " kHz");
            }
            if (metaBitrateKbps > 0) qParts.add(metaBitrateKbps + " kbps");
            if (!empty(metaFmtShort)) qParts.add(metaFmtShort);
            rows.add(new String[]{vi ? "Chất lượng âm thanh" : "Audio quality", TextUtils.join(" • ", qParts)});
        }

        // 5. Ngày sửa đổi
        if (metaModified > 0) {
            String modStr = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT,
                    vi ? new Locale("vi", "VN") : Locale.US).format(new Date(metaModified));
            rows.add(new String[]{vi ? "Ngày sửa đổi" : "Date modified", modStr});
        }

        // 6. Thời lượng
        rows.add(new String[]{vi ? "Thời lượng" : "Duration", fmt(durationMs())});

        // 7. Metadata bài hát
        rows.add(new String[]{vi ? "Tên bài hát" : "Title", !empty(metaTitle) ? metaTitle : unknown});
        rows.add(new String[]{vi ? "Nghệ sĩ" : "Artist", !empty(metaArtist) ? metaArtist : unknown});
        rows.add(new String[]{vi ? "Đĩa nhạc" : "Album", !empty(metaAlbum) ? metaAlbum : unknown});
        rows.add(new String[]{vi ? "Nhà soạn nhạc" : "Composer", !empty(metaComposer) ? metaComposer : unknown});
        if (!empty(metaYear)) {
            rows.add(new String[]{vi ? "Năm" : "Year", metaYear});
        }

        int cardBg = blendColors(cSurface, cTrack, 0.42f);
        int count = rows.size();
        for (int i = 0; i < count; i++) {
            String[] pair = rows.get(i);
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.VERTICAL);
            item.setPadding(dp(18), dp(13), dp(18), dp(13));
            float topR = (i == 0) ? 22f : 6f;
            float botR = (i == count - 1) ? 22f : 6f;
            item.setBackground(round4(cardBg, topR, topR, botR, botR));

            TextView lbl = text(14, cOnSurface, true, false);
            lbl.setText(pair[0]);
            TextView val = text(13, cOnVariant, false, false);
            val.setText(pair[1]);
            val.setTextIsSelectable(true);
            LinearLayout.LayoutParams vlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            vlp.topMargin = dp(2);

            item.addView(lbl);
            item.addView(val, vlp);

            LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            if (i > 0) rlp.topMargin = dp(3);
            infoList.addView(item, rlp);
        }
    }

    private void loadMetaAsync() {
        final Uri u = uri;
        final Context ctx = getApplicationContext();
        final String fallbackTitle = displayName(u);
        tvTitle.setText(fallbackTitle);
        tvArtist.setText(vi ? "Không rõ nghệ sĩ" : "Unknown Artist");
        tvAlbum.setText(vi ? "Không rõ album" : "Unknown Album");
        metaTitle = fallbackTitle; metaArtist = ""; metaAlbum = ""; metaComposer = ""; metaYear = "";
        metaMime = ""; metaExt = ""; metaPath = ""; metaRealFmt = ""; metaFmtShort = "";
        metaExtMismatch = false; metaSize = -1L; metaModified = 0L; metaSampleRate = 0; metaBitrateKbps = 0;
        new Thread(() -> {
            String title = null, artist = null, album = null, composer = null, year = null, mime = null;
            long dur = 0, size = -1L, mod = 0L;
            int sr = 0, kbps = 0;
            Bitmap bmp = null;

            String fullName = null;
            try (Cursor c = ctx.getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    fullName = c.getString(0);
                    int sIdx = c.getColumnIndex(OpenableColumns.SIZE);
                    if (sIdx >= 0 && !c.isNull(sIdx)) size = c.getLong(sIdx);
                }
            } catch (Throwable ignored) {}
            String pathStr = "";
            if ("file".equalsIgnoreCase(u.getScheme()) && u.getPath() != null) {
                File f = new File(u.getPath());
                pathStr = f.getAbsolutePath();
                if (size < 0 && f.isFile()) size = f.length();
                if (f.isFile()) mod = f.lastModified();
                if (empty(fullName)) fullName = f.getName();
            } else {
                pathStr = u.toString();
            }
            String ext = "";
            if (!empty(fullName)) {
                int dot = fullName.lastIndexOf('.');
                if (dot > 0 && dot < fullName.length() - 1) ext = fullName.substring(dot + 1).toLowerCase(Locale.US);
            }
            try { mime = ctx.getContentResolver().getType(u); } catch (Throwable ignored) {}

            MediaMetadataRetriever r = new MediaMetadataRetriever();
            try {
                r.setDataSource(ctx, u);
                title = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE);
                artist = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
                if (empty(artist)) artist = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST);
                album = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM);
                composer = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_COMPOSER);
                if (empty(composer)) composer = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_WRITER);
                year = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_YEAR);
                if (empty(year)) {
                    String dt = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE);
                    if (dt != null && dt.trim().length() >= 4) year = dt.trim().substring(0, 4);
                }
                if (empty(mime)) mime = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE);
                String ds = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                if (ds != null) dur = Long.parseLong(ds.trim());
                String brs = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE);
                if (brs != null) {
                    int bVal = Integer.parseInt(brs.trim());
                    if (bVal > 0) kbps = Math.round(bVal / 1000f);
                }
                if (Build.VERSION.SDK_INT >= 31) {
                    String srs = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_SAMPLERATE);
                    if (srs != null) sr = Integer.parseInt(srs.trim());
                }
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

            // Đọc header tệp để nhận diện định dạng theo cấu trúc thật
            String realFmt = "";
            String fmtShort = ext.toUpperCase(Locale.US);
            boolean mismatch = false;
            try (InputStream in = ctx.getContentResolver().openInputStream(u)) {
                if (in != null) {
                    byte[] head = new byte[65536];
                    int read = 0, n;
                    while (read < head.length && (n = in.read(head, read, head.length - read)) > 0) read += n;
                    if (read >= 12) {
                        String s0 = new String(head, 0, Math.min(read, 16), java.nio.charset.StandardCharsets.ISO_8859_1);
                        if ((head[0] & 0xFF) == 0x1A && (head[1] & 0xFF) == 0x45 && (head[2] & 0xFF) == 0xDF && (head[3] & 0xFF) == 0xA3) {
                            String txt = new String(head, 0, Math.min(read, 16384), java.nio.charset.StandardCharsets.ISO_8859_1);
                            boolean isWebm = txt.toLowerCase(Locale.US).contains("webm");
                            String cont = isWebm ? "WebM" : "Matroska (MKV/MKA)";
                            String codec = "";
                            if (txt.contains("A_OPUS")) { codec = "Opus"; if (sr <= 0) sr = 48000; }
                            else if (txt.contains("A_VORBIS")) codec = "Vorbis";
                            else if (txt.contains("A_AAC")) codec = "AAC";
                            else if (txt.contains("A_MPEG/L3")) codec = "MP3";
                            else if (txt.contains("A_FLAC")) codec = "FLAC";
                            else if (txt.contains("A_PCM")) codec = "PCM";
                            fmtShort = isWebm ? "WEBM" : "MKA";
                            realFmt = codec.isEmpty() ? cont : (cont + " (" + codec + ")");
                            mismatch = !empty(ext) && !(ext.equals("webm") || ext.equals("weba") || ext.equals("mkv") || ext.equals("mka"));
                        } else if (s0.length() >= 8 && "ftyp".equals(s0.substring(4, 8))) {
                            String brand = s0.length() >= 12 ? s0.substring(8, 12).trim() : "";
                            boolean isM4a = "M4A".equalsIgnoreCase(brand) || "M4B".equalsIgnoreCase(brand);
                            String cont = isM4a ? "M4A (MP4)" : ("MP4 (" + (brand.isEmpty() ? "ISO" : brand) + ")");
                            String txt = new String(head, 0, read, java.nio.charset.StandardCharsets.ISO_8859_1);
                            String codec = "";
                            if (txt.contains("Opus") || txt.contains("dOps")) { codec = "Opus"; if (sr <= 0) sr = 48000; }
                            else if (txt.contains("alac")) codec = "ALAC";
                            else if (txt.contains("fLaC")) codec = "FLAC";
                            else if (txt.contains("mp4a")) codec = "AAC";
                            fmtShort = isM4a ? "M4A" : "MP4";
                            realFmt = codec.isEmpty() ? cont : (cont + " • " + codec);
                            mismatch = !empty(ext) && !(ext.equals("m4a") || ext.equals("mp4") || ext.equals("m4b") || ext.equals("aac") || ext.equals("3gp") || ext.equals("mov"));
                        } else if (s0.startsWith("RIFF") && s0.length() >= 12 && "WAVE".equals(s0.substring(8, 12))) {
                            fmtShort = "WAV"; realFmt = "WAV (RIFF/PCM)";
                            mismatch = !empty(ext) && !(ext.equals("wav") || ext.equals("wave"));
                        } else if (s0.startsWith("fLaC")) {
                            fmtShort = "FLAC"; realFmt = "FLAC (Lossless)";
                            if (sr <= 0 && read > 20) sr = ((head[18] & 0xFF) << 12) | ((head[19] & 0xFF) << 4) | ((head[20] & 0xFF) >> 4);
                            mismatch = !empty(ext) && !ext.equals("flac");
                        } else if (s0.startsWith("OggS")) {
                            String txt = new String(head, 0, Math.min(read, 400), java.nio.charset.StandardCharsets.ISO_8859_1);
                            if (txt.contains("OpusHead")) { fmtShort = "OPUS"; realFmt = "OGG (Opus)"; if (sr <= 0) sr = 48000; }
                            else if (txt.contains("vorbis")) { fmtShort = "OGG"; realFmt = "OGG (Vorbis)"; }
                            else { fmtShort = "OGG"; realFmt = "OGG"; }
                            mismatch = !empty(ext) && !(ext.equals("ogg") || ext.equals("opus") || ext.equals("oga"));
                        } else if (s0.startsWith("FORM") && s0.length() >= 12 && ("AIFF".equals(s0.substring(8, 12)) || "AIFC".equals(s0.substring(8, 12)))) {
                            fmtShort = "AIFF"; realFmt = "AIFF";
                            mismatch = !empty(ext) && !(ext.equals("aif") || ext.equals("aiff") || ext.equals("aifc"));
                        } else if ((head[0] & 0xFF) == 0x30 && (head[1] & 0xFF) == 0x26 && (head[2] & 0xFF) == 0xB2 && (head[3] & 0xFF) == 0x75) {
                            fmtShort = "WMA"; realFmt = "WMA (ASF)";
                            mismatch = !empty(ext) && !(ext.equals("wma") || ext.equals("asf"));
                        } else {
                            boolean hasId3 = s0.startsWith("ID3");
                            int off = hasId3 ? 10 + (((head[6] & 0x7F) << 21) | ((head[7] & 0x7F) << 14) | ((head[8] & 0x7F) << 7) | (head[9] & 0x7F)) : 0;
                            if (off < read - 4) {
                                for (int k = off; k < Math.min(read - 4, off + 8192); k++) {
                                    int b0 = head[k] & 0xFF, b1 = head[k + 1] & 0xFF, b2 = head[k + 2] & 0xFF;
                                    if (b0 == 0xFF && (b1 & 0xF6) == 0xF0) {
                                        fmtShort = "AAC"; realFmt = "AAC (ADTS)";
                                        mismatch = !empty(ext) && !(ext.equals("aac") || ext.equals("adts"));
                                        break;
                                    }
                                    if (b0 == 0xFF && (b1 & 0xE0) == 0xE0) {
                                        int ver = (b1 >> 3) & 3, layer = (b1 >> 1) & 3, bi = b2 >> 4, ri = (b2 >> 2) & 3;
                                        if (ver == 1 || layer == 0 || bi == 0 || bi == 15 || ri == 3) continue;
                                        String vName = ver == 3 ? "MPEG-1" : (ver == 2 ? "MPEG-2" : "MPEG-2.5");
                                        String lName = layer == 1 ? "Layer III" : (layer == 2 ? "Layer II" : "Layer I");
                                        fmtShort = layer == 1 ? "MP3" : (layer == 2 ? "MP2" : "MP1");
                                        realFmt = fmtShort + " (" + vName + " " + lName + ")";
                                        mismatch = !empty(ext) && !(ext.equals("mp3") || ext.equals("mp2") || ext.equals("mp1"));
                                        break;
                                    }
                                }
                            }
                            if (realFmt.isEmpty() && hasId3) {
                                fmtShort = "MP3"; realFmt = "MP3 (ID3)";
                                mismatch = !empty(ext) && !ext.equals("mp3");
                            }
                        }
                    }
                }
            } catch (Throwable ignored) {}
            if (kbps <= 0 && size > 0 && dur > 0) kbps = (int) Math.round((size * 8.0) / (dur / 1000.0) / 1000.0);

            final String ft = title, fa = artist, fl = album, fc = composer, fy = year, fm = mime;
            final String fExt = ext, fPath = pathStr, fRealFmt = realFmt, fFmtShort = fmtShort;
            final boolean fMismatch = mismatch;
            final long fd = dur, fSize = size, fMod = mod;
            final int fSr = sr, fKbps = kbps;
            final Bitmap fb = bmp;
            ui.post(() -> {
                if (isDestroyed() || !u.equals(uri)) return;
                if (!empty(ft)) tvTitle.setText(ft);
                if (!empty(fa)) tvArtist.setText(fa);
                if (!empty(fl)) tvAlbum.setText(fl);
                fallbackDur = fd;
                metaTitle = !empty(ft) ? ft : fallbackTitle;
                metaArtist = fa == null ? "" : fa;
                metaAlbum = fl == null ? "" : fl;
                metaComposer = fc == null ? "" : fc;
                metaYear = fy == null ? "" : fy;
                metaMime = fm == null ? "" : fm;
                metaExt = fExt;
                metaPath = fPath;
                metaRealFmt = fRealFmt;
                metaFmtShort = fFmtShort;
                metaExtMismatch = fMismatch;
                metaSize = fSize;
                metaModified = fMod;
                metaSampleRate = fSr;
                metaBitrateKbps = fKbps;
                if (fb != null && prefDyn) {
                    try { applyPalette(paletteFromColor(dominantColor(fb), dark)); recolor(); } catch (Throwable ignored) {}
                }
                if (fb != null) { art.setImageBitmap(fb); artNote.setVisibility(View.GONE); }
                else { art.setImageDrawable(null); artNote.setVisibility(View.VISIBLE); }
                if (infoOpen) renderInfoCards();
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
        if (infoOpen) toggleInfo(false);
        else dismissSheet();
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
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            try { getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback((android.window.OnBackInvokedCallback) backCallback); } catch (Throwable ignored) {}
            backCallback = null;
        }
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
                phase = (float) an.getAnimatedValue() * (float) (Math.PI * 2);
                float target = (playing || dragging) ? 3f * dens : 0f;
                amp += (target - amp) * 0.12f;
                invalidate();
            });
        }

        @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); anim.start(); }
        @Override protected void onDetachedFromWindow() { anim.cancel(); super.onDetachedFromWindow(); }

        void recolor(int primary, int trackColor) { wave.setColor(primary); thumb.setColor(primary); dot.setColor(primary); track.setColor(trackColor); invalidate(); }
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
