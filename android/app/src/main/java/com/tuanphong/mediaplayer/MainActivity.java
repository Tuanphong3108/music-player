package com.tuanphong.mediaplayer;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import android.util.Base64;
import androidx.core.content.FileProvider;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends Activity {
    static final String APP_URL = "https://tuanphong3108.github.io/music-player/index.html?android=true";
    static final String ASSET_HOST = "appassets.local";
    static MainActivity instance;

    private WebView web;
    private FrameLayout root;
    private View customView;
    private WebChromeClient.CustomViewCallback customCb;
    private ValueCallback<Uri[]> filePathCb;
    private final Map<String, Uri> served = new HashMap<>();
    private int nextId = 1;
    private boolean pageReady = false;
    private final List<JSONObject> pending = new ArrayList<>();
    private final android.os.Handler pingHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private boolean appLeftHome = false;
    private boolean pageResponded = false;
    private boolean hangAlertShown = false;
    private boolean updateInstallPending = false;
    private long updateInstallLaunchedAt = 0L;
    private boolean waitingUnknownSourcePermission = false;
    private String pendingUpdateUrl = null;
    private volatile boolean updateDownloadCancelled = false;
    private android.view.View hangOverlay = null;
    private android.view.View loadingOverlay = null;
    private android.animation.ValueAnimator md3ArcAnimator = null;
    private android.animation.ValueAnimator md3RotAnimator = null;
    private String appLang = "vi";
    private android.graphics.Typeface googleSansFlexRegular = null;
    private android.graphics.Typeface googleSansFlexBold = null;
    private final Runnable showLoadingOverlayRunnable = () -> {
        if (appLeftHome || pageResponded || hangAlertShown) return;
        showMd3LoadingOverlay();
    };
    private final Runnable loadTimeoutRunnable = () -> {
        if (appLeftHome || pageResponded) return;
        showUnresponsiveDialog();
    };
    private final Runnable pingTimeoutRunnable = () -> {
        if (appLeftHome || pageResponded) return;
        showUnresponsiveDialog();
    };
    private final Runnable installerTimeoutRunnable = () -> {
        if (!updateInstallPending) return;
        updateInstallPending = false;
        callJs("window.__onAndroidUpdateError&&window.__onAndroidUpdateError(" + JSONObject.quote(
                isEnglishLang() ? "Installer timed out after 10s" : "Trình cài đặt không phản hồi sau 10 giây") + ")");
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        instance = this;
        root = new FrameLayout(this);
        themeColor = getSharedPreferences("app", MODE_PRIVATE).getInt("theme", 0xFF1C1B1F);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        applyTheme(themeColor);

        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " MediaPlayerApp/1.0");
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (ASSET_HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/f/")) {
                    Uri src = served.get(u.getPath().substring(3));
                    if (src != null) {
                        try {
                            return serveContent(src, r.getRequestHeaders());
                        } catch (Exception e) { /* fallthrough */ }
                    }
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), null);
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String host = r.getUrl().getHost();
                if (host != null && (host.equals("tuanphong3108.github.io") || host.equals(ASSET_HOST))) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) v.loadUrl("file:///android_asset/offline.html");
            }

            @Override
            public void onPageStarted(WebView v, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(v, url, favicon);
                if (!pageResponded && !hangAlertShown) {
                    pingHandler.removeCallbacks(showLoadingOverlayRunnable);
                    pingHandler.postDelayed(showLoadingOverlayRunnable, 400);
                }
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                pingHandler.removeCallbacks(showLoadingOverlayRunnable);
                if (url.startsWith("https://tuanphong3108.github.io/")) {
                    pageReady = true;
                    flushPending();
                    if (!appLeftHome && !pageResponded) sendHandshakePing();
                } else {
                    pageReady = false;
                    hideMd3LoadingOverlay();
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (filePathCb != null) filePathCb.onReceiveValue(null);
                filePathCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(Intent.createChooser(i, null), 42); }
                catch (Exception e) { filePathCb = null; cb.onReceiveValue(null); return false; }
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                if (customView != null) { cb.onCustomViewHidden(); return; }
                customView = view; customCb = cb;
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                web.setVisibility(View.GONE);
                hideBars(true);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                web.setVisibility(View.VISIBLE);
                if (customCb != null) customCb.onCustomViewHidden();
                hideBars(false);
            }
        });

        if (b != null) web.restoreState(b);
        else web.loadUrl(isOnline() ? APP_URL : APP_URL); // SW của trang tự phục vụ offline; lỗi thì rơi về offline.html
        appLang = getSharedPreferences("app", MODE_PRIVATE).getString("lang", "vi");
        ensureGoogleSansFlexLoaded();
        armLoadWatchdog();
        handleIntent(getIntent());
    }

    private boolean isEnglishLang() {
        return "en".equalsIgnoreCase(appLang);
    }

    private void ensureGoogleSansFlexLoaded() {
        if (googleSansFlexRegular != null && googleSansFlexBold != null) return;
        try {
            File fontDir = new File(getCacheDir(), "fonts");
            if (!fontDir.exists()) fontDir.mkdirs();
            File regFile = new File(fontDir, "GoogleSansFlex-Regular.ttf");
            if (regFile.exists() && regFile.length() > 1024) {
                googleSansFlexRegular = android.graphics.Typeface.createFromFile(regFile);
                googleSansFlexBold = android.graphics.Typeface.create(googleSansFlexRegular, android.graphics.Typeface.BOLD);
                return;
            }
            new Thread(() -> {
                java.net.HttpURLConnection conn = null;
                java.io.InputStream in = null;
                java.io.FileOutputStream out = null;
                try {
                    java.net.HttpURLConnection cssConn = (java.net.HttpURLConnection) new java.net.URL(
                            "https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400;700").openConnection();
                    cssConn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14)");
                    cssConn.setConnectTimeout(8000);
                    cssConn.setReadTimeout(8000);
                    java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(cssConn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line).append('\n');
                    br.close();
                    cssConn.disconnect();
                    java.util.regex.Matcher m = java.util.regex.Pattern.compile("url\\((https://fonts\\.gstatic\\.com/[^)]+\\.(?:ttf|woff2))\\)").matcher(sb.toString());
                    if (m.find() && m.group(1).endsWith(".ttf")) {
                        conn = (java.net.HttpURLConnection) new java.net.URL(m.group(1)).openConnection();
                        conn.setConnectTimeout(10000);
                        conn.setReadTimeout(10000);
                        in = conn.getInputStream();
                        out = new java.io.FileOutputStream(regFile);
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                        out.flush();
                        out.close(); out = null;
                        in.close(); in = null;
                        android.graphics.Typeface tf = android.graphics.Typeface.createFromFile(regFile);
                        android.graphics.Typeface boldTf = android.graphics.Typeface.create(tf, android.graphics.Typeface.BOLD);
                        runOnUiThread(() -> {
                            googleSansFlexRegular = tf;
                            googleSansFlexBold = boldTf;
                        });
                    }
                } catch (Throwable ignored) {
                } finally {
                    try { if (out != null) out.close(); } catch (Exception ignored) {}
                    try { if (in != null) in.close(); } catch (Exception ignored) {}
                    try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
                }
            }).start();
        } catch (Throwable ignored) {}
    }

    private void applyFontToView(android.widget.TextView tv, boolean bold) {
        if (tv == null) return;
        android.graphics.Typeface tf = bold ? googleSansFlexBold : googleSansFlexRegular;
        if (tf != null) {
            tv.setTypeface(tf, bold ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        } else {
            tv.setTypeface(tv.getTypeface(), bold ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        }
    }

    private void showMd3LoadingOverlay() {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed() || root == null || loadingOverlay != null) return;
            final float d = getResources().getDisplayMetrics().density;
            android.widget.FrameLayout box = new android.widget.FrameLayout(this);
            box.setBackgroundColor(themeColor != 0 ? themeColor : 0xFF1C1B1F);
            box.setClickable(true);
            box.setFocusable(true);

            final int sizePx = (int) (64 * d);
            final int accentHex = (themeColor != 0 ? themeColor : 0xFFD0BCFF);
            double lum = (0.299 * ((accentHex >> 16) & 255) + 0.587 * ((accentHex >> 8) & 255) + 0.114 * (accentHex & 255)) / 255.0;
            final int shapeColor = lum > 0.65 ? 0xFF4F378B : 0xFFD0BCFF;

            // Chuỗi hình dạng đặc trưng của Material 3 Expressive Loading Indicator (biến đổi mượt giữa các đa giác bo góc / sao)
            final int shapeCount = 7;
            final int[] shapeLobes = new int[]{0, 4, 6, 8, 12, 5, 7};
            final float[] shapeInnerRatio = new float[]{1.0f, 0.78f, 0.84f, 0.88f, 0.92f, 0.62f, 0.76f};
            final float[] shapeCornerRound = new float[]{1.0f, 0.52f, 0.45f, 0.40f, 0.35f, 0.48f, 0.42f};

            android.view.View spinner = new android.view.View(this) {
                float morphProgress = 0f;
                float spinAngle = 0f;

                private android.graphics.Path buildMorphPath(float cx, float cy, float baseR, float progress) {
                    int total = shapeCount;
                    float scaled = progress * total;
                    int idxA = ((int) Math.floor(scaled)) % total;
                    if (idxA < 0) idxA += total;
                    int idxB = (idxA + 1) % total;
                    float frac = scaled - (float) Math.floor(scaled);
                    // Spring/Expressive ease cho bước chuyển hình dạng
                    float t = frac * frac * (3f - 2f * frac);

                    int lobesA = shapeLobes[idxA];
                    int lobesB = shapeLobes[idxB];
                    float innerA = shapeInnerRatio[idxA];
                    float innerB = shapeInnerRatio[idxB];
                    float roundA = shapeCornerRound[idxA];
                    float roundB = shapeCornerRound[idxB];

                    android.graphics.Path path = new android.graphics.Path();
                    int samples = 96;
                    for (int i = 0; i <= samples; i++) {
                        double theta = (i * 2.0 * Math.PI) / samples;
                        float rA = radiusForShape(baseR, lobesA, innerA, roundA, theta);
                        float rB = radiusForShape(baseR, lobesB, innerB, roundB, theta);
                        float r = rA + (rB - rA) * t;
                        float x = cx + (float) (Math.cos(theta) * r);
                        float y = cy + (float) (Math.sin(theta) * r);
                        if (i == 0) path.moveTo(x, y);
                        else path.lineTo(x, y);
                    }
                    path.close();
                    return path;
                }

                private float radiusForShape(float baseR, int lobes, float innerRatio, float roundness, double theta) {
                    if (lobes <= 0) {
                        // Hình tròn chuẩn M3 Expressive
                        return baseR;
                    }
                    if (lobes == 4 && innerRatio > 0.72f) {
                        // Squircle / rounded square expressive: góc bo tròn mềm mại, cạnh hơi phồng
                        double c = Math.cos(theta);
                        double s = Math.sin(theta);
                        double p = 2.8;
                        double denom = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), 1.0 / p);
                        float sq = (float) (1.0 / Math.max(denom, 0.0001));
                        return baseR * (0.86f + 0.16f * sq * (0.7f + 0.3f * roundness));
                    }
                    // Đa giác / cánh sao Expressive bo góc mượt
                    double wave = Math.cos(lobes * theta);
                    float normalized = (float) ((wave + 1.0) * 0.5);
                    float smoothWave = (float) Math.pow(normalized, 0.65 + (1.0 - roundness) * 0.7);
                    float minFactor = innerRatio;
                    float maxFactor = 1.03f;
                    return baseR * (minFactor + (maxFactor - minFactor) * smoothWave);
                }

                @Override
                protected void onDraw(android.graphics.Canvas canvas) {
                    super.onDraw(canvas);
                    float cx = getWidth() * 0.5f;
                    float cy = getHeight() * 0.5f;
                    float baseR = Math.min(cx, cy) * 0.84f;

                    canvas.save();
                    canvas.rotate(spinAngle, cx, cy);
                    android.graphics.Path morphPath = buildMorphPath(cx, cy, baseR, morphProgress);
                    android.graphics.Paint fillPaint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
                    fillPaint.setStyle(android.graphics.Paint.Style.FILL);
                    fillPaint.setColor(shapeColor);
                    canvas.drawPath(morphPath, fillPaint);
                    canvas.restore();
                }
            };

            android.widget.FrameLayout.LayoutParams lp = new android.widget.FrameLayout.LayoutParams(sizePx, sizePx);
            lp.gravity = android.view.Gravity.CENTER;
            box.addView(spinner, lp);

            loadingOverlay = box;
            root.addView(loadingOverlay, new FrameLayout.LayoutParams(-1, -1));

            // Biến đổi hình dạng liên tục theo nhịp Material 3 Expressive + xoay nhẹ
            md3ArcAnimator = android.animation.ValueAnimator.ofFloat(0f, 1f);
            md3ArcAnimator.setDuration(4200);
            md3ArcAnimator.setRepeatCount(android.animation.ValueAnimator.INFINITE);
            md3ArcAnimator.setRepeatMode(android.animation.ValueAnimator.RESTART);
            md3ArcAnimator.setInterpolator(new android.view.animation.LinearInterpolator());
            md3ArcAnimator.addUpdateListener(anim -> {
                float p = (float) anim.getAnimatedValue();
                try {
                    java.lang.reflect.Field fMorph = spinner.getClass().getDeclaredField("morphProgress");
                    fMorph.setAccessible(true);
                    fMorph.setFloat(spinner, p);
                    spinner.invalidate();
                } catch (Throwable ignored) {}
            });
            md3ArcAnimator.start();

            md3RotAnimator = android.animation.ValueAnimator.ofFloat(0f, 360f);
            md3RotAnimator.setDuration(3600);
            md3RotAnimator.setRepeatCount(android.animation.ValueAnimator.INFINITE);
            md3RotAnimator.setInterpolator(new android.view.animation.LinearInterpolator());
            md3RotAnimator.addUpdateListener(anim -> {
                float deg = (float) anim.getAnimatedValue();
                try {
                    java.lang.reflect.Field fRot = spinner.getClass().getDeclaredField("spinAngle");
                    fRot.setAccessible(true);
                    fRot.setFloat(spinner, deg);
                    spinner.invalidate();
                } catch (Throwable ignored) {}
            });
            md3RotAnimator.start();
        });
    }

    private void hideMd3LoadingOverlay() {
        pingHandler.removeCallbacks(showLoadingOverlayRunnable);
        runOnUiThread(() -> {
            final android.view.View targetOverlay = loadingOverlay;
            final android.animation.ValueAnimator arcAnim = md3ArcAnimator;
            final android.animation.ValueAnimator rotAnim = md3RotAnimator;
            loadingOverlay = null;
            md3ArcAnimator = null;
            md3RotAnimator = null;
            if (targetOverlay == null) {
                if (arcAnim != null) arcAnim.cancel();
                if (rotAnim != null) rotAnim.cancel();
                return;
            }
            targetOverlay.setClickable(false);
            targetOverlay.animate()
                    .alpha(0f)
                    .setDuration(280)
                    .setInterpolator(new android.view.animation.PathInterpolator(0.2f, 0f, 0f, 1f))
                    .withEndAction(() -> {
                        if (arcAnim != null) arcAnim.cancel();
                        if (rotAnim != null) rotAnim.cancel();
                        if (root != null) {
                            try { root.removeView(targetOverlay); } catch (Throwable ignored) {}
                        }
                    })
                    .start();
        });
    }

    private void armLoadWatchdog() {
        appLeftHome = false;
        pageResponded = false;
        hangAlertShown = false;
        hideUnresponsiveDialog();
        pingHandler.removeCallbacks(loadTimeoutRunnable);
        pingHandler.removeCallbacks(pingTimeoutRunnable);
        pingHandler.postDelayed(loadTimeoutRunnable, 10000);
    }

    private void cancelWatchdogOnLeave() {
        appLeftHome = true;
        pingHandler.removeCallbacks(showLoadingOverlayRunnable);
        pingHandler.removeCallbacks(loadTimeoutRunnable);
        pingHandler.removeCallbacks(pingTimeoutRunnable);
    }

    private void sendHandshakePing() {
        if (appLeftHome || pageResponded || hangAlertShown) return;
        pingHandler.removeCallbacks(loadTimeoutRunnable);
        pingHandler.removeCallbacks(pingTimeoutRunnable);
        pingHandler.postDelayed(pingTimeoutRunnable, 10000);
        callJs("window.__androidPing&&window.__androidPing()");
    }

    private void showUnresponsiveDialog() {
        if (appLeftHome || pageResponded || hangAlertShown) return;
        hangAlertShown = true;
        hideMd3LoadingOverlay();
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed() || hangOverlay != null) return;
            boolean en = isEnglishLang();
            android.widget.LinearLayout box = new android.widget.LinearLayout(this);
            box.setOrientation(android.widget.LinearLayout.VERTICAL);
            box.setGravity(android.view.Gravity.CENTER);
            int pad = (int) (28 * getResources().getDisplayMetrics().density);
            box.setPadding(pad, pad, pad, pad);
            box.setBackgroundColor(0xEE141218);
            box.setClickable(true);
            box.setFocusable(true);

            android.widget.TextView title = new android.widget.TextView(this);
            title.setText(en ? "Page not responding" : "Trang không phản hồi");
            title.setTextColor(0xFFFFFFFF);
            title.setTextSize(20f);
            applyFontToView(title, true);
            title.setGravity(android.view.Gravity.CENTER);

            android.widget.TextView desc = new android.widget.TextView(this);
            desc.setText(en
                    ? "The app waited over 10 seconds without receiving a response from the web page."
                    : "Ứng dụng đã chờ quá 10 giây nhưng không nhận được phản hồi từ trang web.");
            desc.setTextColor(0xFFD0C9DC);
            desc.setTextSize(14f);
            applyFontToView(desc, false);
            desc.setGravity(android.view.Gravity.CENTER);
            android.widget.LinearLayout.LayoutParams descLp = new android.widget.LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            descLp.topMargin = (int) (10 * getResources().getDisplayMetrics().density);
            descLp.bottomMargin = (int) (22 * getResources().getDisplayMetrics().density);
            desc.setLayoutParams(descLp);

            android.widget.LinearLayout actionsRow = new android.widget.LinearLayout(this);
            actionsRow.setOrientation(android.widget.LinearLayout.HORIZONTAL);
            actionsRow.setGravity(android.view.Gravity.CENTER);

            int btnPadH = (int) (24 * getResources().getDisplayMetrics().density);
            int btnPadV = (int) (12 * getResources().getDisplayMetrics().density);

            android.widget.Button waitBtn = new android.widget.Button(this);
            waitBtn.setText("Wait");
            waitBtn.setAllCaps(false);
            waitBtn.setTextColor(0xFFE6E0E9);
            waitBtn.setTextSize(15f);
            applyFontToView(waitBtn, true);
            android.graphics.drawable.GradientDrawable waitBg = new android.graphics.drawable.GradientDrawable();
            waitBg.setColor(0xFF332D41);
            waitBg.setCornerRadius(999f);
            waitBtn.setBackground(waitBg);
            waitBtn.setPadding(btnPadH, btnPadV, btnPadH, btnPadV);
            waitBtn.setOnClickListener(v -> {
                hangAlertShown = false;
                hideUnresponsiveDialog();
                showMd3LoadingOverlay();
                pingHandler.removeCallbacks(loadTimeoutRunnable);
                pingHandler.removeCallbacks(pingTimeoutRunnable);
                pingHandler.postDelayed(pageReady ? pingTimeoutRunnable : loadTimeoutRunnable, 10000);
                if (pageReady) callJs("window.__androidPing&&window.__androidPing()");
            });
            android.widget.LinearLayout.LayoutParams waitLp = new android.widget.LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            waitLp.rightMargin = (int) (12 * getResources().getDisplayMetrics().density);
            waitBtn.setLayoutParams(waitLp);

            android.widget.Button restartBtn = new android.widget.Button(this);
            restartBtn.setText("Restart app");
            restartBtn.setAllCaps(false);
            restartBtn.setTextColor(0xFF1C1B1F);
            restartBtn.setTextSize(15f);
            applyFontToView(restartBtn, true);
            android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
            bg.setColor(0xFFD0BCFF);
            bg.setCornerRadius(999f);
            restartBtn.setBackground(bg);
            restartBtn.setPadding(btnPadH, btnPadV, btnPadH, btnPadV);
            restartBtn.setOnClickListener(v -> restartApp());

            actionsRow.addView(waitBtn);
            actionsRow.addView(restartBtn);

            box.addView(title);
            box.addView(desc);
            box.addView(actionsRow);
            hangOverlay = box;
            root.addView(hangOverlay, new FrameLayout.LayoutParams(-1, -1));
        });
    }

    private void hideUnresponsiveDialog() {
        runOnUiThread(() -> {
            if (hangOverlay != null) {
                root.removeView(hangOverlay);
                hangOverlay = null;
            }
        });
    }

    private void restartApp() {
        pingHandler.removeCallbacks(loadTimeoutRunnable);
        pingHandler.removeCallbacks(pingTimeoutRunnable);
        try {
            Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                startActivity(intent);
            }
        } catch (Throwable ignored) {}
        finish();
        android.os.Process.killProcess(android.os.Process.myPid());
    }

    private int themeColor = 0xFF1C1B1F;

    private int barFlags() {
        double lum = (0.299 * ((themeColor >> 16) & 255) + 0.587 * ((themeColor >> 8) & 255) + 0.114 * (themeColor & 255)) / 255.0;
        int f = View.SYSTEM_UI_FLAG_VISIBLE;
        if (lum > 0.6) {
            if (Build.VERSION.SDK_INT >= 23) f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) f |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        return f;
    }

    /** Khung app (thanh trạng thái, thanh điều hướng, nền WebView) ăn theo màu accent của trang. */
    void applyTheme(int c) {
        themeColor = 0xFF000000 | c;
        getWindow().setStatusBarColor(themeColor);
        getWindow().setNavigationBarColor(themeColor);
        if (root != null) root.setBackgroundColor(themeColor);
        if (web != null) web.setBackgroundColor(themeColor);
        if (customView == null) getWindow().getDecorView().setSystemUiVisibility(barFlags());
    }

    private void hideBars(boolean hide) {
        getWindow().getDecorView().setSystemUiVisibility(hide
                ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                : barFlags());
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        return cm != null && cm.getActiveNetworkInfo() != null && cm.getActiveNetworkInfo().isConnected();
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        handleIntent(i);
    }

    private void handleIntent(Intent i) {
        if (i == null) return;
        String a = i.getAction();
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_VIEW.equals(a) && i.getData() != null) uris.add(i.getData());
        else if (Intent.ACTION_SEND.equals(a)) {
            Uri u = i.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(a)) {
            ArrayList<Uri> l = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (l != null) uris.addAll(l);
        }
        if (uris.isEmpty()) return;
        i.setAction(Intent.ACTION_MAIN); // tránh nạp lại khi xoay màn hình
        queueUris(uris);
    }


    /** Phát nội dung content:// kèm hỗ trợ HTTP Range để video tua/phát theo từng đoạn, không nạp cả tệp vào RAM. */
    private WebResourceResponse serveContent(Uri src, Map<String, String> reqHeaders) throws Exception {
        String mime = getContentResolver().getType(src);
        if (mime == null || "application/octet-stream".equals(mime)) {
            String name = displayName(src).toLowerCase();
            if (name.endsWith(".mp4") || name.endsWith(".m4v")) mime = "video/mp4";
            else if (name.endsWith(".webm")) mime = "video/webm";
            else if (name.endsWith(".mkv")) mime = "video/x-matroska";
            else if (name.endsWith(".mp3")) mime = "audio/mpeg";
            else if (name.endsWith(".flac")) mime = "audio/flac";
            else if (name.endsWith(".m4a") || name.endsWith(".aac")) mime = "audio/mp4";
            else if (name.endsWith(".ogg") || name.endsWith(".oga")) mime = "audio/ogg";
            else if (name.endsWith(".opus")) mime = "audio/opus";
            else if (name.endsWith(".wav")) mime = "audio/wav";
            else if (mime == null) mime = "application/octet-stream";
        }
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Accept-Ranges", "bytes");
        android.content.res.AssetFileDescriptor afd = getContentResolver().openAssetFileDescriptor(src, "r");
        long total = afd == null ? -1 : afd.getLength();
        if (afd == null || total <= 0) {
            if (afd != null) afd.close();
            InputStream in = getContentResolver().openInputStream(src);
            return new WebResourceResponse(mime, null, 200, "OK", h, in);
        }
        String range = null;
        if (reqHeaders != null) for (Map.Entry<String, String> e : reqHeaders.entrySet()) if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
        long start = 0, end = total - 1;
        boolean partial = false;
        if (range != null && range.startsWith("bytes=")) {
            try {
                String[] p = range.substring(6).split(",")[0].trim().split("-", -1);
                if (p[0].isEmpty()) { long n = Long.parseLong(p[1]); start = Math.max(0, total - n); }
                else { start = Long.parseLong(p[0]); if (p.length > 1 && !p[1].isEmpty()) end = Math.min(end, Long.parseLong(p[1])); }
                if (start > end || start >= total) { afd.close(); h.put("Content-Range", "bytes */" + total); return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", h, null); }
                partial = true;
            } catch (Exception ex) { start = 0; end = total - 1; partial = false; }
        }
        final long len = end - start + 1;
        final android.content.res.AssetFileDescriptor fafd = afd;
        InputStream bounded = new InputStream() {
            InputStream raw = null;
            long toSkip = start;
            long left = len;
            boolean closed = false;

            private void ensureStream() throws java.io.IOException {
                if (raw != null) return;
                raw = fafd.createInputStream();
                long rem = toSkip;
                while (rem > 0) {
                    long sk = raw.skip(rem);
                    if (sk > 0) {
                        rem -= sk;
                    } else {
                        byte[] tmp = new byte[(int) Math.min(8192, rem)];
                        int r = raw.read(tmp);
                        if (r <= 0) break;
                        rem -= r;
                    }
                }
            }

            @Override public synchronized int read() throws java.io.IOException {
                byte[] b = new byte[1];
                int r = read(b, 0, 1);
                return r < 0 ? -1 : (b[0] & 0xff);
            }

            @Override public synchronized int read(byte[] b, int off, int n) throws java.io.IOException {
                if (closed || left <= 0 || n <= 0) return -1;
                ensureStream();
                int r = raw.read(b, off, (int) Math.min(n, left));
                if (r > 0) left -= r;
                return r;
            }

            @Override public synchronized int available() throws java.io.IOException {
                if (closed || left <= 0) return 0;
                ensureStream();
                int av = raw.available();
                return (int) Math.min(left, Math.max(0, av));
            }

            @Override public synchronized void close() throws java.io.IOException {
                if (closed) return;
                closed = true;
                try { if (raw != null) raw.close(); } finally { fafd.close(); }
            }
        };
        h.put("Content-Length", String.valueOf(len));
        if (partial) {
            h.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
            return new WebResourceResponse(mime, null, 206, "Partial Content", h, bounded);
        }
        return new WebResourceResponse(mime, null, 200, "OK", h, bounded);
    }

    private long querySize(Uri u) {
        try (Cursor c = getContentResolver().query(u, null, null, null, null)) {
            if (c != null && c.moveToFirst()) { int ix = c.getColumnIndex(OpenableColumns.SIZE); if (ix >= 0 && !c.isNull(ix)) return c.getLong(ix); }
        } catch (Exception ignored) {}
        return -1;
    }

    private long queryModified(Uri u) {
        try (Cursor c = getContentResolver().query(u, null, null, null, null)) {
            if (c != null && c.moveToFirst()) { int ix = c.getColumnIndex("last_modified"); if (ix >= 0 && !c.isNull(ix)) return c.getLong(ix); }
        } catch (Exception ignored) {}
        return 0;
    }

    private String displayName(Uri u) {
        String n = null;
        try (Cursor c = getContentResolver().query(u, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int ix = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (ix >= 0) n = c.getString(ix);
            }
        } catch (Exception ignored) {}
        if (n == null) { n = u.getLastPathSegment(); if (n == null) n = "media"; }
        return n;
    }

    private void flushPending() {
        if (!pageReady || pending.isEmpty()) return;
        JSONArray arr = new JSONArray();
        for (JSONObject o : pending) arr.put(o);
        pending.clear();
        String js = "(function(l){if(window.__nativeOpenFiles)window.__nativeOpenFiles(l);else window.__pendingNativeFiles=(window.__pendingNativeFiles||[]).concat(l);})(" + arr + ");";
        web.evaluateJavascript(js, null);
    }

    private void startSvc(Intent i) {
        try { if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i); } catch (Exception ignored) {}
    }

    void callJs(final String js) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    private void queueUris(List<Uri> uris) {
        for (Uri u : uris) {
            try {
                String id = String.valueOf(nextId++);
                served.put(id, u);
                JSONObject o = new JSONObject();
                o.put("url", "https://" + ASSET_HOST + "/f/" + id);
                o.put("name", displayName(u));
                String t = getContentResolver().getType(u);
                o.put("type", t == null ? "" : t);
                o.put("size", querySize(u));
                o.put("modified", queryModified(u));
                pending.add(o);
            } catch (Exception ignored) {}
        }
        flushPending();
    }

    /** Duyệt đệ quy thư mục (SAF tree) lấy file nhạc/video + lời/phụ đề đi kèm. */
    private void scanTree(final Uri tree) {
        new Thread(() -> {
            List<Uri> out = new ArrayList<>();
            try {
                String rootId = DocumentsContract.getTreeDocumentId(tree);
                walk(tree, rootId, out, 0);
            } catch (Exception ignored) {}
            runOnUiThread(() -> {
                if (out.isEmpty()) callJs("window.addBtnCancel&&addBtnCancel()");
                else queueUris(out);
            });
        }).start();
    }

    private void walk(Uri tree, String docId, List<Uri> out, int depth) {
        if (depth > 6) return;
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        try (Cursor c = getContentResolver().query(children, new String[]{
                DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (c == null) return;
            while (c.moveToNext()) {
                String id = c.getString(0), mime = c.getString(1), name = c.getString(2);
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) { walk(tree, id, out, depth + 1); continue; }
                String ln = name == null ? "" : name.toLowerCase();
                if ((mime != null && (mime.startsWith("audio/") || mime.startsWith("video/")))
                        || ln.endsWith(".lrc") || ln.endsWith(".srt") || ln.endsWith(".vtt")
                        || ln.endsWith(".mp3") || ln.endsWith(".flac") || ln.endsWith(".m4a") || ln.endsWith(".ogg") || ln.endsWith(".opus")
                        || ln.endsWith(".wav") || ln.endsWith(".mkv") || ln.endsWith(".mp4") || ln.endsWith(".webm"))
                    out.add(DocumentsContract.buildDocumentUriUsingTree(tree, id));
            }
        } catch (Exception ignored) {}
    }

    void sendCmd(final String cmd) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.__nativeCmd&&window.__nativeCmd('" + cmd + "')", null); });
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == 43 || req == 44) {
            if (res != RESULT_OK || data == null) { callJs("window.addBtnCancel&&addBtnCancel()"); }
            else if (req == 44 && data.getData() != null) scanTree(data.getData());
            else {
                List<Uri> l = new ArrayList<>();
                if (data.getClipData() != null) for (int k = 0; k < data.getClipData().getItemCount(); k++) l.add(data.getClipData().getItemAt(k).getUri());
                else if (data.getData() != null) l.add(data.getData());
                if (l.isEmpty()) callJs("window.addBtnCancel&&addBtnCancel()"); else queueUris(l);
            }
        } else if (req == 46) {
            waitingUnknownSourcePermission = false;
            String resumeUrl = pendingUpdateUrl;
            pendingUpdateUrl = null;
            if (canInstallUnknownSources()) {
                File apkFile = new File(new File(getCacheDir(), "updates"), "MediaPlayer-update.apk");
                if (apkFile.exists() && apkFile.length() > 0) {
                    launchApkInstaller(apkFile);
                } else if (resumeUrl != null && !resumeUrl.isEmpty()) {
                    startUpdateDownloadInternal(resumeUrl);
                }
            } else {
                callJs("window.__onAndroidUpdateError&&window.__onAndroidUpdateError(" + JSONObject.quote(
                        isEnglishLang() ? "Permission to install from this source was not granted" : "Chưa cấp quyền cài đặt ứng dụng từ nguồn này") + ")");
            }
        } else if (req == 45) {
            pingHandler.removeCallbacks(installerTimeoutRunnable);
            updateInstallPending = false;
            updateInstallLaunchedAt = 0L;
            if (res == RESULT_OK) {
                callJs("window.__onAndroidUpdateInstalled&&window.__onAndroidUpdateInstalled()");
            } else if (res == RESULT_CANCELED) {
                callJs("window.__onAndroidUpdateError&&window.__onAndroidUpdateError(" + JSONObject.quote(
                        isEnglishLang() ? "Installation cancelled by user or installer error" : "Trình cài đặt đã hủy hoặc báo lỗi cài đặt") + ")");
            }
        } else if (req == 42 && filePathCb != null) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    out = new Uri[n];
                    for (int k = 0; k < n; k++) out[k] = data.getClipData().getItemAt(k).getUri();
                } else if (data.getData() != null) out = new Uri[]{data.getData()};
            }
            filePathCb.onReceiveValue(out);
            filePathCb = null;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) { web.getWebChromeClient().onHideCustomView(); return; }
        callJs("(function(){if(window.__androidHandleBack&&window.__androidHandleBack())return;if(window.AndroidBridge&&window.AndroidBridge.__nativeBackFallback)window.AndroidBridge.__nativeBackFallback();})()");
    }

    @Override
    protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration c) {
        super.onConfigurationChanged(c);
        callJs("window.__systemAccentChanged&&__systemAccentChanged()");
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        cancelWatchdogOnLeave();
        callJs("window.__onAndroidLeaveApp&&window.__onAndroidLeaveApp()");
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, android.content.res.Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        hideBars(isInPictureInPictureMode);
        callJs("window.__onAndroidPipModeChanged&&window.__onAndroidPipModeChanged(" + isInPictureInPictureMode + ")");
    }

    @Override
    protected void onStop() {
        super.onStop();
        cancelWatchdogOnLeave();
        if (Build.VERSION.SDK_INT >= 26 && !isInPictureInPictureMode()) {
            callJs("window.__onAndroidLeaveApp&&window.__onAndroidLeaveApp()");
        }
    }

    private boolean canInstallUnknownSources() {
        if (Build.VERSION.SDK_INT < 26) return true;
        try {
            return getPackageManager().canRequestPackageInstalls();
        } catch (Throwable ignored) {
            return false;
        }
    }

    private void openUnknownSourcesSettings(String apkUrl) {
        if (Build.VERSION.SDK_INT < 26) return;
        waitingUnknownSourcePermission = true;
        pendingUpdateUrl = apkUrl;
        runOnUiThread(() -> {
            try {
                Intent i = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                i.setData(Uri.parse("package:" + getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivityForResult(i, 46);
            } catch (Throwable ex) {
                try {
                    Intent fallback = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivityForResult(fallback, 46);
                } catch (Throwable ex2) {
                    waitingUnknownSourcePermission = false;
                    pendingUpdateUrl = null;
                    callJs("window.__onAndroidUpdateError&&window.__onAndroidUpdateError(" + JSONObject.quote(
                            isEnglishLang() ? "Cannot open install permission screen: " + ex2 : "Không mở được trang cấp quyền cài đặt: " + ex2) + ")");
                }
            }
        });
    }

    private void launchApkInstaller(File apkFile) {
        if (apkFile == null || !apkFile.exists()) {
            if (pendingUpdateUrl != null && !pendingUpdateUrl.isEmpty()) {
                String retryUrl = pendingUpdateUrl;
                pendingUpdateUrl = null;
                startUpdateDownloadInternal(retryUrl);
            } else {
                callJs("window.__onAndroidUpdateError&&window.__onAndroidUpdateError(" + JSONObject.quote(
                        isEnglishLang() ? "Update APK file not found" : "Không tìm thấy tệp APK cập nhật") + ")");
            }
            return;
        }
        final Uri apkUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fp", apkFile);
        runOnUiThread(() -> {
            try {
                if (updateDownloadCancelled) return;
                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                updateInstallPending = true;
                updateInstallLaunchedAt = android.os.SystemClock.elapsedRealtime();
                pingHandler.removeCallbacks(installerTimeoutRunnable);
                pingHandler.postDelayed(installerTimeoutRunnable, 10000);
                startActivityForResult(installIntent, 45);
            } catch (Throwable ex) {
                updateInstallPending = false;
                pingHandler.removeCallbacks(installerTimeoutRunnable);
                callJs("window.__onAndroidUpdateError&&window.__onAndroidUpdateError(" + JSONObject.quote(String.valueOf(ex)) + ")");
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (waitingUnknownSourcePermission) {
            pingHandler.postDelayed(() -> {
                if (!waitingUnknownSourcePermission) return;
                waitingUnknownSourcePermission = false;
                String resumeUrl = pendingUpdateUrl;
                pendingUpdateUrl = null;
                if (canInstallUnknownSources()) {
                    File apkFile = new File(new File(getCacheDir(), "updates"), "MediaPlayer-update.apk");
                    if (apkFile.exists() && apkFile.length() > 0) {
                        launchApkInstaller(apkFile);
                    } else if (resumeUrl != null && !resumeUrl.isEmpty()) {
                        startUpdateDownloadInternal(resumeUrl);
                    }
                } else {
                    callJs("window.__onAndroidUpdateError&&window.__onAndroidUpdateError(" + JSONObject.quote(
                            isEnglishLang() ? "Permission to install from this source was not granted" : "Chưa cấp quyền cài đặt ứng dụng từ nguồn này") + ")");
                }
            }, 250);
        }
        if (updateInstallPending && android.os.SystemClock.elapsedRealtime() - updateInstallLaunchedAt > 1200) {
            pingHandler.removeCallbacks(installerTimeoutRunnable);
            updateInstallPending = false;
            updateInstallLaunchedAt = 0L;
            callJs("window.__onAndroidUpdateError&&window.__onAndroidUpdateError(" + JSONObject.quote(
                    isEnglishLang() ? "Installer closed without completing update" : "Trình cài đặt đã đóng hoặc gặp lỗi khi cài") + ")");
        }
        appLeftHome = false;
        if (!pageResponded && !hangAlertShown) {
            pingHandler.removeCallbacks(loadTimeoutRunnable);
            pingHandler.removeCallbacks(pingTimeoutRunnable);
            pingHandler.postDelayed(pageReady ? pingTimeoutRunnable : loadTimeoutRunnable, 10000);
            if (pageReady) sendHandshakePing();
        }
        callJs("window.__systemAccentChanged&&__systemAccentChanged()");
        callJs("window.__onAndroidPipModeChanged&&window.__onAndroidPipModeChanged(false)");
    }

    @Override
    protected void onDestroy() {
        if (instance == this) instance = null;
        updateInstallPending = false;
        updateDownloadCancelled = true;
        hideMd3LoadingOverlay();
        pingHandler.removeCallbacks(installerTimeoutRunnable);
        pingHandler.removeCallbacks(loadTimeoutRunnable);
        pingHandler.removeCallbacks(pingTimeoutRunnable);
        try { stopService(new Intent(this, MediaService.class)); } catch (Exception ignored) {}
        super.onDestroy();
    }

    class Bridge {
        private FileOutputStream shareOut; private File shareFile; private String shareId;

        @JavascriptInterface
        public String shareChunk(String id, String b64, boolean last, String name, String mime) {
            try {
                if (shareOut == null || !id.equals(shareId)) {
                    File dir = new File(getCacheDir(), "share");
                    dir.mkdirs();
                    File[] old = dir.listFiles();
                    if (old != null) for (File f : old) f.delete();
                    shareId = id;
                    shareFile = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", "_"));
                    shareOut = new FileOutputStream(shareFile);
                }
                shareOut.write(Base64.decode(b64, Base64.DEFAULT));
                if (last) {
                    shareOut.close(); shareOut = null;
                    final Uri u = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fp", shareFile);
                    final String m = (mime == null || mime.isEmpty()) ? "*/*" : mime;
                    runOnUiThread(() -> {
                        try {
                            Intent i = new Intent(Intent.ACTION_SEND);
                            i.setType(m);
                            i.putExtra(Intent.EXTRA_STREAM, u);
                            i.setClipData(android.content.ClipData.newRawUri("", u));
                            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            Intent ch = Intent.createChooser(i, null);
                            ch.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            startActivity(ch);
                        } catch (Exception e) {
                            callJs("window.showToast&&showToast(" + JSONObject.quote("Không mở được khung chia sẻ: " + e) + ")");
                        }
                    });
                }
                return "";
            } catch (Throwable e) {
                try { if (shareOut != null) shareOut.close(); } catch (Exception ignored) {}
                shareOut = null;
                return String.valueOf(e);
            }
        }

        @JavascriptInterface
        public void setState(boolean playing, String title, String artist, long posMs, long durMs, float speed) {
            Intent i = new Intent(MainActivity.this, MediaService.class);
            i.setAction(MediaService.ACTION_UPDATE);
            i.putExtra("playing", playing);
            i.putExtra("title", title);
            i.putExtra("artist", artist);
            i.putExtra("pos", posMs);
            i.putExtra("dur", durMs);
            i.putExtra("speed", speed);
            startSvc(i);
        }

        @JavascriptInterface
        public void setState(boolean playing, String title, String artist, long posMs, long durMs) {
            setState(playing, title, artist, posMs, durMs, playing ? 1f : 0f);
        }

        @JavascriptInterface
        public void setAppLanguage(String lang) {
            if (lang == null || lang.trim().isEmpty()) return;
            appLang = lang.trim().toLowerCase();
            getSharedPreferences("app", MODE_PRIVATE).edit().putString("lang", appLang).apply();
        }

        @JavascriptInterface
        public void setLanguage(String lang) {
            if (lang == null) return;
            String norm = lang.trim().toLowerCase().startsWith("en") ? "en" : "vi";
            if (!norm.equals(appLang)) {
                appLang = norm;
                getSharedPreferences("app", MODE_PRIVATE).edit().putString("lang", norm).apply();
            }
        }

        @JavascriptInterface
        public void pongReady() {
            pageResponded = true;
            pingHandler.removeCallbacks(loadTimeoutRunnable);
            pingHandler.removeCallbacks(pingTimeoutRunnable);
            hideMd3LoadingOverlay();
            hideUnresponsiveDialog();
        }

        @JavascriptInterface
        public String getAppVersion() {
            try {
                android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                return pi.versionName != null ? pi.versionName : "";
            } catch (Throwable ignored) {}
            return "";
        }

        @JavascriptInterface
        public int getAppVersionCode() {
            try {
                android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                return Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode;
            } catch (Throwable ignored) {}
            return 0;
        }

        /** Màu accent hệ thống (Material You, Android 12+); trả "" nếu không có. */
        @JavascriptInterface
        public String getSystemAccent() {
            try {
                if (Build.VERSION.SDK_INT >= 31) {
                    int c = getResources().getColor(android.R.color.system_accent1_600, getTheme());
                    return String.format("#%06X", c & 0xFFFFFF);
                }
            } catch (Throwable ignored) {}
            return "";
        }

        @JavascriptInterface
        public void setThemeColor(String hex) {
            try {
                final int c = Color.parseColor(hex);
                getSharedPreferences("app", MODE_PRIVATE).edit().putInt("theme", 0xFF000000 | c).apply();
                runOnUiThread(() -> applyTheme(c));
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void setArtwork(String b64) {
            try {
                Intent i = new Intent(MainActivity.this, MediaService.class);
                i.setAction(MediaService.ACTION_ART);
                i.putExtra("art", b64 == null || b64.isEmpty() ? new byte[0] : Base64.decode(b64, Base64.DEFAULT));
                startSvc(i);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void pickFiles() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"audio/*", "video/*", "text/*", "application/octet-stream", "application/x-subrip"});
                try { startActivityForResult(i, 43); } catch (Exception e) { callJs("window.addBtnCancel&&addBtnCancel()"); }
            });
        }

        @JavascriptInterface
        public void enterVideoPip(int width, int height) {
            if (Build.VERSION.SDK_INT < 26) return;
            runOnUiThread(() -> {
                try {
                    if (isInPictureInPictureMode()) return;
                    int w = width > 0 ? width : 16;
                    int h = height > 0 ? height : 9;
                    android.app.PictureInPictureParams params = new android.app.PictureInPictureParams.Builder()
                            .setAspectRatio(new android.util.Rational(w, h))
                            .build();
                    enterPictureInPictureMode(params);
                } catch (Throwable ignored) {}
            });
        }

        @JavascriptInterface
        public void pickFolder() {
            runOnUiThread(() -> {
                try { startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), 44); }
                catch (Exception e) { callJs("window.addBtnCancel&&addBtnCancel()"); }
            });
        }

        @JavascriptInterface
        public void __nativeBackFallback() {
            runOnUiThread(() -> moveTaskToBack(true));
        }

        @JavascriptInterface
        public void cancelUpdateDownload() {
            updateDownloadCancelled = true;
            updateInstallPending = false;
            waitingUnknownSourcePermission = false;
            pendingUpdateUrl = null;
            pingHandler.removeCallbacks(installerTimeoutRunnable);
        }

        @JavascriptInterface
        public void startUpdateDownload(String url) {
            if (url == null || url.trim().isEmpty()) return;
            startUpdateDownloadInternal(url.trim());
        }
    }

    private void startUpdateDownloadInternal(final String targetUrl) {
            updateDownloadCancelled = false;
            updateInstallPending = false;
            waitingUnknownSourcePermission = false;
            pendingUpdateUrl = targetUrl;
            pingHandler.removeCallbacks(installerTimeoutRunnable);
            if (!canInstallUnknownSources()) {
                openUnknownSourcesSettings(targetUrl);
                return;
            }
            new Thread(() -> {
                java.io.InputStream in = null;
                java.io.FileOutputStream out = null;
                java.net.HttpURLConnection conn = null;
                try {
                    if (updateDownloadCancelled) return;
                    java.net.URL u = new java.net.URL(targetUrl);
                    conn = (java.net.HttpURLConnection) u.openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setRequestProperty("User-Agent", "MediaPlayerApp/1.0");
                    conn.connect();
                    if (updateDownloadCancelled) return;
                    int code = conn.getResponseCode();
                    if (code < 200 || code >= 300) {
                        callJs("window.__onAndroidUpdateError&&window.__onAndroidUpdateError(" + JSONObject.quote("HTTP " + code) + ")");
                        return;
                    }
                    long total = conn.getContentLengthLong();
                    File dir = new File(getCacheDir(), "updates");
                    if (!dir.exists()) dir.mkdirs();
                    File apkFile = new File(dir, "MediaPlayer-update.apk");
                    in = conn.getInputStream();
                    out = new FileOutputStream(apkFile);
                    byte[] buf = new byte[16384];
                    long downloaded = 0;
                    int lastPct = -1;
                    int read;
                    while ((read = in.read(buf)) != -1) {
                        if (updateDownloadCancelled) {
                            try { out.close(); } catch (Exception ignored) {}
                            try { apkFile.delete(); } catch (Exception ignored) {}
                            return;
                        }
                        out.write(buf, 0, read);
                        downloaded += read;
                        if (total > 0) {
                            int pct = (int) Math.min(100, (downloaded * 100L) / total);
                            if (pct != lastPct) {
                                lastPct = pct;
                                callJs("window.__onAndroidUpdateProgress&&window.__onAndroidUpdateProgress(" + pct + "," + downloaded + "," + total + ")");
                            }
                        } else {
                            callJs("window.__onAndroidUpdateProgress&&window.__onAndroidUpdateProgress(-1," + downloaded + ",0)");
                        }
                    }
                    out.flush();
                    out.close(); out = null;
                    in.close(); in = null;
                    if (updateDownloadCancelled) return;
                    callJs("window.__onAndroidUpdateProgress&&window.__onAndroidUpdateProgress(100," + downloaded + "," + (total > 0 ? total : downloaded) + ")");
                    if (!canInstallUnknownSources()) {
                        openUnknownSourcesSettings(targetUrl);
                        return;
                    }
                    launchApkInstaller(apkFile);
                } catch (Throwable t) {
                    if (!updateDownloadCancelled) {
                        updateInstallPending = false;
                        pingHandler.removeCallbacks(installerTimeoutRunnable);
                        callJs("window.__onAndroidUpdateError&&window.__onAndroidUpdateError(" + JSONObject.quote(String.valueOf(t)) + ")");
                    }
                } finally {
                    try { if (out != null) out.close(); } catch (Exception ignored) {}
                    try { if (in != null) in.close(); } catch (Exception ignored) {}
                    try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
                }
            }).start();
    }
}
