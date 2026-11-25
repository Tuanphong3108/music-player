package com.tuanphong.mediaplayer;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
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
import android.widget.Toast;

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
    private TextView tvTitle, tvArtist, tvAlbum, tvPos, tvDur, tvOpenBtn;
    private ImageView art, btnPlayIcon;
    private View btnPlay, btnPrev, btnNext, card;
    private long fallbackDur = 0;
    private boolean vi, dark, handedOff = false, ended = false, dismissing = false;
    private Typeface fontRegular, fontBold;

    // Bảng màu (khớp MD3 Expressive & đồng bộ accent color từ app)
    private int cSurface, cOnSurface, cOnVariant, cPrimary, cOnPrimary, cTrack, cSecBtn, cOnSecBtn, cPlayBtn, cOnPlayBtn, cOpenBtn, cOnOpenBtn, cArtBg;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        SharedPreferences sp = getSharedPreferences("app", MODE_PRIVATE);
        String savedLang = sp.getString("lang", "");
        if (!savedLang.isEmpty()) {
            vi = !"en".equalsIgnoreCase(savedLang);
        } else {
            vi = Locale.getDefault().getLanguage().equals("vi");
        }
        dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        pickColors(sp);
        loadGoogleSansFlexSync();
        uri = uriFrom(getIntent());
        if (uri == null) { finish(); return; }
        buildUi();
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
        dismissing = false;
        if (card != null) {
            card.animate().cancel();
            card.setTranslationY(0f);
            card.setAlpha(1f);
        }
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

    private void pickColors(SharedPreferences sp) {
        int savedBg = sp.getInt("widget_bg", 0);
        int savedAccent = sp.getInt("widget_accent", 0);
        if (savedBg != 0) {
            int bgOpaque = 0xFF000000 | (savedBg & 0x00FFFFFF);
            dark = luminance(bgOpaque) <= 0.62;
        }
        if (savedAccent != 0) {
            int acc = 0xFF000000 | (savedAccent & 0x00FFFFFF);
            cPrimary = acc;
            cOnPrimary = luminance(acc) > 0.55 ? 0xFF1C1B1F : 0xFFFFFFFF;
            cOpenBtn = acc;
            cOnOpenBtn = cOnPrimary;
            if (dark) {
                cSurface = savedBg != 0 ? (0xFF000000 | (savedBg & 0x00FFFFFF)) : blendColor(0xFF1C1B1F, acc, 0.08f);
                cOnSurface = 0xFFE6E1E5;
                cOnVariant = 0xFFCAC4D0;
                cTrack = blendColor(0xFF49454F, acc, 0.14f);
                cSecBtn = blendColor(0xFF332D41, acc, 0.22f);
                cOnSecBtn = 0xFFE6E1E5;
                cPlayBtn = blendColor(0xFF4F378B, acc, 0.45f);
                cOnPlayBtn = luminance(cPlayBtn) > 0.55 ? 0xFF1C1B1F : 0xFFFFFFFF;
                cArtBg = blendColor(0xFF2B2930, acc, 0.14f);
            } else {
                cSurface = savedBg != 0 ? (0xFF000000 | (savedBg & 0x00FFFFFF)) : blendColor(0xFFFEF7FF, acc, 0.05f);
                cOnSurface = 0xFF1D1B20;
                cOnVariant = 0xFF49454F;
                cTrack = blendColor(0xFFCACBD6, acc, 0.18f);
                cSecBtn = blendColor(0xFFE8DEF8, acc, 0.22f);
                cOnSecBtn = 0xFF1D1B20;
                cPlayBtn = blendColor(0xFFEADDFF, acc, 0.35f);
                cOnPlayBtn = luminance(cPlayBtn) > 0.55 ? 0xFF1D1B20 : 0xFFFFFFFF;
                cArtBg = blendColor(0xFFE7E0EB, acc, 0.16f);
            }
            return;
        }
        // Fallback nếu chưa lưu accent: dùng Dynamic Color của Android 12+ hoặc tím M3 mặc định
        if (Build.VERSION.SDK_INT >= 31) {
            try {
                if (dark) {
                    cSurface = getColor(android.R.color.system_neutral1_900);
                    cOnSurface = getColor(android.R.color.system_neutral1_100);
                    cOnVariant = getColor(android.R.color.system_neutral2_200);
                    cPrimary = getColor(android.R.color.system_accent1_200);
                    cOnPrimary = getColor(android.R.color.system_accent1_800);
                    cTrack = getColor(android.R.color.system_neutral2_700);
                    cSecBtn = getColor(android.R.color.system_accent2_700);
                    cOnSecBtn = getColor(android.R.color.system_accent2_100);
                    cPlayBtn = getColor(android.R.color.system_accent1_700);
                    cOnPlayBtn = getColor(android.R.color.system_accent1_100);
                    cOpenBtn = cPrimary;
                    cOnOpenBtn = cOnPrimary;
                    cArtBg = getColor(android.R.color.system_neutral2_800);
                } else {
                    cSurface = getColor(android.R.color.system_neutral1_50);
                    cOnSurface = getColor(android.R.color.system_neutral1_900);
                    cOnVariant = getColor(android.R.color.system_neutral2_700);
                    cPrimary = getColor(android.R.color.system_accent1_600);
                    cOnPrimary = 0xFFFFFFFF;
                    cTrack = getColor(android.R.color.system_neutral2_200);
                    cSecBtn = getColor(android.R.color.system_accent2_100);
                    cOnSecBtn = getColor(android.R.color.system_accent2_900);
                    cPlayBtn = getColor(android.R.color.system_accent1_100);
                    cOnPlayBtn = getColor(android.R.color.system_accent1_900);
                    cOpenBtn = cPrimary;
                    cOnOpenBtn = cOnPrimary;
                    cArtBg = getColor(android.R.color.system_neutral2_100);
                }
                return;
            } catch (Throwable ignored) {}
        }
        if (dark) {
            cSurface = 0xFF1C1B1F; cOnSurface = 0xFFE6E1E5; cOnVariant = 0xFFCAC4D0; cPrimary = 0xFFD0BCFF; cOnPrimary = 0xFF381E72; cTrack = 0xFF49454F;
            cSecBtn = 0xFF332D41; cOnSecBtn = 0xFFEADDFF; cPlayBtn = 0xFF4F378B; cOnPlayBtn = 0xFFEADDFF; cOpenBtn = 0xFFD0BCFF; cOnOpenBtn = 0xFF381E72; cArtBg = 0xFF2B2930;
        } else {
            cSurface = 0xFFFEF7FF; cOnSurface = 0xFF1D1B20; cOnVariant = 0xFF49454F; cPrimary = 0xFF6750A4; cOnPrimary = 0xFFFFFFFF; cTrack = 0xFFE7E0EB;
            cSecBtn = 0xFFE8DEF8; cOnSecBtn = 0xFF1D1B20; cPlayBtn = 0xFFEADDFF; cOnPlayBtn = 0xFF21005D; cOpenBtn = 0xFF6750A4; cOnOpenBtn = 0xFFFFFFFF; cArtBg = 0xFFE7E0EB;
        }
    }

    private static double luminance(int c) {
        return (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255.0;
    }

    private static int blendColor(int base, int tint, float ratio) {
        float inv = 1f - ratio;
        int r = Math.round(Color.red(base) * inv + Color.red(tint) * ratio);
        int g = Math.round(Color.green(base) * inv + Color.green(tint) * ratio);
        int b = Math.round(Color.blue(base) * inv + Color.blue(tint) * ratio);
        return Color.rgb(Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b)));
    }

    private void loadGoogleSansFlexSync() {
        try {
            File fontDir = new File(getCacheDir(), "fonts");
            if (!fontDir.exists()) fontDir.mkdirs();
            File regFile = new File(fontDir, "GoogleSansFlex-Regular.ttf");
            if (regFile.exists() && regFile.length() > 1024) {
                fontRegular = Typeface.createFromFile(regFile);
                fontBold = Typeface.create(fontRegular, Typeface.BOLD);
                return;
            }
            new Thread(() -> {
                HttpURLConnection conn = null;
                InputStream in = null;
                FileOutputStream out = null;
                try {
                    HttpURLConnection cssConn = (HttpURLConnection) new URL(
                            "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400;700").openConnection();
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
                        Typeface tf = Typeface.createFromFile(regFile);
                        Typeface boldTf = Typeface.create(tf, Typeface.BOLD);
                        ui.post(() -> {
                            fontRegular = tf;
                            fontBold = boldTf;
                            refreshFontsOnUi();
                        });
                    }
                } catch (Throwable ignored) {
                } finally {
                    try { if (out != null) out.close(); } catch (Exception ignored) {}
                    try { if (in != null) in.close(); } catch (Exception ignored) {}
                    try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
                }
            }, "qp-font").start();
        } catch (Throwable ignored) {}
    }

    private void applyFont(TextView tv, boolean bold, boolean rounded) {
        if (tv == null) return;
        Typeface tf = bold ? fontBold : fontRegular;
        if (tf != null) {
            tv.setTypeface(tf, bold ? Typeface.BOLD : Typeface.NORMAL);
        } else if (bold) {
            tv.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        }
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                tv.setFontVariationSettings(rounded ? "'ROND' 100" : "'ROND' 0");
            } catch (Throwable ignored) {}
        }
    }

    private void refreshFontsOnUi() {
        applyFont(tvTitle, true, true);
        applyFont(tvArtist, false, false);
        applyFont(tvAlbum, false, false);
        applyFont(tvPos, false, false);
        applyFont(tvDur, false, false);
        applyFont(tvOpenBtn, true, true);
    }

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    private GradientDrawable round(int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private void showDefaultArtwork() {
        if (art == null) return;
        art.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int pad = dp(18);
        art.setPadding(pad, pad, pad, pad);
        art.setImageResource(R.drawable.ic_music_note);
    }

    private void showCoverBitmap(Bitmap bmp) {
        if (art == null) return;
        art.setPadding(0, 0, 0, 0);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);
        art.setImageBitmap(bmp);
    }

    private void buildUi() {
        final FrameLayout root = new FrameLayout(this);
        root.setOnClickListener(v -> dismissSheet());   // chạm ra ngoài sheet = dừng nhạc & trượt xuống đóng

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

        // Tay nắm: kéo xuống để dừng nhạc & đóng
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
        showDefaultArtwork();
        artBox.addView(art, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
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
        tvAlbum = text(14, cOnVariant, false, false);
        tvAlbum.setSingleLine(true);
        tvAlbum.setEllipsize(TextUtils.TruncateAt.END);
        texts.addView(tvTitle);
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        alp.topMargin = dp(6);
        texts.addView(tvArtist, alp);
        texts.addView(tvAlbum);

        // Thanh tua dạng sóng + nút kéo gạch dọc cố định trục Y
        seek = new WavySeek(this);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(36));
        slp.topMargin = dp(18);
        col.addView(seek, slp);
        seek.listener = (frac, fin) -> {
            if (player != null && !player.isCurrentMediaItemSeekable()) {
                if (fin) {
                    Toast.makeText(this, vi ? "Tệp này không hỗ trợ tua" : "This file does not support seeking", Toast.LENGTH_SHORT).show();
                }
                return;
            }
            long d = durationMs();
            if (d <= 0) return;
            long pos = (long) (frac * d);
            tvPos.setText(fmt(pos));
            if (fin && player != null) { player.seekTo(pos); ended = false; }
        };

        LinearLayout times = new LinearLayout(this);
        times.setOrientation(LinearLayout.HORIZONTAL);
        tvPos = text(14, cOnVariant, false, false);
        tvDur = text(14, cOnVariant, false, false);
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

        // Nút mở app chính (bo tròn font ROND 100 + đồng bộ accent color)
        tvOpenBtn = text(17, cOnOpenBtn, true, true);
        tvOpenBtn.setText(vi ? "Mở trình phát đầy đủ" : "Open full player");
        tvOpenBtn.setGravity(Gravity.CENTER);
        tvOpenBtn.setBackground(round(cOpenBtn, 28));
        tvOpenBtn.setOnClickListener(v -> openFullPlayer());
        LinearLayout.LayoutParams olp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(58));
        olp.topMargin = dp(20);
        col.addView(tvOpenBtn, olp);

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
        applyFont(t, bold, rounded);
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

    private void dismissSheet() {
        if (dismissing) return;
        dismissing = true;
        releasePlayer();
        if (card == null) {
            finish();
            overridePendingTransition(0, 0);
            return;
        }
        float slideDist = card.getHeight() > 0 ? card.getHeight() + dp(40) : dp(360);
        card.animate()
                .translationY(slideDist)
                .alpha(0f)
                .setDuration(220)
                .setInterpolator(new AccelerateInterpolator())
                .setListener(new AnimatorListenerAdapter() {
                    @Override public void onAnimationEnd(Animator animation) {
                        if (!isFinishing()) {
                            finish();
                            overridePendingTransition(0, 0);
                        }
                    }
                })
                .start();
    }

    private void attachDragToDismiss(View handle) {
        final float[] y0 = { 0 };
        handle.setOnTouchListener((v, e) -> {
            if (dismissing) return true;
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
                    if (dy > dp(90)) dismissSheet();
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
        try { NativeAudio.pause(); } catch (Throwable ignored) {}   // nếu app chính đang phát bài khác thì dừng lại nhường tệp vừa mở
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
        showDefaultArtwork();
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
                if (fb != null) showCoverBitmap(fb);
                else showDefaultArtwork();
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
        if (handedOff || dismissing) return;
        handedOff = true;
        long pos = player != null ? Math.max(0, player.getCurrentPosition()) : 0;
        boolean playing = player != null && player.getPlayWhenReady() && !ended;
        Intent i = new Intent(this, MainActivity.class);
        i.setAction(Intent.ACTION_VIEW);
        i.setData(uri);
        i.setClipData(ClipData.newRawUri("", uri));
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        i.putExtra("qp_pos", ended ? 0L : pos);
        i.putExtra("qp_play", playing || ended);
        releasePlayer();
        startActivity(i);
        finish();
        overridePendingTransition(0, 0);
    }

    private void releasePlayer() {
        ui.removeCallbacks(tick);
        if (player != null) {
            try { player.stop(); } catch (Throwable ignored) {}
            try { player.release(); } catch (Throwable ignored) {}
            player = null;
        }
    }

    @Override
    public void onBackPressed() {
        dismissSheet();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Thoát dưới dạng sheet nhanh (Home / Đa nhiệm) -> dừng nhạc & đóng sheet; chỉ khi mở sang app chính mới chạy nền
        if (!handedOff) {
            releasePlayer();
            if (!isFinishing()) {
                finish();
                overridePendingTransition(0, 0);
            }
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (!handedOff) {
            releasePlayer();
            if (!isFinishing()) {
                finish();
                overridePendingTransition(0, 0);
            }
        }
    }

    @Override
    protected void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }

    /** Thanh tua dạng sóng (MD3E): phần đã phát là sóng chuyển động khi đang phát, nút kéo là dấu gạch dọc cố định theo trục Y giống WebView. */
    static class WavySeek extends View {
        interface L { void onSeek(float frac, boolean fin); }
        L listener;
        boolean dragging;
        private boolean seekable = true;
        private float prog, amp, phase;
        private boolean playing;
        private final Paint wave = new Paint(Paint.ANTI_ALIAS_FLAG), track = new Paint(Paint.ANTI_ALIAS_FLAG), thumb = new Paint(Paint.ANTI_ALIAS_FLAG), dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final ValueAnimator anim;
        private final float dens;

        WavySeek(Context c) {
            super(c);
            dens = c.getResources().getDisplayMetrics().density;
            QuickPlayActivity a = (QuickPlayActivity) c;
            wave.setStyle(Paint.Style.STROKE); wave.setStrokeCap(Paint.Cap.ROUND); wave.setStrokeWidth(4 * dens); wave.setColor(a.cPrimary);
            track.setStyle(Paint.Style.STROKE); track.setStrokeCap(Paint.Cap.ROUND); track.setStrokeWidth(4 * dens); track.setColor(a.cTrack);
            thumb.setStyle(Paint.Style.FILL); thumb.setColor(a.cPrimary);
            dot.setStyle(Paint.Style.FILL); dot.setColor(a.cPrimary);
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
        void setSeekable(boolean s) {
            if (seekable == s) return;
            seekable = s;
            setAlpha(s ? 1f : 0.45f);
            invalidate();
        }

        @Override protected void onDraw(Canvas cv) {
            float w = getWidth(), h = getHeight(), cy = h / 2f;
            float thumbW = (dragging ? 5.5f : 4.5f) * dens;
            float thumbH = (dragging ? 26f : 22f) * dens;
            float padX = 6 * dens;
            float x0 = padX, x1 = w - padX;
            float px = x0 + (x1 - x0) * Math.max(0f, Math.min(1f, prog));
            float wl = 24 * dens;
            float gap = thumbW * 0.5f + 4 * dens;
            float waveEnd = Math.max(x0, px - gap);
            if (waveEnd > x0) {
                path.reset();
                path.moveTo(x0, cy);
                for (float x = x0; x <= waveEnd; x += 2f) {
                    float fade = Math.min(1f, (x - x0) / (12 * dens));
                    path.lineTo(x, cy + amp * fade * (float) Math.sin((x / wl) * 2 * Math.PI + phase));
                }
                cv.drawPath(path, wave);
            }
            if (px + gap < x1) cv.drawLine(px + gap, cy, x1, cy, track);
            dot.setColor(wave.getColor());
            cv.drawCircle(x1, cy, 2 * dens, dot);
            // Dấu gạch dọc cố định theo trục Y (cy), không nhấp nhô theo sóng
            float halfW = thumbW * 0.5f;
            float halfH = thumbH * 0.5f;
            cv.drawRoundRect(px - halfW, cy - halfH, px + halfW, cy + halfH, halfW, halfW, thumb);
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            float padX = 6 * dens;
            float frac = (e.getX() - padX) / Math.max(1f, getWidth() - 2 * padX);
            frac = Math.max(0f, Math.min(1f, frac));
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    getParent().requestDisallowInterceptTouchEvent(true);
                    if (!seekable) {
                        if (listener != null) listener.onSeek(prog, true);
                        return true;
                    }
                    dragging = true; prog = frac;
                    if (listener != null) listener.onSeek(frac, false);
                    invalidate();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (!seekable || !dragging) return true;
                    prog = frac;
                    if (listener != null) listener.onSeek(frac, false);
                    invalidate();
                    return true;
                case MotionEvent.ACTION_UP:
                    if (!seekable) return true;
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
