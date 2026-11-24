package com.tuanphong.mediaplayer;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
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
    /** Đang chỉ khởi động lại WebView (recreate): giữ dịch vụ + trình phát native sống, không đưa widget về trạng thái chưa phát. */
    static volatile boolean keepPlaybackOnRecreate = false;

    private WebView web;
    private FrameLayout root;
    private View customView;
    private WebChromeClient.CustomViewCallback customCb;
    private ValueCallback<Uri[]> filePathCb;
    private static final Map<String, Uri> served = new java.util.concurrent.ConcurrentHashMap<>();
    private static final Map<String, String> servedLocations = new java.util.concurrent.ConcurrentHashMap<>();
    static Uri resolveServed(String id) { return id == null ? null : served.get(id); }
    static String resolveLocation(String id) { return id == null ? null : servedLocations.get(id); }
    static String idForLocation(String loc) {
        if (loc == null || loc.isEmpty()) return null;
        for (Map.Entry<String, String> e : servedLocations.entrySet()) {
            if (loc.equalsIgnoreCase(e.getValue())) return e.getKey();
        }
        return null;
    }
    private final Map<String, Long> servedAlbumIds = new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, File> cachedMediaFiles = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.concurrent.atomic.AtomicInteger nextId = new java.util.concurrent.atomic.AtomicInteger(1);
    private boolean pageReady = false;
    private final List<JSONObject> pending = new ArrayList<>();
    private final android.os.Handler pingHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private boolean appLeftHome = false;
    boolean isInBackgroundForMedia() {
        return appLeftHome || !hasWindowFocus();
    }
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
    private int autoRecoveries = 0;
    private final Runnable loadTimeoutRunnable = () -> {
        if (appLeftHome || pageResponded) return;
        onWatchdogTimeout();
    };
    private final Runnable pingTimeoutRunnable = () -> {
        if (appLeftHome || pageResponded) return;
        // Quay lại app mà trang không trả lời ping: tự tải lại trước (tối đa 2 lần), chỉ hiện "Trang không phản hồi" khi vẫn không được
        if (autoRecoveries < 2) { autoRecoveries++; recoverPage(); return; }
        onWatchdogTimeout();
    };
    private static final long AUTO_RELOAD_TIMEOUT_MS = 15000L;
    private static final long PING_TIMEOUT_MS = 4000L;   // quay lại app: chờ phản hồi ngắn rồi tự phục hồi

    /** Quá thời gian chờ mà trang không phản hồi: hiển thị trực tiếp màn hình "Trang không phản hồi". */
    private void onWatchdogTimeout() {
        showUnresponsiveDialog();
    }

    private final Runnable blankCheckRunnable = this::checkPageBlank;

    /** Trang trắng xóa (WebView mất nội dung sau khi bị đóng băng/thu hồi RAM nhưng app vẫn sống): tự làm mới. */
    private void scheduleBlankCheck(long delayMs) {
        pingHandler.removeCallbacks(blankCheckRunnable);
        pingHandler.postDelayed(blankCheckRunnable, delayMs);
    }

    private void checkPageBlank() {
        if (web == null || isFinishing() || isDestroyed() || appLeftHome) return;
        String url = web.getUrl();
        if (url == null || !url.startsWith("https://tuanphong3108.github.io/")) return;
        final WebView w = web;
        try {
            w.evaluateJavascript("(function(){var a=document.querySelector('.app-container');return !!(document.body&&a&&a.getBoundingClientRect().height>0)})()", value -> {
                boolean ok = "true".equals(value);
                if (ok) return;
                pageResponded = false;
                if (autoRecoveries < 2) { autoRecoveries++; recoverPage(); } else showUnresponsiveDialog();
            });
        } catch (Throwable ignored) {}
    }

    private void recoverPage() {
        try {
            pageReady = false;
            pageResponded = false;
            web.onResume();
            web.resumeTimers();
            web.stopLoading();
            web.loadUrl(APP_URL);
        } catch (Throwable ignored) {}
        pingHandler.removeCallbacks(loadTimeoutRunnable);
        pingHandler.removeCallbacks(pingTimeoutRunnable);
        pingHandler.postDelayed(loadTimeoutRunnable, AUTO_RELOAD_TIMEOUT_MS);
    }
    private final Runnable installerTimeoutRunnable = () -> {
        if (!updateInstallPending) return;
        updateInstallPending = false;
        callJs("window.__onAndroidUpdateError&&window.__onAndroidUpdateError(" + JSONObject.quote(
                isEnglishLang() ? "Installer timed out after 10s" : "Trình cài đặt không phản hồi sau 10 giây") + ")");
    };

    private static final String CRASH_PREFS = "crash_report";
    private static volatile boolean selfDestructing = false;

    static void recordCrashSync(Context ctx, String code, String reason) {
        if (ctx == null) return;
        try {
            ctx.getSharedPreferences(CRASH_PREFS, MODE_PRIVATE).edit()
                    .putString("code", code == null ? "BG_UNKNOWN_KILL" : code)
                    .putString("reason", reason == null ? "" : reason)
                    .putLong("ts", System.currentTimeMillis())
                    .putBoolean("clean_exit", false)
                    .commit();
        } catch (Throwable ignored) {}
    }

    static void recordCrashSyncIfEmpty(Context ctx, String code, String reason) {
        if (ctx == null) return;
        try {
            String existing = ctx.getSharedPreferences(CRASH_PREFS, MODE_PRIVATE).getString("code", "");
            if (existing == null || existing.isEmpty()) {
                recordCrashSync(ctx, code, reason);
            }
        } catch (Throwable ignored) {}
    }

    void destroyWebViewForSelfDestruct() {
        final WebView w = web;
        web = null;
        pageReady = false;
        pageResponded = false;
        if (w == null) return;
        Runnable tearDown = () -> {
            try { w.stopLoading(); } catch (Throwable ignored) {}
            try { w.onPause(); } catch (Throwable ignored) {}
            if (!keepPlaybackOnRecreate) {
                try { w.pauseTimers(); } catch (Throwable ignored) {}
            }
            try { w.loadUrl("about:blank"); } catch (Throwable ignored) {}
            try { if (root != null) root.removeView(w); } catch (Throwable ignored) {}
            try { w.removeAllViews(); } catch (Throwable ignored) {}
            try { w.destroy(); } catch (Throwable ignored) {}
        };
        try {
            if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) tearDown.run();
            else runOnUiThread(tearDown);
        } catch (Throwable ignored) {}
    }

    /** Combo "tự hủy thần chưởng" khi phát hiện app bị đóng/kill ở nền:
     * 1) Ghi mã lỗi đồng bộ xuống đĩa  2) Reset toàn bộ widget  3) Khôi phục accent color
     * 4) Đánh sập WebView để lần mở sau load lại sạch  5) Tắt dịch vụ & đóng hẳn tiến trình ở nền. */
    static void triggerBackgroundSelfDestruct(Context ctx, String code, String reason) {
        if (ctx == null || selfDestructing) return;
        selfDestructing = true;
        try { NativeAudio.release(); } catch (Throwable ignored) {}
        try { recordCrashSync(ctx, code, reason); } catch (Throwable ignored) {}
        try { MediaWidgetProvider.resetToIdle(ctx); } catch (Throwable ignored) {}
        try { MediaWidgetProvider.resetWidgetColors(ctx); } catch (Throwable ignored) {}
        try { ctx.stopService(new Intent(ctx, MediaService.class)); } catch (Throwable ignored) {}
        final MainActivity act = instance;
        if (act != null) {
            try { act.destroyWebViewForSelfDestruct(); } catch (Throwable ignored) {}
            try {
                if (Build.VERSION.SDK_INT >= 21) act.finishAndRemoveTask();
                else act.finishAffinity();
            } catch (Throwable ignored) {}
        }
        try { android.os.Process.killProcess(android.os.Process.myPid()); } catch (Throwable ignored) {}
    }

    /** Kiểm tra lịch sử thoát tiến trình trên Android 11+ (API 30+) để bắt cả trường hợp hệ thống kill cứng bằng SIGKILL/LMK/Freezer ở nền. */
    private void checkHistoricalExitInfo() {
        if (Build.VERSION.SDK_INT < 30) return;
        try {
            android.content.SharedPreferences sp = getSharedPreferences(CRASH_PREFS, MODE_PRIVATE);
            boolean wasClean = sp.getBoolean("clean_exit", false);
            sp.edit().putBoolean("clean_exit", false).apply();
            String alreadyRecorded = sp.getString("code", "");
            long lastHandledTs = sp.getLong("last_exit_info_ts", 0L);

            android.app.ActivityManager am = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (am == null) return;
            List<android.app.ApplicationExitInfo> reasons = am.getHistoricalProcessExitReasons(getPackageName(), 0, 1);
            if (reasons == null || reasons.isEmpty()) return;
            android.app.ApplicationExitInfo info = reasons.get(0);
            long exitTs = info.getTimestamp();
            if (exitTs <= lastHandledTs) return;
            sp.edit().putLong("last_exit_info_ts", exitTs).apply();

            int r = info.getReason();
            // Bỏ qua mọi trường hợp người dùng chủ động đóng (bấm Thoát hẳn, vuốt lên khỏi đa nhiệm, hoặc tự buộc dừng)
            if (wasClean
                    || r == android.app.ApplicationExitInfo.REASON_EXIT_SELF
                    || r == android.app.ApplicationExitInfo.REASON_USER_REQUESTED
                    || r == android.app.ApplicationExitInfo.REASON_USER_STOPPED) {
                return;
            }
            if (alreadyRecorded != null && !alreadyRecorded.isEmpty()) return;

            String code;
            switch (r) {
                case android.app.ApplicationExitInfo.REASON_LOW_MEMORY:
                    code = "BG_SYS_LOW_MEMORY"; break;
                case android.app.ApplicationExitInfo.REASON_CRASH:
                case android.app.ApplicationExitInfo.REASON_CRASH_NATIVE:
                    code = "BG_SYS_CRASH"; break;
                case android.app.ApplicationExitInfo.REASON_ANR:
                    code = "BG_SYS_ANR"; break;
                case android.app.ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE:
                    code = "BG_SYS_EXCESSIVE_RESOURCE"; break;
                case android.app.ApplicationExitInfo.REASON_SIGNALED:
                    code = "BG_SYS_SIGNALED"; break;
                case android.app.ApplicationExitInfo.REASON_FREEZER:
                    code = "BG_SYS_FREEZER"; break;
                default:
                    code = "BG_SYS_EXIT_" + r; break;
            }
            String desc = info.getDescription();
            if (desc == null || desc.trim().isEmpty()) desc = "System terminated process (reason=" + r + ", status=" + info.getStatus() + ")";
            recordCrashSync(this, code, desc);
            MediaWidgetProvider.resetToIdle(this);
            MediaWidgetProvider.resetWidgetColors(this);
        } catch (Throwable ignored) {}
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        selfDestructing = false;
        checkHistoricalExitInfo();
        // Activity mới = WebView mới = chưa phát gì (kể cả khi app vừa sập rồi mở lại): đưa các widget về trạng thái chưa mở bài nào
        if (!keepPlaybackOnRecreate) MediaWidgetProvider.resetToIdle(this);
        keepPlaybackOnRecreate = false;
        setupPredictiveBack();
        instance = this;
        root = new FrameLayout(this);
        themeColor = getSharedPreferences("app", MODE_PRIVATE).getInt("theme", 0xFF1C1B1F);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            if (customView != null) {
                v.setPadding(0, 0, 0, 0);
                return insets;
            }
            androidx.core.graphics.Insets bars = insets.getInsets(
                    androidx.core.view.WindowInsetsCompat.Type.systemBars()
                            | androidx.core.view.WindowInsetsCompat.Type.displayCutout()
                            | androidx.core.view.WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });
        applyTheme(themeColor);
        NativeAudio.warmUp(this);

        if (Build.VERSION.SDK_INT >= 33 &&
                getSharedPreferences("app", MODE_PRIVATE).getBoolean("gs_done", false) &&
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
        // Giảm tải khởi động trên máy yếu: bỏ kiểm tra Safe Browsing mỗi lần tải, tắt zoom, nâng ưu tiên tiến trình hiển thị, bật tăng tốc phần cứng
        if (Build.VERSION.SDK_INT >= 26) { try { s.setSafeBrowsingEnabled(false); } catch (Throwable ignored) {} }
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setSaveFormData(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        if (Build.VERSION.SDK_INT >= 26) { try { web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false); } catch (Throwable ignored) {} }
        s.setUserAgentString(s.getUserAgentString() + " MediaPlayerApp/1.0");
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (ASSET_HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/f/")) {
                    String fid = u.getPath().substring(3);
                    Uri src = served.get(fid);
                    if (src != null) {
                        try {
                            return serveContent(src, servedLocations.get(fid), r.getRequestHeaders());
                        } catch (Throwable e) { /* fallthrough */ }
                    }
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), null);
                }
                if (ASSET_HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/art/")) {
                    String fid = u.getPath().substring(5);
                    return serveArtwork(fid);
                }
                if (ASSET_HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/meta/")) {
                    String fid = u.getPath().substring(6);
                    return serveMetadata(fid);
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
            public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail detail) {
                boolean didCrash = false;
                int prio = -1;
                if (Build.VERSION.SDK_INT >= 26 && detail != null) {
                    try { didCrash = detail.didCrash(); } catch (Throwable ignored) {}
                    try { prio = detail.rendererPriorityAtExit(); } catch (Throwable ignored) {}
                }
                String detailMsg = (didCrash ? "WebView renderer crashed" : "WebView renderer killed by OS (low memory/background)")
                        + (prio >= 0 ? " (priority=" + prio + ")" : "");
                if (appLeftHome) {
                    // Đang chạy ở nền mà WebView bị sập/kill -> BOOM tự hủy toàn bộ để lần mở sau tải sạch và hiện mã lỗi
                    triggerBackgroundSelfDestruct(MainActivity.this,
                            didCrash ? "BG_WEBVIEW_RENDER_CRASH" : "BG_WEBVIEW_RENDER_OOM",
                            detailMsg);
                    return true;
                }
                // Đang mở trên màn hình: ghi mã lỗi, reset widget + khôi phục accent, hủy WebView cũ và dựng lại
                recordCrashSync(MainActivity.this,
                        didCrash ? "FG_WEBVIEW_RENDER_CRASH" : "FG_WEBVIEW_RENDER_OOM",
                        detailMsg);
                MediaWidgetProvider.resetToIdle(MainActivity.this);
                MediaWidgetProvider.resetWidgetColors(MainActivity.this);
                pageReady = false;
                pageResponded = false;
                pingHandler.removeCallbacks(loadTimeoutRunnable);
                pingHandler.removeCallbacks(pingTimeoutRunnable);
                destroyWebViewForSelfDestruct();
                autoRecoveries = 0;
                keepPlaybackOnRecreate = true;
                if (!isFinishing() && !isDestroyed()) pingHandler.post(() -> { try { recreate(); } catch (Throwable ignored) {} });
                return true;
            }

            @Override
            public void onPageStarted(WebView v, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(v, url, favicon);
                // Không dựng lớp phủ "đang tải" che WebView khi mở app nữa: để người dùng thấy trang tự hiện ra (giao diện web có sẵn bản khôi phục nhanh).
                pingHandler.removeCallbacks(showLoadingOverlayRunnable);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                pingHandler.removeCallbacks(showLoadingOverlayRunnable);
                if (url.startsWith("https://tuanphong3108.github.io/")) {
                    pageReady = true;
                    flushPending();
                    if (pendingWidgetCmd != null && !pendingWidgetCmd.isEmpty()) {
                        final String wcmd = pendingWidgetCmd;
                        pendingWidgetCmd = null;
                        pingHandler.postDelayed(() -> handleWidgetCmd(wcmd), 150);
                    }
                    scheduleBlankCheck(5000L);
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
                String[] accept = (p != null) ? p.getAcceptTypes() : null;
                boolean wantsImage = false;
                boolean wantsPlaylist = false;
                boolean wantsFont = false;
                if (accept != null) {
                    for (String a : accept) {
                        if (a == null) continue;
                        String low = a.toLowerCase();
                        if (low.contains("image/") || low.endsWith(".png") || low.endsWith(".jpg") || low.endsWith(".jpeg") || low.endsWith(".webp")) {
                            wantsImage = true;
                        } else if (low.contains("mpegurl") || low.endsWith(".m3u") || low.endsWith(".m3u8")) {
                            wantsPlaylist = true;
                        } else if (low.contains("font/") || low.endsWith(".ttf") || low.endsWith(".otf") || low.endsWith(".woff") || low.endsWith(".woff2")) {
                            wantsFont = true;
                        }
                    }
                }
                boolean allowMultiple = (p != null && p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                if (wantsImage) {
                    try {
                        Intent imgIntent;
                        if (Build.VERSION.SDK_INT >= 33) {
                            imgIntent = new Intent(android.provider.MediaStore.ACTION_PICK_IMAGES);
                            imgIntent.setType("image/*");
                            if (allowMultiple) {
                                imgIntent.putExtra(android.provider.MediaStore.EXTRA_PICK_IMAGES_MAX,
                                        android.provider.MediaStore.getPickImagesMaxLimit());
                            }
                        } else {
                            imgIntent = new Intent(Intent.ACTION_PICK, android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
                            imgIntent.setType("image/*");
                            if (allowMultiple) imgIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                        }
                        startActivityForResult(imgIntent, 42);
                        return true;
                    } catch (Throwable ignored) {
                        try {
                            Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                            fallback.addCategory(Intent.CATEGORY_OPENABLE);
                            fallback.setType("image/*");
                            fallback.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple);
                            startActivityForResult(Intent.createChooser(fallback, null), 42);
                            return true;
                        } catch (Exception e) {
                            filePathCb = null; cb.onReceiveValue(null); return false;
                        }
                    }
                }
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                if (wantsPlaylist || wantsFont) {
                    i.setType("*/*");
                } else {
                    i.setType("audio/*");
                    i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"audio/*", "text/*", "application/x-subrip"});
                }
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple);
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

        try { web.onResume(); web.resumeTimers(); } catch (Throwable ignored) {}
        boolean restored = false;
        if (b != null && !keepPlaybackOnRecreate) {
            try { restored = (web.restoreState(b) != null); } catch (Throwable ignored) {}
        }
        keepPlaybackOnRecreate = false;
        if (!restored) web.loadUrl(APP_URL); // SW của trang tự phục vụ offline; lỗi thì rơi về offline.html
        appLang = getSharedPreferences("app", MODE_PRIVATE).getString("lang", "vi");
        pingHandler.post(this::ensureGoogleSansFlexLoaded);   // không chặn luồng giao diện lúc khởi động
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
        pingHandler.postDelayed(loadTimeoutRunnable, AUTO_RELOAD_TIMEOUT_MS);
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
        pingHandler.postDelayed(pingTimeoutRunnable, PING_TIMEOUT_MS);
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
                    ? "The app waited over 15 seconds without receiving a response from the web page."
                    : "Ứng dụng đã chờ quá 15 giây nhưng không nhận được phản hồi từ trang web.");
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
            waitBtn.setText(en ? "Wait" : "Chờ");
            waitBtn.setAllCaps(false);
            waitBtn.setTextColor(0xFFE6E0E9);
            waitBtn.setTextSize(15f);
            applyFontToView(waitBtn, true);
            android.graphics.drawable.GradientDrawable waitBg = new android.graphics.drawable.GradientDrawable();
            waitBg.setColor(0xFF332D41);
            waitBg.setCornerRadius(999f);
            waitBtn.setBackground(pillRipple(waitBg, 0x33FFFFFF));
            pillReset(waitBtn);
            waitBtn.setPadding(btnPadH, btnPadV, btnPadH, btnPadV);
            waitBtn.setOnClickListener(v -> {
                hangAlertShown = false;
                hideUnresponsiveDialog();
                showMd3LoadingOverlay();
                pingHandler.removeCallbacks(loadTimeoutRunnable);
                pingHandler.removeCallbacks(pingTimeoutRunnable);
                pingHandler.postDelayed(pageReady ? pingTimeoutRunnable : loadTimeoutRunnable, pageReady ? PING_TIMEOUT_MS : AUTO_RELOAD_TIMEOUT_MS);
                if (pageReady) callJs("window.__androidPing&&window.__androidPing()");
            });
            android.widget.LinearLayout.LayoutParams waitLp = new android.widget.LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            waitLp.rightMargin = (int) (12 * getResources().getDisplayMetrics().density);
            waitBtn.setLayoutParams(waitLp);

            android.widget.Button restartBtn = new android.widget.Button(this);
            restartBtn.setText(en ? "Restart WebView" : "Khởi động lại WebView");
            restartBtn.setAllCaps(false);
            restartBtn.setTextColor(0xFF1C1B1F);
            restartBtn.setTextSize(15f);
            applyFontToView(restartBtn, true);
            android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
            bg.setColor(0xFFD0BCFF);
            bg.setCornerRadius(999f);
            restartBtn.setBackground(pillRipple(bg, 0x33000000));
            pillReset(restartBtn);
            restartBtn.setPadding(btnPadH, btnPadV, btnPadH, btnPadV);
            restartBtn.setOnClickListener(v -> restartWebView());

            actionsRow.addView(waitBtn);
            actionsRow.addView(restartBtn);

            box.addView(title);
            box.addView(desc);
            box.addView(actionsRow);
            hangOverlay = box;
            root.addView(hangOverlay, new FrameLayout.LayoutParams(-1, -1));
        });
    }

    /** Nền bo tròn hoàn toàn + hiệu ứng ripple cũng bo theo, thay cho nền mặc định của Button. */
    private android.graphics.drawable.Drawable pillRipple(android.graphics.drawable.GradientDrawable bg, int rippleColor) {
        android.graphics.drawable.GradientDrawable mask = new android.graphics.drawable.GradientDrawable();
        mask.setColor(0xFFFFFFFF);
        mask.setCornerRadius(999f);
        return new android.graphics.drawable.RippleDrawable(
                android.content.res.ColorStateList.valueOf(rippleColor), bg, mask);
    }

    /** Bỏ độ cao/viền mặc định của Button để hình viên thuốc không bị méo. */
    private void pillReset(android.widget.Button b) {
        b.setMinHeight(0); b.setMinimumHeight(0); b.setMinWidth(0); b.setMinimumWidth(0);
        b.setStateListAnimator(null);
        b.setElevation(0f);
        b.setSingleLine(true);
    }

    private void hideUnresponsiveDialog() {
        runOnUiThread(() -> {
            if (hangOverlay != null) {
                root.removeView(hangOverlay);
                hangOverlay = null;
            }
        });
    }

    /** Ngắt WebView treo rồi dựng WebView mới; nhạc do app (ExoPlayer) phát nên vẫn tiếp tục, trang mới tự hỏi lại trạng thái để vào đúng bài/màn hình. */
    private void restartWebView() {
        hangAlertShown = false;
        hideUnresponsiveDialog();
        pingHandler.removeCallbacks(loadTimeoutRunnable);
        pingHandler.removeCallbacks(pingTimeoutRunnable);
        pingHandler.removeCallbacks(blankCheckRunnable);
        autoRecoveries = 0;
        keepPlaybackOnRecreate = true;
        destroyWebViewForSelfDestruct();
        try { recreate(); } catch (Throwable t) { keepPlaybackOnRecreate = false; restartApp(); }
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

    /** Khung app (thanh trạng thái, thanh điều hướng, nền WebView) ăn theo màu accent của trang, tương thích Edge-to-Edge SDK 35-37. */
    void applyTheme(int c) {
        themeColor = 0xFF000000 | c;
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(themeColor);
            getWindow().setNavigationBarColor(themeColor);
        }
        if (root != null) root.setBackgroundColor(themeColor);
        if (web != null) web.setBackgroundColor(themeColor);
        double lum = (0.299 * ((themeColor >> 16) & 255) + 0.587 * ((themeColor >> 8) & 255) + 0.114 * (themeColor & 255)) / 255.0;
        boolean lightBars = lum > 0.6;
        try {
            androidx.core.view.WindowInsetsControllerCompat ctrl =
                    androidx.core.view.WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (ctrl != null) {
                ctrl.setAppearanceLightStatusBars(lightBars);
                ctrl.setAppearanceLightNavigationBars(lightBars);
            }
        } catch (Throwable ignored) {}
        if (Build.VERSION.SDK_INT < 35 && customView == null) {
            getWindow().getDecorView().setSystemUiVisibility(barFlags());
        }
    }

    private void hideBars(boolean hide) {
        try {
            androidx.core.view.WindowInsetsControllerCompat ctrl =
                    androidx.core.view.WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (ctrl != null) {
                ctrl.setSystemBarsBehavior(androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                if (hide) ctrl.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars());
                else ctrl.show(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            }
        } catch (Throwable ignored) {}
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().getDecorView().setSystemUiVisibility(hide
                    ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                      | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    : barFlags());
        }
        if (root != null) {
            if (hide) root.setPadding(0, 0, 0, 0);
            else androidx.core.view.ViewCompat.requestApplyInsets(root);
        }
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

    private volatile boolean pendingExternalOpen = false;
    private volatile String pendingWidgetCmd = null;

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
        if (uris.isEmpty() && (Intent.ACTION_VIEW.equals(a) || Intent.ACTION_SEND.equals(a) || Intent.ACTION_SEND_MULTIPLE.equals(a) || Intent.ACTION_EDIT.equals(a))) {
            // Một số trình quản lý tệp (vd. Files của ChromeOS) gửi tệp qua ClipData thay vì data/EXTRA_STREAM
            android.content.ClipData cd = i.getClipData();
            if (cd != null) {
                for (int k = 0; k < cd.getItemCount(); k++) {
                    Uri cu = cd.getItemAt(k).getUri();
                    if (cu != null) uris.add(cu);
                }
            }
        }
        if (uris.isEmpty()) {
            String widgetCmd = i.getStringExtra("widget_cmd");
            if (widgetCmd != null && !widgetCmd.isEmpty()) {
                i.removeExtra("widget_cmd");
                handleWidgetCmd(widgetCmd);
            }
            return;
        }
        i.setAction(Intent.ACTION_MAIN); // tránh nạp lại khi xoay màn hình
        pendingExternalOpen = true;
        NativeAudio.stop(); // dừng bài cũ ngay để trang ưu tiên mở tệp từ nguồn ngoài thay vì khôi phục nguồn cũ
        queueUris(uris, true);
    }


    /** Trả ảnh bìa nhúng trực tiếp bên trong chính tệp nhạc theo id (không fallback sang albumart chung của thư mục để tránh gán nhầm ảnh bài khác). */
    private WebResourceResponse serveArtwork(String fid) {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "no-store, must-revalidate");
        Uri src = served.get(fid);
        if (src == null) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, null);
        byte[] bytes = null;
        String mimeType = "image/jpeg";
        android.media.MediaMetadataRetriever mmr = null;
        try {
            mmr = new android.media.MediaMetadataRetriever();
            String directPath = servedLocations.get(fid);
            if (directPath != null && new File(directPath).canRead()) {
                mmr.setDataSource(directPath);
            } else {
                mmr.setDataSource(this, src);
            }
            bytes = mmr.getEmbeddedPicture();
        } catch (Throwable ignored) {
        } finally {
            if (mmr != null) { try { mmr.release(); } catch (Throwable ignored) {} }
        }
        if (bytes != null && bytes.length > 0) {
            if (bytes.length >= 4 && bytes[0] == (byte) 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) {
                mimeType = "image/png";
            } else if (bytes.length >= 12 && bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46
                    && bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50) {
                mimeType = "image/webp";
            }
            h.put("Content-Length", String.valueOf(bytes.length));
            return new WebResourceResponse(mimeType, null, 200, "OK", h, new java.io.ByteArrayInputStream(bytes));
        }
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, null);
    }

    /** Đọc metadata + (tuỳ chọn) ảnh bìa thu nhỏ 144px dạng base64 từ chính tệp gốc qua MediaMetadataRetriever. */
    private String extractMetadataJsonInternal(String nativeId, boolean includeThumb) {
        if (nativeId == null || nativeId.isEmpty()) return "";
        Uri src = served.get(nativeId);
        String directPath = servedLocations.get(nativeId);
        if (src == null && (directPath == null || directPath.isEmpty())) return "";
        android.media.MediaMetadataRetriever mmr = null;
        try {
            mmr = new android.media.MediaMetadataRetriever();
            if (directPath != null && new File(directPath).canRead()) {
                mmr.setDataSource(directPath);
            } else if (src != null) {
                mmr.setDataSource(this, src);
            } else {
                return "";
            }
            JSONObject o = new JSONObject();
            String t = mmr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_TITLE);
            String ar = mmr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ARTIST);
            if (ar == null || ar.trim().isEmpty() || "<unknown>".equalsIgnoreCase(ar.trim())) {
                ar = mmr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST);
            }
            String al = mmr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUM);
            String yr = mmr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_YEAR);
            if (yr == null || yr.trim().isEmpty()) {
                String dt = mmr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DATE);
                if (dt != null && dt.trim().length() >= 4) yr = dt.trim().substring(0, 4);
            }
            String gn = mmr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_GENRE);
            String cp = mmr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_COMPOSER);
            if (cp == null || cp.trim().isEmpty()) {
                cp = mmr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_WRITER);
            }
            if (t != null && !t.trim().isEmpty()) o.put("title", t.trim());
            if (ar != null && !ar.trim().isEmpty() && !"<unknown>".equalsIgnoreCase(ar.trim())) o.put("artist", ar.trim());
            if (al != null && !al.trim().isEmpty() && !"<unknown>".equalsIgnoreCase(al.trim())) o.put("album", al.trim());
            if (yr != null && !yr.trim().isEmpty()) o.put("year", yr.trim());
            if (gn != null && !gn.trim().isEmpty()) o.put("genre", gn.trim());
            if (cp != null && !cp.trim().isEmpty()) o.put("composer", cp.trim());

            try {
                String embeddedLyrics = EmbeddedLyricsReader.read(this, directPath, src);
                if (embeddedLyrics != null && !embeddedLyrics.isEmpty()) {
                    o.put("lyrics", embeddedLyrics);
                }
            } catch (Throwable ignored) {}

            byte[] pic = mmr.getEmbeddedPicture();
            if (pic != null && pic.length > 0) {
                o.put("hasPicture", true);
                o.put("artUrl", "https://" + ASSET_HOST + "/art/" + nativeId);
                if (includeThumb) {
                    try {
                        android.graphics.BitmapFactory.Options bounds = new android.graphics.BitmapFactory.Options();
                        bounds.inJustDecodeBounds = true;
                        android.graphics.BitmapFactory.decodeByteArray(pic, 0, pic.length, bounds);
                        int sample = 1;
                        int maxDim = Math.max(bounds.outWidth, bounds.outHeight);
                        while (maxDim / (sample * 2) >= 144) sample *= 2;
                        android.graphics.BitmapFactory.Options opts = new android.graphics.BitmapFactory.Options();
                        opts.inSampleSize = sample;
                        android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(pic, 0, pic.length, opts);
                        if (bmp != null) {
                            int bw = bmp.getWidth(), bh = bmp.getHeight();
                            int s = Math.min(bw, bh);
                            android.graphics.Bitmap cropped = (bw != bh && s > 0)
                                    ? android.graphics.Bitmap.createBitmap(bmp, (bw - s) / 2, (bh - s) / 2, s, s)
                                    : bmp;
                            android.graphics.Bitmap scaled = (cropped.getWidth() > 144 || cropped.getHeight() > 144)
                                    ? android.graphics.Bitmap.createScaledBitmap(cropped, 144, 144, true)
                                    : cropped;
                            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                            scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 78, bos);
                            byte[] jpg = bos.toByteArray();
                            if (scaled != cropped) scaled.recycle();
                            if (cropped != bmp) cropped.recycle();
                            bmp.recycle();
                            if (jpg.length > 0) {
                                o.put("thumb", "data:image/jpeg;base64," + android.util.Base64.encodeToString(jpg, android.util.Base64.NO_WRAP));
                            }
                        }
                    } catch (Throwable ignored) {}
                }
            } else {
                o.put("hasPicture", false);
            }
            return o.toString();
        } catch (Throwable ignored) {
            return "";
        } finally {
            if (mmr != null) { try { mmr.release(); } catch (Throwable ignored) {} }
        }
    }

    /** Endpoint bất đồng bộ /meta/<id> chạy trên luồng IO của WebView để JS đọc song song 3 tệp cùng lúc mà không chặn UI. */
    private WebResourceResponse serveMetadata(String fid) {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "no-store, must-revalidate");
        String json = extractMetadataJsonInternal(fid, true);
        if (json == null || json.isEmpty()) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, null);
        }
        byte[] data = json.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        h.put("Content-Length", String.valueOf(data.length));
        return new WebResourceResponse("application/json", "utf-8", 200, "OK", h, new java.io.ByteArrayInputStream(data));
    }

    /** Lấy hoặc tạo bản sao cục bộ trong cache/media_stream/ để phát Range nhanh, seek chuẩn bằng RandomAccessFile và không bị mất quyền URI khi chạy nền. */
    private File ensureLocalSeekableFile(Uri src) {
        return ensureLocalSeekableFile(src, null);
    }

    private File ensureLocalSeekableFile(Uri src, String directPath) {
        if (directPath != null && !directPath.isEmpty()) {
            try {
                File direct = new File(directPath);
                if (direct.exists() && direct.isFile() && direct.canRead() && direct.length() > 0) {
                    return direct;
                }
            } catch (Throwable ignored) {}
        }
        String key = src.toString();
        File existing = cachedMediaFiles.get(key);
        if (existing != null && existing.exists() && existing.length() > 0) return existing;
        try {
            File dir = new File(getCacheDir(), "media_stream");
            if (!dir.exists()) dir.mkdirs();
            File[] oldFiles = dir.listFiles();
            if (oldFiles != null && oldFiles.length > 6) {
                java.util.Arrays.sort(oldFiles, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
                for (int i = 0; i < oldFiles.length - 4; i++) {
                    try { oldFiles[i].delete(); } catch (Throwable ignored) {}
                }
            }
            String safeName = displayName(src).replaceAll("[\\\\/:*?\"<>|]", "_");
            String hash = Integer.toHexString(key.hashCode());
            File outFile = new File(dir, hash + "_" + safeName);
            long expectedSize = querySize(src);
            if (outFile.exists() && outFile.length() > 0 && (expectedSize <= 0 || outFile.length() == expectedSize)) {
                outFile.setLastModified(System.currentTimeMillis());
                cachedMediaFiles.put(key, outFile);
                return outFile;
            }
            File tmpFile = new File(dir, hash + "_" + System.nanoTime() + ".tmp");
            try (InputStream in = getContentResolver().openInputStream(src);
                 FileOutputStream out = new FileOutputStream(tmpFile)) {
                if (in == null) return null;
                byte[] buf = new byte[65536];
                int r;
                while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
                out.flush();
            }
            if (tmpFile.exists() && tmpFile.length() > 0) {
                if (outFile.exists()) outFile.delete();
                if (tmpFile.renameTo(outFile) && outFile.length() > 0) {
                    cachedMediaFiles.put(key, outFile);
                    return outFile;
                }
                return tmpFile;
            }
        } catch (Throwable ignored) {}
        return null;
    }

    /** Phát nội dung content:// kèm hỗ trợ HTTP Range để video tua/phát theo từng đoạn, không nạp cả tệp vào RAM. */
    private WebResourceResponse serveContent(Uri src, String directPath, Map<String, String> reqHeaders) throws Exception {
        String mime = getContentResolver().getType(src);
        if (mime == null || "application/octet-stream".equals(mime) || "video/*".equals(mime) || "audio/*".equals(mime)) {
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

        final File localFile = ensureLocalSeekableFile(src, directPath);
        long total = (localFile != null && localFile.exists()) ? localFile.length() : -1;
        android.content.res.AssetFileDescriptor afd = null;
        if (total <= 0) {
            afd = getContentResolver().openAssetFileDescriptor(src, "r");
            total = afd == null ? -1 : afd.getLength();
            if (total <= 0) {
                long queried = querySize(src);
                if (queried > 0) total = queried;
            }
        }
        if (total <= 0) {
            if (afd != null) afd.close();
            InputStream in = getContentResolver().openInputStream(src);
            return new WebResourceResponse(mime, null, 200, "OK", h, in);
        }
        String range = null;
        if (reqHeaders != null) for (Map.Entry<String, String> e : reqHeaders.entrySet()) if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
        long rangeStart = 0, rangeEnd = total - 1;
        boolean partial = false;
        if (range != null && range.startsWith("bytes=")) {
            try {
                String[] p = range.substring(6).split(",")[0].trim().split("-", -1);
                if (p[0].isEmpty()) { long n = Long.parseLong(p[1]); rangeStart = Math.max(0, total - n); }
                else { rangeStart = Long.parseLong(p[0]); if (p.length > 1 && !p[1].isEmpty()) rangeEnd = Math.min(rangeEnd, Long.parseLong(p[1])); }
                if (rangeStart > rangeEnd || rangeStart >= total) {
                    if (afd != null) afd.close();
                    h.put("Content-Range", "bytes */" + total);
                    return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", h, null);
                }
                partial = true;
            } catch (Exception ex) { rangeStart = 0; rangeEnd = total - 1; partial = false; }
        }
        final long start = rangeStart;
        final long end = rangeEnd;
        final long len = end - start + 1;
        final android.content.res.AssetFileDescriptor fafd = afd;
        InputStream bounded = new InputStream() {
            java.io.RandomAccessFile raf = null;
            InputStream raw = null;
            long toSkip = start;
            long left = len;
            boolean closed = false;

            private void ensureStream() throws java.io.IOException {
                if (raf != null || raw != null) return;
                if (localFile != null && localFile.exists()) {
                    raf = new java.io.RandomAccessFile(localFile, "r");
                    raf.seek(toSkip);
                    return;
                }
                try {
                    raw = getContentResolver().openInputStream(src);
                } catch (Throwable ignored) {}
                if (raw == null && fafd != null) raw = fafd.createInputStream();
                if (raw == null) throw new java.io.IOException("Cannot open stream");
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
                int r;
                if (raf != null) {
                    r = raf.read(b, off, (int) Math.min(n, left));
                } else {
                    r = raw.read(b, off, (int) Math.min(n, left));
                }
                if (r > 0) left -= r;
                return r;
            }

            @Override public synchronized int available() throws java.io.IOException {
                if (closed || left <= 0) return 0;
                return (int) Math.min(left, 65536);
            }

            @Override public synchronized void close() throws java.io.IOException {
                if (closed) return;
                closed = true;
                try {
                    if (raf != null) raf.close();
                    if (raw != null) raw.close();
                } finally {
                    if (fafd != null) fafd.close();
                }
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
        boolean hadExternal = false;
        for (JSONObject o : pending) {
            if (o != null && o.optBoolean("fromExternal", false)) hadExternal = true;
            arr.put(o);
        }
        pending.clear();
        String js = "(function(l){if(window.__nativeOpenFiles)window.__nativeOpenFiles(l);else window.__pendingNativeFiles=(window.__pendingNativeFiles||[]).concat(l);})(" + arr + ");";
        web.evaluateJavascript(js, null);
        if (hadExternal) pendingExternalOpen = false;
    }

    private void startSvc(Intent i) {
        try { if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i); } catch (Exception ignored) {}
    }

    /** Chạy JS và ghi nhận trang còn phản hồi (callback chỉ chạy khi renderer xử lý xong) — dùng để biết WebView còn sống cho trình phát native. */
    void evalAck(final String js) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, v -> NativeAudio.lastAck = android.os.SystemClock.elapsedRealtime()); });
    }

    /** Thăm dò WebView: còn phản hồi trong ~900ms thì alive, không thì dead (chỉ gọi một trong hai, một lần). */
    void probeWeb(final Runnable alive, final Runnable dead) {
        final boolean[] done = { false };
        final android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
        runOnUiThread(() -> {
            if (web == null) { dead.run(); return; }
            h.postDelayed(() -> { if (!done[0]) { done[0] = true; dead.run(); } }, 900);
            web.evaluateJavascript("1", v -> { if (!done[0]) { done[0] = true; NativeAudio.lastAck = android.os.SystemClock.elapsedRealtime(); alive.run(); } });
        });
    }

    void callJs(final String js) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    private boolean isDisallowedVideoUri(Uri u) {
        if (u == null) return true;
        String mime = null;
        try { mime = getContentResolver().getType(u); } catch (Exception ignored) {}
        if (mime != null && mime.toLowerCase().startsWith("video/")) return true;
        String ln = displayName(u).toLowerCase();
        return ln.endsWith(".mp4") || ln.endsWith(".m4v") || ln.endsWith(".webm")
                || ln.endsWith(".mkv") || ln.endsWith(".mov") || ln.endsWith(".ogv")
                || ln.endsWith(".3gp") || ln.endsWith(".avi");
    }

    private String resolveUriLocation(Uri u) {
        if (u == null) return "";
        try {
            if ("file".equalsIgnoreCase(u.getScheme())) {
                String p = u.getPath();
                if (p != null && !p.isEmpty()) return p;
            }
            try (Cursor c = getContentResolver().query(u, new String[]{"_data", "relative_path", OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int dataIdx = c.getColumnIndex("_data");
                    if (dataIdx >= 0 && !c.isNull(dataIdx)) {
                        String absPath = c.getString(dataIdx);
                        if (absPath != null && !absPath.trim().isEmpty()) return absPath.trim();
                    }
                    int relIdx = c.getColumnIndex("relative_path");
                    int nameIdx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    String rel = (relIdx >= 0 && !c.isNull(relIdx)) ? c.getString(relIdx) : "";
                    String disp = (nameIdx >= 0 && !c.isNull(nameIdx)) ? c.getString(nameIdx) : "";
                    if (rel != null && !rel.isEmpty()) {
                        return "/storage/emulated/0/" + rel + (disp != null ? disp : "");
                    }
                }
            } catch (Throwable ignored) {}
            if (DocumentsContract.isDocumentUri(this, u)) {
                String docId = DocumentsContract.getDocumentId(u);
                if (docId != null && docId.startsWith("primary:")) {
                    return "/storage/emulated/0/" + docId.substring("primary:".length());
                }
                if (docId != null && docId.startsWith("raw:")) {
                    return docId.substring("raw:".length());
                }
            }
        } catch (Throwable ignored) {}
        return u.toString();
    }

    private void takePersistableRwPermission(Uri u, Intent sourceIntent) {
        if (u == null) return;
        try {
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            if (sourceIntent != null) {
                int granted = sourceIntent.getFlags() & flags;
                if (granted != 0) flags = granted;
            }
            getContentResolver().takePersistableUriPermission(u, flags);
        } catch (Throwable ignored) {
            try {
                getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Throwable ignored2) {}
        }
    }

    private final java.util.concurrent.ExecutorService prefetchExec = java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "media-prefetch");
        t.setPriority(Thread.MIN_PRIORITY);
        return t;
    });

    /** Sao chép sẵn tệp nhạc đầu tiên vào cache nền, để lúc phát không phải chờ sao chép nên không bị khựng ở đầu bài. */
    private void prefetchFirst(List<Uri> uris) {
        if (uris == null || uris.isEmpty()) return;
        final Uri first = uris.get(0);
        prefetchExec.execute(() -> { try { ensureLocalSeekableFile(first); } catch (Throwable ignored) {} });
    }

    private void queueUris(List<Uri> uris) {
        queueUris(uris, false);
    }

    private void queueUris(List<Uri> uris, boolean fromExternal) {
        prefetchFirst(uris);
        for (Uri u : uris) {
            try {
                if (isDisallowedVideoUri(u)) continue;
                String id = String.valueOf(nextId.getAndIncrement());
                String loc = resolveUriLocation(u);
                served.put(id, u);
                if (loc != null && !loc.isEmpty()) servedLocations.put(id, loc);
                JSONObject o = new JSONObject();
                o.put("id", id);
                o.put("location", loc);
                o.put("uri", u.toString());
                o.put("url", "https://" + ASSET_HOST + "/f/" + id);
                o.put("name", displayName(u));
                String t = getContentResolver().getType(u);
                o.put("type", t == null ? "" : t);
                o.put("size", querySize(u));
                o.put("modified", queryModified(u));
                if (fromExternal) o.put("fromExternal", true);
                pending.add(o);
            } catch (Exception ignored) {}
        }
        flushPending();
    }

    /** Duyệt đệ quy thư mục (SAF tree) lấy file nhạc + lời/phụ đề đi kèm (bỏ qua video). */
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
                if (mime != null && mime.toLowerCase().startsWith("video/")) continue;
                if (ln.endsWith(".mp4") || ln.endsWith(".m4v") || ln.endsWith(".webm")
                        || ln.endsWith(".mkv") || ln.endsWith(".mov") || ln.endsWith(".ogv")
                        || ln.endsWith(".3gp") || ln.endsWith(".avi")) continue;
                if ((mime != null && mime.startsWith("audio/"))
                        || ln.endsWith(".lrc") || ln.endsWith(".srt") || ln.endsWith(".vtt")
                        || ln.endsWith(".mp3") || ln.endsWith(".flac") || ln.endsWith(".m4a") || ln.endsWith(".ogg") || ln.endsWith(".opus")
                        || ln.endsWith(".wav"))
                    out.add(DocumentsContract.buildDocumentUriUsingTree(tree, id));
            }
        } catch (Exception ignored) {}
    }

    void sendCmd(final String cmd) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.__nativeCmd&&window.__nativeCmd('" + cmd + "')", null); });
    }

    /** Khi người dùng thao tác trên Widget: cố gắng đánh thức WebView (onResume/resumeTimers), gửi lệnh + ép đồng bộ UI & widget; nếu WebView bị đóng băng thì fallback sang trình phát native. */
    void handleWidgetCmd(final String cmd) {
        if (cmd == null || cmd.isEmpty()) return;
        runOnUiThread(() -> {
            if (web == null || !pageReady) {
                pendingWidgetCmd = cmd;
                if (NativeAudio.active()) runNativeWidgetFallback(cmd);
                return;
            }
            try { web.onResume(); web.resumeTimers(); } catch (Throwable ignored) {}
            final boolean[] acked = { false };
            final String js = "(function(){try{"
                    + "if(window.__nativeCmd)window.__nativeCmd(" + JSONObject.quote(cmd) + ");"
                    + "if(window.__syncMobileMiniPlayer)window.__syncMobileMiniPlayer();"
                    + "if(window.__reportMediaState)window.__reportMediaState();"
                    + "if(window.__syncAndroidWidgets)window.__syncAndroidWidgets();"
                    + "}catch(e){}return 1;})()";
            pingHandler.postDelayed(() -> {
                if (!acked[0]) {
                    if (NativeAudio.active()) runNativeWidgetFallback(cmd);
                    if (web != null) {
                        try { web.onResume(); web.resumeTimers(); } catch (Throwable ignored) {}
                    }
                }
            }, 900);
            try {
                web.evaluateJavascript(js, v -> {
                    acked[0] = true;
                    NativeAudio.lastAck = android.os.SystemClock.elapsedRealtime();
                    pingHandler.postDelayed(() -> {
                        if (web != null) {
                            try {
                                web.evaluateJavascript("try{window.__syncMobileMiniPlayer&&window.__syncMobileMiniPlayer();window.__reportMediaState&&window.__reportMediaState();window.__syncAndroidWidgets&&window.__syncAndroidWidgets();}catch(e){}", null);
                            } catch (Throwable ignored) {}
                        }
                    }, 300);
                });
            } catch (Throwable ignored) {
                if (NativeAudio.active()) runNativeWidgetFallback(cmd);
            }
        });
    }

    private void runNativeWidgetFallback(String cmd) {
        if ("toggle".equals(cmd)) NativeAudio.toggle();
        else if ("next".equals(cmd)) { if (!NativeAudio.advance()) NativeAudio.seek(0); }
        else if ("prev".equals(cmd)) NativeAudio.previous();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 101 && hasMediaPermissionInternal() && hasImagesPermissionInternal() && !hasAllFilesAccessInternal()) {
            openAllFilesAccessSettings();   // đã cho đọc nhạc & toàn bộ hình ảnh -> chuyển tiếp sang cấp quyền toàn bộ tệp
        }
        if (requestCode == 104) {
            callJs("window.__onNearbyPermResult&&window.__onNearbyPermResult(" + hasNearbyPermissionInternal() + ")");
        }
        if (requestCode == 101 || requestCode == 102 || requestCode == 103 || requestCode == 105) {
            callJs("window.__onAndroidPermissionsUpdated&&window.__onAndroidPermissionsUpdated(" + getPermissionsStatusJson() + ")");
        }
    }

    private String getPermissionsStatusJson() {
        boolean audio = hasMediaPermissionInternal();
        boolean images = hasImagesPermissionInternal();
        boolean allFiles = hasAllFilesAccessInternal();
        boolean media = audio && images && allFiles;
        boolean notif = hasNotificationPermissionInternal();
        boolean battery = isIgnoringBatteryOptimizationsInternal();
        try {
            JSONObject o = new JSONObject();
            o.put("media", media);
            o.put("audio", audio);
            o.put("images", images);
            o.put("allFiles", allFiles);
            o.put("notifications", notif);
            o.put("battery", battery);
            return o.toString();
        } catch (Throwable ignored) {
            return "{\"media\":" + media + ",\"audio\":" + audio + ",\"images\":" + images + ",\"allFiles\":" + allFiles + ",\"notifications\":" + notif + ",\"battery\":" + battery + "}";
        }
    }

    /** Quyền "Truy cập tất cả hình ảnh" (Android 13+): kiểm tra đúng READ_MEDIA_IMAGES (chọn một phần READ_MEDIA_VISUAL_USER_SELECTED vẫn trả false). */
    private boolean hasImagesPermissionInternal() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
        }
        if (Build.VERSION.SDK_INT >= 23) {
            return checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    /** Quyền "Quản lý toàn bộ tệp" (Android 11+) - cần để Metadata Editor ghi trực tiếp vào tệp nhạc. */
    private boolean hasAllFilesAccessInternal() {
        if (Build.VERSION.SDK_INT >= 30) {
            try { return android.os.Environment.isExternalStorageManager(); } catch (Throwable t) { return false; }
        }
        if (Build.VERSION.SDK_INT >= 23) {
            return checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    /** Đủ quyền để app dùng: đọc nhạc + truy cập tất cả hình ảnh + truy cập toàn bộ tệp. */
    private boolean hasFullMediaAccessInternal() {
        return hasMediaPermissionInternal() && hasImagesPermissionInternal() && hasAllFilesAccessInternal();
    }

    private void openAllFilesAccessSettings() {
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                Intent i = new Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                i.setData(Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } catch (Throwable ex) {
                try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)); } catch (Throwable ignored) {}
            }
        } else if (Build.VERSION.SDK_INT >= 23) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 103);
        }
    }

    // ===== Chọn thiết bị đầu ra (Bluetooth cần quyền "Thiết bị ở gần" = BLUETOOTH_CONNECT trên Android 12+) =====
    private boolean hasNearbyPermissionInternal() {
        if (Build.VERSION.SDK_INT >= 31) {
            return checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private String getOutputDevicesJsonInternal() {
        JSONArray arr = new JSONArray();
        try {
            android.media.AudioManager am = (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
            android.media.AudioDeviceInfo[] devs = am.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS);
            java.util.Set<Integer> routed = new java.util.HashSet<>();
            if (Build.VERSION.SDK_INT >= 33) {
                try {
                    android.media.AudioAttributes aa = new android.media.AudioAttributes.Builder()
                            .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC).build();
                    for (android.media.AudioDeviceInfo d : am.getAudioDevicesForAttributes(aa)) routed.add(d.getId());
                } catch (Throwable ignored) {}
            }
            boolean anyBt = false, anyWired = false;
            List<JSONObject> items = new ArrayList<>();
            for (android.media.AudioDeviceInfo d : devs) {
                int t = d.getType();
                String kind;
                if (t == android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) kind = "speaker";
                else if (t == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || (Build.VERSION.SDK_INT >= 31 && (t == android.media.AudioDeviceInfo.TYPE_BLE_HEADSET || t == android.media.AudioDeviceInfo.TYPE_BLE_SPEAKER || t == android.media.AudioDeviceInfo.TYPE_BLE_BROADCAST))) { kind = "bluetooth"; anyBt = true; }
                else if (t == android.media.AudioDeviceInfo.TYPE_WIRED_HEADPHONES || t == android.media.AudioDeviceInfo.TYPE_WIRED_HEADSET) { kind = "wired"; anyWired = true; }
                else if (t == android.media.AudioDeviceInfo.TYPE_USB_DEVICE || t == android.media.AudioDeviceInfo.TYPE_USB_HEADSET || t == android.media.AudioDeviceInfo.TYPE_USB_ACCESSORY) { kind = "usb"; anyWired = true; }
                else if (t == android.media.AudioDeviceInfo.TYPE_HDMI || t == android.media.AudioDeviceInfo.TYPE_HDMI_ARC) kind = "hdmi";
                else if (t == android.media.AudioDeviceInfo.TYPE_HEARING_AID) kind = "hearing";
                else continue;   // bỏ SCO/cuộc gọi/ống nghe
                JSONObject o = new JSONObject();
                o.put("id", d.getId());
                o.put("kind", kind);
                CharSequence nm = d.getProductName();
                o.put("name", nm == null ? "" : nm.toString());
                items.add(o);
            }
            for (JSONObject o : items) {
                boolean active;
                if (Build.VERSION.SDK_INT >= 33 && !routed.isEmpty()) active = routed.contains(o.getInt("id"));
                else {
                    String k = o.getString("kind");
                    active = anyBt ? k.equals("bluetooth") : anyWired ? (k.equals("wired") || k.equals("usb")) : k.equals("speaker");
                }
                o.put("active", active);
                arr.put(o);
            }
        } catch (Throwable ignored) {}
        return arr.toString();
    }

    private boolean hasMediaPermissionInternal() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }
        if (Build.VERSION.SDK_INT >= 23) {
            return checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private boolean hasNotificationPermissionInternal() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private java.util.Set<String> getExcludedDirsSet() {
        java.util.Set<String> raw = getSharedPreferences("app", MODE_PRIVATE).getStringSet("excluded_dirs", null);
        java.util.Set<String> out = new java.util.HashSet<>();
        if (raw != null) {
            for (String p : raw) {
                if (p != null && !p.trim().isEmpty()) {
                    String norm = p.trim();
                    while (norm.length() > 1 && norm.endsWith("/")) norm = norm.substring(0, norm.length() - 1);
                    out.add(norm);
                }
            }
        }
        return out;
    }

    private boolean isPathExcluded(String parentDir, java.util.Set<String> excluded) {
        if (excluded.isEmpty() || parentDir == null || parentDir.isEmpty()) return false;
        String norm = parentDir;
        while (norm.length() > 1 && norm.endsWith("/")) norm = norm.substring(0, norm.length() - 1);
        for (String ex : excluded) {
            if (norm.equalsIgnoreCase(ex) || norm.toLowerCase().startsWith(ex.toLowerCase() + "/")) {
                return true;
            }
        }
        return false;
    }

    private boolean isAudioFileName(String ln) {
        if (ln == null) return false;
        return ln.endsWith(".mp3") || ln.endsWith(".m4a") || ln.endsWith(".aac")
                || ln.endsWith(".flac") || ln.endsWith(".ogg") || ln.endsWith(".oga")
                || ln.endsWith(".opus") || ln.endsWith(".wav") || ln.endsWith(".wma")
                || ln.endsWith(".amr") || ln.endsWith(".3ga") || ln.endsWith(".m4b")
                || ln.endsWith(".alac") || ln.endsWith(".aiff") || ln.endsWith(".aif");
    }

    private String guessAudioMime(String ln) {
        if (ln == null) return "audio/mpeg";
        if (ln.endsWith(".flac")) return "audio/flac";
        if (ln.endsWith(".m4a") || ln.endsWith(".aac") || ln.endsWith(".m4b")) return "audio/mp4";
        if (ln.endsWith(".ogg") || ln.endsWith(".oga")) return "audio/ogg";
        if (ln.endsWith(".opus")) return "audio/opus";
        if (ln.endsWith(".wav")) return "audio/wav";
        return "audio/mpeg";
    }

    private void walkStorageForAudio(File dir, int depth, java.util.Set<String> excluded,
                                     boolean autoScanLrc, java.util.Map<String, String> lrcByStem,
                                     List<File> outAudio) {
        if (dir == null || depth > 5 || !dir.isDirectory() || !dir.canRead()) return;
        String dirPath = dir.getAbsolutePath();
        if (dirPath.contains("/.")) return;
        if (depth == 1) {
            String top = dir.getName() == null ? "" : dir.getName().toLowerCase();
            if ("android".equals(top) || "dcim".equals(top) || "pictures".equals(top)
                    || "movies".equals(top) || "alarms".equals(top) || "ringtones".equals(top)
                    || "notifications".equals(top) || "podcasts".equals(top) || "coloros".equals(top)
                    || "miui".equals(top) || "heytap".equals(top) || "obb".equals(top)) return;
        }
        String lowPath = dirPath.toLowerCase();
        if (lowPath.endsWith("/android/data") || lowPath.endsWith("/android/obb")
                || lowPath.contains("/android/data/") || lowPath.contains("/android/obb/")) return;
        if (isPathExcluded(dirPath, excluded)) return;
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File ch : children) {
            if (ch == null) continue;
            String nm = ch.getName();
            if (nm == null || nm.startsWith(".")) continue;
            if (ch.isDirectory()) {
                if (new File(ch, ".nomedia").exists()) continue;
                walkStorageForAudio(ch, depth + 1, excluded, autoScanLrc, lrcByStem, outAudio);
            } else if (ch.isFile() && ch.length() > 0) {
                String ln = nm.toLowerCase();
                if (autoScanLrc && ln.endsWith(".lrc")) {
                    int dot = nm.lastIndexOf('.');
                    String stem = (dot > 0 ? nm.substring(0, dot) : nm).toLowerCase();
                    String key = dirPath.toLowerCase() + "/" + stem;
                    if (!lrcByStem.containsKey(key)) {
                        lrcByStem.put(key, Uri.fromFile(ch).toString());
                    }
                } else if (isAudioFileName(ln)) {
                    outAudio.add(ch);
                }
            }
        }
    }

    private void scanAllDeviceAudioInternal(final boolean clearExisting) {
        if (!hasMediaPermissionInternal() && !hasAllFilesAccessInternal()) {
            callJs("window.__onAndroidLibraryScanDone&&window.__onAndroidLibraryScanDone(0, true)");
            return;
        }
        new Thread(() -> {
            List<JSONObject> phase1 = new ArrayList<>();
            java.util.Set<String> seenPaths = new java.util.HashSet<>();
            java.util.Set<String> excluded = getExcludedDirsSet();
            android.content.SharedPreferences appSp = getSharedPreferences("app", MODE_PRIVATE);
            int minDurSec = Math.max(0, appSp.getInt("min_duration_sec", 0));
            long minDurMs = minDurSec * 1000L;
            boolean autoScanLrc = appSp.getBoolean("auto_scan_lrc", true);
            java.util.Map<String, String> lrcByStem = new java.util.HashMap<>();
            if (autoScanLrc) try {
                // Quét cả tệp .lrc qua MediaStore.Files nếu có quyền để tự ghép lời bài hát
                android.net.Uri filesUri = android.provider.MediaStore.Files.getContentUri("external");
                try (Cursor fc = getContentResolver().query(filesUri,
                        new String[]{android.provider.MediaStore.MediaColumns._ID, android.provider.MediaStore.MediaColumns.DATA},
                        "LOWER(" + android.provider.MediaStore.MediaColumns.DATA + ") LIKE '%.lrc'",
                        null, null)) {
                    if (fc != null) {
                        int idCol = fc.getColumnIndex(android.provider.MediaStore.MediaColumns._ID);
                        int dataCol = fc.getColumnIndex(android.provider.MediaStore.MediaColumns.DATA);
                        while (fc.moveToNext()) {
                            String lrcPath = dataCol >= 0 ? fc.getString(dataCol) : null;
                            if (lrcPath == null || lrcPath.isEmpty()) continue;
                            File lf = new File(lrcPath);
                            String parent = lf.getParent();
                            if (isPathExcluded(parent, excluded)) continue;
                            String name = lf.getName();
                            int dot = name.lastIndexOf('.');
                            String stem = (dot > 0 ? name.substring(0, dot) : name).toLowerCase();
                            String key = (parent == null ? "" : parent.toLowerCase()) + "/" + stem;
                            long fid = idCol >= 0 ? fc.getLong(idCol) : -1L;
                            if (fid >= 0) {
                                lrcByStem.put(key, android.content.ContentUris.withAppendedId(filesUri, fid).toString());
                            }
                        }
                    }
                } catch (Throwable ignored) {}
            } catch (Throwable ignored) {}

            // PHA 1 (Tức thì): Quét MediaStore không chặn bởi MediaMetadataRetriever -> đẩy ngay lên giao diện
            try {
                android.net.Uri audioUri = android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                String[] proj = new String[]{
                        android.provider.MediaStore.Audio.Media._ID,
                        android.provider.MediaStore.Audio.Media.DISPLAY_NAME,
                        android.provider.MediaStore.Audio.Media.DATA,
                        android.provider.MediaStore.Audio.Media.MIME_TYPE,
                        android.provider.MediaStore.Audio.Media.SIZE,
                        android.provider.MediaStore.Audio.Media.DATE_MODIFIED,
                        android.provider.MediaStore.Audio.Media.DURATION,
                        android.provider.MediaStore.Audio.Media.TITLE,
                        android.provider.MediaStore.Audio.Media.ARTIST,
                        android.provider.MediaStore.Audio.Media.ALBUM,
                        android.provider.MediaStore.Audio.Media.ALBUM_ID,
                        android.provider.MediaStore.Audio.Media.YEAR
                };
                String sel = android.provider.MediaStore.Audio.Media.DATA + " IS NOT NULL";
                try (Cursor c = getContentResolver().query(audioUri, proj, sel, null,
                        android.provider.MediaStore.Audio.Media.DATE_ADDED + " DESC")) {
                    if (c != null) {
                        int idCol = c.getColumnIndexOrThrow(android.provider.MediaStore.Audio.Media._ID);
                        int nameCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.DISPLAY_NAME);
                        int dataCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.DATA);
                        int mimeCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.MIME_TYPE);
                        int sizeCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.SIZE);
                        int modCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.DATE_MODIFIED);
                        int durCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.DURATION);
                        int titleCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.TITLE);
                        int artistCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.ARTIST);
                        int albumCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.ALBUM);
                        int albumIdCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.ALBUM_ID);
                        int yearCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.YEAR);
                        while (c.moveToNext()) {
                            long audioId = c.getLong(idCol);
                            String path = dataCol >= 0 ? c.getString(dataCol) : null;
                            if (path == null || path.isEmpty()) continue;
                            File f = new File(path);
                            if (!f.exists() || f.length() <= 0) continue;
                            String parent = f.getParent();
                            if (parent != null && parent.contains("/.")) continue;
                            if (isPathExcluded(parent, excluded)) continue;

                            String dispName = (nameCol >= 0 ? c.getString(nameCol) : null);
                            if (dispName == null || dispName.isEmpty()) dispName = f.getName();
                            String ln = dispName.toLowerCase();
                            if (ln.endsWith(".mp4") || ln.endsWith(".m4v") || ln.endsWith(".webm")
                                    || ln.endsWith(".mkv") || ln.endsWith(".mov") || ln.endsWith(".ogv")
                                    || ln.endsWith(".3gp") || ln.endsWith(".avi")) continue;

                            long durMs = durCol >= 0 ? c.getLong(durCol) : 0L;
                            if (minDurMs > 0 && durMs > 0 && durMs < minDurMs) continue;

                            String mTitle = titleCol >= 0 ? c.getString(titleCol) : "";
                            String mArtist = artistCol >= 0 ? c.getString(artistCol) : "";
                            String mAlbum = albumCol >= 0 ? c.getString(albumCol) : "";
                            int mYear = yearCol >= 0 ? c.getInt(yearCol) : 0;
                            if (mArtist == null || "<unknown>".equalsIgnoreCase(mArtist.trim())) mArtist = "";
                            if (mAlbum == null || "<unknown>".equalsIgnoreCase(mAlbum.trim())) mAlbum = "";

                            seenPaths.add(path.toLowerCase());
                            Uri itemUri = android.content.ContentUris.withAppendedId(audioUri, audioId);
                            String id = String.valueOf(nextId.getAndIncrement());
                            served.put(id, itemUri);
                            servedLocations.put(id, path);
                            long albumId = albumIdCol >= 0 ? c.getLong(albumIdCol) : -1L;
                            if (albumId > 0) servedAlbumIds.put(id, albumId);

                            JSONObject o = new JSONObject();
                            o.put("id", id);
                            o.put("location", path);
                            o.put("uri", itemUri.toString());
                            o.put("url", "https://" + ASSET_HOST + "/f/" + id);
                            o.put("artUrl", "https://" + ASSET_HOST + "/art/" + id);
                            o.put("name", dispName);
                            if (mTitle != null && !mTitle.trim().isEmpty()) o.put("title", mTitle.trim());
                            if (!mArtist.trim().isEmpty()) o.put("artist", mArtist.trim());
                            if (!mAlbum.trim().isEmpty()) o.put("album", mAlbum.trim());
                            if (mYear > 0) o.put("year", String.valueOf(mYear));
                            String mime = mimeCol >= 0 ? c.getString(mimeCol) : "";
                            o.put("type", (mime == null || mime.isEmpty()) ? guessAudioMime(ln) : mime);
                            o.put("size", sizeCol >= 0 ? c.getLong(sizeCol) : f.length());
                            o.put("modified", modCol >= 0 ? c.getLong(modCol) * 1000L : f.lastModified());
                            o.put("fromLibrary", true);

                            int dot = dispName.lastIndexOf('.');
                            String stem = (dot > 0 ? dispName.substring(0, dot) : dispName).toLowerCase();
                            String lrcKey = (parent == null ? "" : parent.toLowerCase()) + "/" + stem;
                            String lrcUriStr = lrcByStem.get(lrcKey);
                            if (lrcUriStr != null) {
                                String lrcId = String.valueOf(nextId.getAndIncrement());
                                served.put(lrcId, Uri.parse(lrcUriStr));
                                o.put("lrcUrl", "https://" + ASSET_HOST + "/f/" + lrcId);
                            }
                            phase1.add(o);
                        }
                    }
                }
            } catch (Throwable ignored) {}

            final boolean clearedInPhase1 = clearExisting;
            if (!phase1.isEmpty()) {
                final List<JSONObject> batch1 = phase1;
                runOnUiThread(() -> {
                    if (clearedInPhase1) {
                        callJs("window.__clearLibraryTracksBeforeScan&&window.__clearLibraryTracksBeforeScan()");
                    }
                    // Chia đợt ~500 bài: những bài đầu hiện sớm, trang không phải xử lý một cục JSON khổng lồ
                    final int CH = 500;
                    for (int from = 0; from < batch1.size(); from += CH) {
                        final List<JSONObject> part = new ArrayList<>(batch1.subList(from, Math.min(batch1.size(), from + CH)));
                        pingHandler.postDelayed(() -> { pending.addAll(part); flushPending(); }, from == 0 ? 0 : (from / CH) * 60L);
                    }
                });
            }

            // PHA 2 (Chạy nền siêu nhanh): Quét bổ sung các file trên bộ nhớ bị MediaStore bỏ sót (không dùng MediaMetadataRetriever chặn luồng)
            List<File> fsAudioFiles = new ArrayList<>();
            // Mở app bình thường: MediaStore đã đủ -> bỏ qua việc duyệt cả bộ nhớ (rất chậm). Chỉ duyệt khi quét lại thủ công hoặc MediaStore trống.
            try {
                File extRoot = android.os.Environment.getExternalStorageDirectory();
                if ((clearExisting || phase1.isEmpty()) && extRoot != null && extRoot.exists() && extRoot.canRead()) {
                    walkStorageForAudio(extRoot, 0, excluded, autoScanLrc, lrcByStem, fsAudioFiles);
                }
            } catch (Throwable ignored) {}

            List<JSONObject> phase2 = new ArrayList<>();
            for (File f : fsAudioFiles) {
                try {
                    String path = f.getAbsolutePath();
                    if (seenPaths.contains(path.toLowerCase())) continue;
                    String dispName = f.getName();
                    String ln = dispName.toLowerCase();
                    String parent = f.getParent();

                    seenPaths.add(path.toLowerCase());
                    Uri itemUri = Uri.fromFile(f);
                    String id = String.valueOf(nextId.getAndIncrement());
                    served.put(id, itemUri);
                    servedLocations.put(id, path);

                    JSONObject o = new JSONObject();
                    o.put("id", id);
                    o.put("location", path);
                    o.put("uri", itemUri.toString());
                    o.put("url", "https://" + ASSET_HOST + "/f/" + id);
                    o.put("artUrl", "https://" + ASSET_HOST + "/art/" + id);
                    o.put("name", dispName);
                    o.put("type", guessAudioMime(ln));
                    o.put("size", f.length());
                    o.put("modified", f.lastModified());
                    o.put("fromLibrary", true);

                    int dot = dispName.lastIndexOf('.');
                    String stem = (dot > 0 ? dispName.substring(0, dot) : dispName).toLowerCase();
                    String lrcKey = (parent == null ? "" : parent.toLowerCase()) + "/" + stem;
                    String lrcUriStr = lrcByStem.get(lrcKey);
                    if (lrcUriStr != null) {
                        String lrcId = String.valueOf(nextId.getAndIncrement());
                        served.put(lrcId, Uri.parse(lrcUriStr));
                        o.put("lrcUrl", "https://" + ASSET_HOST + "/f/" + lrcId);
                    }
                    phase2.add(o);
                } catch (Throwable ignored) {}
            }

            final long doneDelay = phase1.isEmpty() ? 0L : ((phase1.size() - 1) / 500) * 60L + 150L;   // sau đợt bài cuối đã được gửi
            final int totalCount = phase1.size() + phase2.size();
            final boolean needClearHere = clearedInPhase1 && phase1.isEmpty();
            final List<JSONObject> batch2 = phase2;
            runOnUiThread(() -> {
                if (needClearHere) {
                    callJs("window.__clearLibraryTracksBeforeScan&&window.__clearLibraryTracksBeforeScan()");
                }
                if (!batch2.isEmpty()) {
                    pending.addAll(batch2);
                    flushPending();
                }
                pingHandler.postDelayed(() -> callJs("window.__onAndroidLibraryScanDone&&window.__onAndroidLibraryScanDone(" + totalCount + ", false)"), doneDelay);
            });
        }).start();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == 43 || req == 44) {
            if (res != RESULT_OK || data == null) { callJs("window.addBtnCancel&&addBtnCancel()"); }
            else if (req == 44 && data.getData() != null) {
                takePersistableRwPermission(data.getData(), data);
                scanTree(data.getData());
            } else {
                List<Uri> l = new ArrayList<>();
                if (data.getClipData() != null) {
                    for (int k = 0; k < data.getClipData().getItemCount(); k++) {
                        Uri itemUri = data.getClipData().getItemAt(k).getUri();
                        takePersistableRwPermission(itemUri, data);
                        l.add(itemUri);
                    }
                } else if (data.getData() != null) {
                    takePersistableRwPermission(data.getData(), data);
                    l.add(data.getData());
                }
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
        } else if (req == 47) {
            boolean ignored = isIgnoringBatteryOptimizationsInternal();
            callJs("window.__onAndroidBatteryOptResult&&window.__onAndroidBatteryOptResult(" + ignored + ")");
        }
        super.onActivityResult(req, res, data);
    }

    // ===== Predictive Back (Android 13+ opt-in, mặc định bắt buộc từ Android 16) =====
    // Đăng ký OnBackInvokedCallback thay cho onBackPressed. Từ API 34 dùng OnBackAnimationCallback để nhận tiến trình vuốt
    // và chuyển cho trang chạy hiệu ứng xem trước (thu nhỏ + trượt lớp trên cùng) trước khi quyết định quay lại.
    private Object backCallback;

    private void setupPredictiveBack() {
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            final android.window.OnBackInvokedCallback cb;
            if (Build.VERSION.SDK_INT >= 34) {
                cb = new android.window.OnBackAnimationCallback() {
                    @Override public void onBackStarted(android.window.BackEvent e) { callJs("window.__pbStart&&__pbStart(" + e.getSwipeEdge() + ")"); }
                    @Override public void onBackProgressed(android.window.BackEvent e) { callJs("window.__pbProgress&&__pbProgress(" + e.getProgress() + "," + e.getSwipeEdge() + ")"); }
                    @Override public void onBackCancelled() { callJs("window.__pbCancel&&__pbCancel()"); }
                    @Override public void onBackInvoked() { callJs("window.__pbCommit&&__pbCommit()"); handleBack(); }
                };
            } else {
                cb = new android.window.OnBackInvokedCallback() {
                    @Override public void onBackInvoked() { handleBack(); }
                };
            }
            backCallback = cb;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
        } catch (Throwable ignored) { backCallback = null; }
    }

    private void teardownPredictiveBack() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            try { getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback((android.window.OnBackInvokedCallback) backCallback); } catch (Throwable ignored) {}
            backCallback = null;
        }
    }

    @Override
    public void onBackPressed() {   // Android < 13 (hoặc khi hệ thống vẫn gọi kiểu cũ)
        handleBack();
    }

    private void handleBack() {
        if (customView != null) { web.getWebChromeClient().onHideCustomView(); return; }
        if (web != null && pageReady) {
            web.evaluateJavascript(
                    "(function(){try{if(window.__androidHandleBack&&window.__androidHandleBack())return 'handled';}catch(e){}return 'fallback';})()",
                    result -> {
                        String val = result == null ? "" : result.replace("\"", "");
                        if (!"handled".equals(val)) {
                            callJs("if(window.__showExitConfirmDialog){window.__showExitConfirmDialog();}else if(window.AndroidBridge&&window.AndroidBridge.exitBackground){window.AndroidBridge.exitBackground();}");
                        }
                    }
            );
            return;
        }
        callJs("if(window.__showExitConfirmDialog){window.__showExitConfirmDialog();}else if(window.AndroidBridge&&window.AndroidBridge.exitBackground){window.AndroidBridge.exitBackground();}");
    }

    @Override
    protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration c) {
        super.onConfigurationChanged(c);
        callJs("window.__systemAccentChanged&&__systemAccentChanged()");
        callJs("window.__systemThemeChanged&&__systemThemeChanged()");
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
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        // Khi app đang ở nền và hệ thống báo sắp bị kill vì cạn RAM (TRIM_MEMORY_COMPLETE): chủ động kích hoạt combo tự hủy sạch sẽ
        // Đang có phiên nhạc (dịch vụ foreground giữ app): không tự huỷ — giữ nguyên tiến trình/WebView để quay lại app là hiện ngay thay vì khởi động nguội.
        if (appLeftHome && level >= TRIM_MEMORY_COMPLETE && !NativeAudio.active()) {
            triggerBackgroundSelfDestruct(this, "BG_LOW_MEMORY_KILL",
                    "System triggered TRIM_MEMORY_COMPLETE (level=" + level + ") while app was in background");
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        // Đánh thức WebView sớm nhất có thể (trước onResume) để khung hình/JS chạy lại ngay khi quay về app
        try {
            if (web != null) {
                web.onResume(); web.resumeTimers();
                web.setVisibility(View.VISIBLE);
                web.postInvalidateOnAnimation();
            }
        } catch (Throwable ignored) {}
    }

    @Override
    protected void onStop() {
        super.onStop();
        try { NativeAudio.saveBackupSync(this); } catch (Throwable ignored) {}
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
        try { if (pageReady && hasNearbyPermissionInternal()) callJs("window.__onNearbyPermResult&&window.__onNearbyPermResult(true)"); } catch (Throwable ignored) {}
        try { if (pageReady) callJs("window.__onAndroidPermissionsUpdated&&window.__onAndroidPermissionsUpdated(" + getPermissionsStatusJson() + ")"); } catch (Throwable ignored) {}
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
        if (NativeAudio.hasPendingSleepEndedNotice()) {
            NativeAudio.notifyWebSleepEndedIfReady();
        }
        NativeAudio.post(() -> NativeAudio.setVolume(1f));
        try { if (web != null) { web.onResume(); web.resumeTimers(); } } catch (Throwable ignored) {}
        scheduleBlankCheck(5000L);
        if (pageResponded && pageReady && !hangAlertShown) {
            // Trang từng chạy bình thường: kiểm tra lại sau khi quay về từ nền (có thể đã bị đóng băng)
            pageResponded = false;
            autoRecoveries = 0;
            pingHandler.removeCallbacks(loadTimeoutRunnable);
            pingHandler.removeCallbacks(pingTimeoutRunnable);
            pingHandler.postDelayed(pingTimeoutRunnable, PING_TIMEOUT_MS);
            callJs("window.__androidPing&&window.__androidPing()");
        } else if (!pageResponded && !hangAlertShown) {
            pingHandler.removeCallbacks(loadTimeoutRunnable);
            pingHandler.removeCallbacks(pingTimeoutRunnable);
            pingHandler.postDelayed(pageReady ? pingTimeoutRunnable : loadTimeoutRunnable, pageReady ? PING_TIMEOUT_MS : AUTO_RELOAD_TIMEOUT_MS);
            if (pageReady) sendHandshakePing();
        }
        callJs("window.__systemAccentChanged&&__systemAccentChanged()");
        callJs("window.__systemThemeChanged&&__systemThemeChanged()");
        callJs("window.__onAndroidPipModeChanged&&window.__onAndroidPipModeChanged(false)");
        callJs("window.__onAndroidBatteryOptResult&&window.__onAndroidBatteryOptResult(" + isIgnoringBatteryOptimizationsInternal() + ")");
        if (pageReady) {
            callJs("window.__onAndroidAppResume&&window.__onAndroidAppResume()");
            NativeAudio.notifyWebSleepEndedIfReady();
        }
    }

    @Override
    protected void onDestroy() {
        teardownPredictiveBack();
        if (instance == this) instance = null;
        updateInstallPending = false;
        updateDownloadCancelled = true;
        hideMd3LoadingOverlay();
        pingHandler.removeCallbacks(installerTimeoutRunnable);
        pingHandler.removeCallbacks(loadTimeoutRunnable);
        pingHandler.removeCallbacks(pingTimeoutRunnable);
        pingHandler.removeCallbacks(blankCheckRunnable);
        if (!keepPlaybackOnRecreate) {
            try { NativeAudio.saveBackupSync(this); } catch (Exception ignored) {}
            try { NativeAudio.release(); } catch (Exception ignored) {}
            try { stopService(new Intent(this, MediaService.class)); } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    class Bridge {
        private FileOutputStream shareOut; private File shareFile; private String shareId;

        @JavascriptInterface
        public String shareChunk(String id, String b64, boolean last, String name, String mime) {
            try {
                if (shareOut == null || !id.equals(shareId)) {
                    callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('locating')");
                    File dir = new File(getCacheDir(), "share");
                    dir.mkdirs();
                    File[] old = dir.listFiles();
                    if (old != null) for (File f : old) f.delete();
                    shareId = id;
                    shareFile = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", "_"));
                    shareOut = new FileOutputStream(shareFile);
                    callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('preparing')");
                }
                shareOut.write(Base64.decode(b64, Base64.DEFAULT));
                if (last) {
                    shareOut.close(); shareOut = null;
                    callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('sharing')");
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
                            callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('done')");
                            startActivity(ch);
                        } catch (Exception e) {
                            callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('error')");
                            callJs("window.showToast&&showToast(" + JSONObject.quote("Không mở được khung chia sẻ: " + e) + ")");
                        }
                    });
                }
                return "";
            } catch (Throwable e) {
                try { if (shareOut != null) shareOut.close(); } catch (Exception ignored) {}
                shareOut = null;
                callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('error')");
                return String.valueOf(e);
            }
        }

        /** Chia sẻ trực tiếp tệp gốc trên thiết bị (không đi vòng qua WebView fetch/Base64) để tránh lỗi Failed to fetch và nhanh tức thì. */
        @JavascriptInterface
        public String shareNativeFile(final String nativeId, final String nativeLocation, final String name, final String mime) {
            try {
                String resolvedPath = (nativeId != null && !nativeId.isEmpty()) ? servedLocations.get(nativeId) : null;
                if ((resolvedPath == null || resolvedPath.isEmpty()) && nativeLocation != null && !nativeLocation.trim().isEmpty()) {
                    resolvedPath = nativeLocation.trim();
                }
                Uri resolvedUri = (nativeId != null && !nativeId.isEmpty()) ? served.get(nativeId) : null;
                if (resolvedUri == null && resolvedPath != null && (resolvedPath.startsWith("content://") || resolvedPath.startsWith("file://"))) {
                    try { resolvedUri = Uri.parse(resolvedPath); } catch (Throwable ignored) {}
                }
                File directFile = null;
                if (resolvedPath != null && !resolvedPath.isEmpty() && !resolvedPath.startsWith("content://")) {
                    try {
                        File f = resolvedPath.startsWith("file://")
                                ? new File(Uri.parse(resolvedPath).getPath())
                                : new File(resolvedPath);
                        if (f.exists() && f.isFile() && f.canRead() && f.length() > 0) {
                            directFile = f;
                        }
                    } catch (Throwable ignored) {}
                }
                if (directFile == null && resolvedUri == null) {
                    return "NOT_FOUND";
                }

                final File srcFile = directFile;
                final Uri srcUri = resolvedUri;
                final String rawName = (name != null && !name.trim().isEmpty())
                        ? name.trim()
                        : (srcFile != null ? srcFile.getName() : (srcUri != null ? displayName(srcUri) : "media.mp3"));
                final String safeName = rawName.replaceAll("[\\\\/:*?\"<>|]", "_");
                final String finalMime = (mime != null && !mime.trim().isEmpty())
                        ? mime.trim()
                        : guessAudioMime(safeName.toLowerCase());

                callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('locating')");
                new Thread(() -> {
                    try {
                        callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('preparing')");
                        File dir = new File(getCacheDir(), "share");
                        if (!dir.exists()) dir.mkdirs();
                        File[] old = dir.listFiles();
                        if (old != null) {
                            for (File of : old) {
                                try { of.delete(); } catch (Throwable ignored) {}
                            }
                        }
                        File outFile = new File(dir, safeName.isEmpty() ? "media.mp3" : safeName);
                        boolean copied = false;
                        if (srcFile != null) {
                            try (InputStream in = new java.io.FileInputStream(srcFile);
                                 FileOutputStream out = new FileOutputStream(outFile)) {
                                byte[] buf = new byte[65536];
                                int r;
                                while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
                                out.flush();
                                copied = outFile.exists() && outFile.length() > 0;
                            } catch (Throwable ignored) {}
                        }
                        if (!copied && srcUri != null) {
                            try (InputStream in = getContentResolver().openInputStream(srcUri);
                                 FileOutputStream out = new FileOutputStream(outFile)) {
                                if (in != null) {
                                    byte[] buf = new byte[65536];
                                    int r;
                                    while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
                                    out.flush();
                                    copied = outFile.exists() && outFile.length() > 0;
                                }
                            } catch (Throwable ignored) {}
                        }
                        if (!copied) {
                            callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('error')");
                            callJs("window.showToast&&showToast(" + JSONObject.quote(
                                    isEnglishLang() ? "Could not read file to share" : "Không đọc được tệp để chia sẻ") + ")");
                            return;
                        }
                        callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('sharing')");
                        final Uri u = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fp", outFile);
                        final String m = (finalMime == null || finalMime.isEmpty()) ? "audio/*" : finalMime;
                        runOnUiThread(() -> {
                            try {
                                Intent i = new Intent(Intent.ACTION_SEND);
                                i.setType(m);
                                i.putExtra(Intent.EXTRA_STREAM, u);
                                i.setClipData(android.content.ClipData.newRawUri("", u));
                                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                Intent ch = Intent.createChooser(i, null);
                                ch.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('done')");
                                startActivity(ch);
                            } catch (Exception e) {
                                callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('error')");
                                callJs("window.showToast&&showToast(" + JSONObject.quote("Không mở được khung chia sẻ: " + e) + ")");
                            }
                        });
                    } catch (Throwable t) {
                        callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('error')");
                        callJs("window.showToast&&showToast(" + JSONObject.quote("Chia sẻ lỗi: " + t) + ")");
                    }
                }).start();
                return "";
            } catch (Throwable e) {
                callJs("window.__onAndroidShareStatus&&window.__onAndroidShareStatus('error')");
                return String.valueOf(e);
            }
        }

        // ===== Trình phát native (ExoPlayer) =====
        @JavascriptInterface public boolean nativeAudioAvailable() { return true; }
        @JavascriptInterface public String nativeAudioState() { return NativeAudio.stateJson(); }
        @JavascriptInterface public String nativeAudioQueueState() { return NativeAudio.queueStateJson(); }
        @JavascriptInterface public String nativeAudioSavedState() { return NativeAudio.persistedSessionJson(MainActivity.this); }
        @JavascriptInterface public String nativeAudioSavedQueue() { return NativeAudio.persistedQueueJson(MainActivity.this); }

        /** Nạp trực tiếp danh sách đường dẫn tệp (/storage/... hoặc content://...) khi khôi phục phiên để không bỏ sót các bài ngoài MediaStore hoặc thêm thủ công. */
        @JavascriptInterface
        public String importLocationsForRestore(String locationsJson) {
            JSONArray out = new JSONArray();
            try {
                JSONArray arr = new JSONArray(locationsJson == null ? "[]" : locationsJson);
                java.util.Set<String> seen = new java.util.HashSet<>();
                for (int i = 0; i < arr.length(); i++) {
                    String raw = arr.optString(i, "").trim();
                    if (raw.isEmpty()) continue;
                    String low = raw.toLowerCase();
                    if (seen.contains(low)) continue;
                    seen.add(low);

                    String existingId = idForLocation(raw);
                    if (existingId != null && served.containsKey(existingId)) {
                        Uri eu = served.get(existingId);
                        String eloc = servedLocations.get(existingId);
                        String ename = (eloc != null && !eloc.startsWith("content://")) ? new File(eloc).getName() : displayName(eu);
                        JSONObject o = new JSONObject();
                        o.put("id", existingId);
                        o.put("location", eloc != null ? eloc : raw);
                        o.put("uri", eu.toString());
                        o.put("url", "https://" + ASSET_HOST + "/f/" + existingId);
                        o.put("artUrl", "https://" + ASSET_HOST + "/art/" + existingId);
                        o.put("name", ename);
                        o.put("type", guessAudioMime(ename.toLowerCase()));
                        o.put("size", querySize(eu));
                        o.put("modified", queryModified(eu));
                        o.put("fromLibrary", true);
                        out.put(o);
                        continue;
                    }

                    if (raw.startsWith("content://")) {
                        try {
                            Uri u = Uri.parse(raw);
                            try (android.content.res.AssetFileDescriptor afd = getContentResolver().openAssetFileDescriptor(u, "r")) {
                                if (afd == null) continue;
                            }
                            if (isDisallowedVideoUri(u)) continue;
                            String id = String.valueOf(nextId.getAndIncrement());
                            String resolvedLoc = resolveUriLocation(u);
                            String locToStore = (resolvedLoc != null && !resolvedLoc.isEmpty()) ? resolvedLoc : raw;
                            served.put(id, u);
                            servedLocations.put(id, locToStore);
                            String dispName = displayName(u);
                            String mime = getContentResolver().getType(u);
                            JSONObject o = new JSONObject();
                            o.put("id", id);
                            o.put("location", locToStore);
                            o.put("uri", u.toString());
                            o.put("url", "https://" + ASSET_HOST + "/f/" + id);
                            o.put("artUrl", "https://" + ASSET_HOST + "/art/" + id);
                            o.put("name", dispName);
                            o.put("type", (mime == null || mime.isEmpty()) ? guessAudioMime(dispName.toLowerCase()) : mime);
                            o.put("size", querySize(u));
                            o.put("modified", queryModified(u));
                            o.put("fromLibrary", true);
                            out.put(o);
                        } catch (Throwable ignored) {}
                    } else {
                        try {
                            File f = raw.startsWith("file://") ? new File(Uri.parse(raw).getPath()) : new File(raw);
                            if (!f.exists() || !f.isFile() || !f.canRead() || f.length() <= 0) continue;
                            String dispName = f.getName();
                            String ln = dispName.toLowerCase();
                            if (ln.endsWith(".mp4") || ln.endsWith(".m4v") || ln.endsWith(".webm")
                                    || ln.endsWith(".mkv") || ln.endsWith(".mov") || ln.endsWith(".ogv")
                                    || ln.endsWith(".3gp") || ln.endsWith(".avi")) continue;
                            Uri itemUri = Uri.fromFile(f);
                            String absPath = f.getAbsolutePath();
                            String id = String.valueOf(nextId.getAndIncrement());
                            served.put(id, itemUri);
                            servedLocations.put(id, absPath);
                            JSONObject o = new JSONObject();
                            o.put("id", id);
                            o.put("location", absPath);
                            o.put("uri", itemUri.toString());
                            o.put("url", "https://" + ASSET_HOST + "/f/" + id);
                            o.put("artUrl", "https://" + ASSET_HOST + "/art/" + id);
                            o.put("name", dispName);
                            o.put("type", guessAudioMime(ln));
                            o.put("size", f.length());
                            o.put("modified", f.lastModified());
                            o.put("fromLibrary", true);
                            int dot = dispName.lastIndexOf('.');
                            if (dot > 0 && f.getParentFile() != null) {
                                File lrcFile = new File(f.getParentFile(), dispName.substring(0, dot) + ".lrc");
                                if (lrcFile.exists() && lrcFile.isFile() && lrcFile.canRead()) {
                                    String lrcId = String.valueOf(nextId.getAndIncrement());
                                    served.put(lrcId, Uri.fromFile(lrcFile));
                                    o.put("lrcUrl", "https://" + ASSET_HOST + "/f/" + lrcId);
                                }
                            }
                            out.put(o);
                        } catch (Throwable ignored) {}
                    }
                }
            } catch (Throwable ignored) {}
            return out.toString();
        }
        /** Nạp trực tiếp các tệp nhạc từ đường dẫn/URI đã lưu (dùng khi khôi phục bài nằm ngoài thư viện quét hoặc chưa kịp có trong danh sách). */
        @JavascriptInterface
        public String importFilesByPaths(String pathsJson) {
            JSONArray out = new JSONArray();
            try {
                JSONArray arr = new JSONArray(pathsJson == null ? "[]" : pathsJson);
                java.util.Set<String> seen = new java.util.HashSet<>();
                for (int i = 0; i < arr.length(); i++) {
                    String raw = arr.optString(i, "").trim();
                    if (raw.isEmpty()) continue;
                    String low = raw.toLowerCase();
                    if (seen.contains(low)) continue;
                    seen.add(low);

                    Uri itemUri = null;
                    String resolvedLoc = raw;
                    String dispName = "";
                    long size = 0L;
                    long mod = System.currentTimeMillis();
                    File directFile = null;

                    if (raw.startsWith("content://")) {
                        try {
                            Uri u = Uri.parse(raw);
                            try (InputStream testIn = getContentResolver().openInputStream(u)) {
                                if (testIn != null) itemUri = u;
                            }
                            if (itemUri != null) {
                                dispName = displayName(itemUri);
                            }
                        } catch (Throwable ignored) {}
                    } else {
                        try {
                            File f = raw.startsWith("file://") ? new File(Uri.parse(raw).getPath()) : new File(raw);
                            if (f.exists() && f.isFile() && f.canRead() && f.length() > 0) {
                                directFile = f;
                                resolvedLoc = f.getAbsolutePath();
                                itemUri = Uri.fromFile(f);
                                dispName = f.getName();
                                size = f.length();
                                mod = f.lastModified();
                            }
                        } catch (Throwable ignored) {}
                    }

                    if (itemUri == null) continue;
                    if (dispName == null || dispName.isEmpty()) {
                        int sl = resolvedLoc.lastIndexOf('/');
                        dispName = sl >= 0 ? resolvedLoc.substring(sl + 1) : resolvedLoc;
                    }
                    String ln = dispName.toLowerCase();
                    if (ln.endsWith(".mp4") || ln.endsWith(".m4v") || ln.endsWith(".webm")
                            || ln.endsWith(".mkv") || ln.endsWith(".mov") || ln.endsWith(".ogv")
                            || ln.endsWith(".3gp") || ln.endsWith(".avi")) continue;

                    String id = idForLocation(resolvedLoc);
                    if (id == null || id.isEmpty() || served.get(id) == null) {
                        id = String.valueOf(nextId.getAndIncrement());
                        served.put(id, itemUri);
                        servedLocations.put(id, resolvedLoc);
                    }

                    JSONObject o = new JSONObject();
                    o.put("id", id);
                    o.put("location", resolvedLoc);
                    o.put("uri", itemUri.toString());
                    o.put("url", "https://" + ASSET_HOST + "/f/" + id);
                    o.put("artUrl", "https://" + ASSET_HOST + "/art/" + id);
                    o.put("name", dispName);
                    o.put("type", guessAudioMime(ln));
                    o.put("size", size);
                    o.put("modified", mod);
                    o.put("fromLibrary", false);
                    o.put("fromRestore", true);

                    if (directFile != null) {
                        try {
                            File parentDir = directFile.getParentFile();
                            int dot = dispName.lastIndexOf('.');
                            String stem = dot > 0 ? dispName.substring(0, dot) : dispName;
                            if (parentDir != null) {
                                File lrcFile = new File(parentDir, stem + ".lrc");
                                if (lrcFile.exists() && lrcFile.isFile() && lrcFile.canRead()) {
                                    String lrcId = String.valueOf(nextId.getAndIncrement());
                                    served.put(lrcId, Uri.fromFile(lrcFile));
                                    o.put("lrcUrl", "https://" + ASSET_HOST + "/f/" + lrcId);
                                }
                            }
                        } catch (Throwable ignored) {}
                    }
                    out.put(o);
                }
            } catch (Throwable ignored) {}
            return out.toString();
        }
        @JavascriptInterface public void consumeSleepEndedNotice() { NativeAudio.consumeSleepEndedNotice(); }
        @JavascriptInterface public int nativeAudioSessionId() { return NativeAudio.sessionId(); }
        @JavascriptInterface public void nativeAudioLoad(final String id, final String title, final String artist, final long startMs, final boolean play, final float vol, final float rate) {
            NativeAudio.lastAck = android.os.SystemClock.elapsedRealtime();
            NativeAudio.post(() -> NativeAudio.load(MainActivity.this, id, title, artist, startMs, play, vol, rate));
        }
        @JavascriptInterface public void nativeAudioPlay() { NativeAudio.post(NativeAudio::play); }
        @JavascriptInterface public void nativeAudioPause() { NativeAudio.post(NativeAudio::pause); }
        @JavascriptInterface public void nativeAudioSeek(final long ms) { NativeAudio.post(() -> NativeAudio.seek(ms)); }
        @JavascriptInterface public void nativeAudioVolume(final float v) { NativeAudio.post(() -> NativeAudio.setVolume(v)); }
        @JavascriptInterface public void nativeAudioRate(final float r) { NativeAudio.post(() -> NativeAudio.setRate(r)); }
        @JavascriptInterface public void nativeAudioStop() { NativeAudio.post(NativeAudio::stop); }
        @JavascriptInterface public void nativeAudioSetSleep(final long endAtMs, final int tracks) { NativeAudio.post(() -> NativeAudio.setSleep(endAtMs, tracks)); }
        @JavascriptInterface public void nativeAudioMixer(String json) { NativeAudio.setMixer(json); }
        @JavascriptInterface public void nativeAudioViz(boolean on) { NativeAudio.setViz(on); }
        @JavascriptInterface public String nativeAudioFft() { return NativeAudio.fftBase64(); }
        @JavascriptInterface public void nativeAudioSetQueue(String json) { NativeAudio.setQueue(json); }
        @JavascriptInterface public void nativeAudioSetShuffle(final boolean enabled) { NativeAudio.post(() -> NativeAudio.setShuffleEnabled(enabled)); }
        @JavascriptInterface public boolean nativeAudioGetShuffle() { return NativeAudio.isShuffleEnabled(); }

        /** Bản đầy đủ: state = playing | paused | buffering | ended | error | none; bufMs = vị trí đã đệm. Chụp elapsedRealtime ngay khi nhận để vị trí không bị trễ theo IPC. */
        @JavascriptInterface
        public void setMediaState(String state, String title, String artist, long posMs, long durMs, float speed, long bufMs) {
            final long stamp = android.os.SystemClock.elapsedRealtime();
            Intent i = new Intent(MainActivity.this, MediaService.class);
            i.setAction(MediaService.ACTION_UPDATE);
            i.putExtra("state", state == null ? "none" : state);
            i.putExtra("title", title);
            i.putExtra("artist", artist);
            i.putExtra("pos", posMs);
            i.putExtra("dur", durMs);
            i.putExtra("speed", speed);
            i.putExtra("buf", bufMs);
            i.putExtra("stamp", stamp);
            startSvc(i);
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
            autoRecoveries = 0;
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
        public void setWidgetColors(String bgHex, String accentHex) {
            try {
                MediaWidgetProvider.saveWidgetColors(MainActivity.this, Color.parseColor(bgHex), Color.parseColor(accentHex));
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void setThemeColor(String hex) {
            try {
                final int c = Color.parseColor(hex);
                int fullColor = 0xFF000000 | c;
                getSharedPreferences("app", MODE_PRIVATE).edit().putInt("theme", fullColor).apply();
                MediaWidgetProvider.savePlaybackState(
                        MainActivity.this,
                        getSharedPreferences(MediaWidgetProvider.PREFS, MODE_PRIVATE).getBoolean("playing", false),
                        null, null, null, fullColor);
                QueueWidgetProvider.updateTheme(MainActivity.this, fullColor);
                runOnUiThread(() -> applyTheme(c));
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void setWidgetLyric(String lyricLine) {
            // Đã gỡ bỏ hiển thị lời bài hát khỏi Widget
        }

        @JavascriptInterface
        public void setWidgetDetails(boolean shuffle, int repeatMode, long posMs, long durMs) {
            MediaWidgetProvider.saveModesAndProgress(MainActivity.this, shuffle, repeatMode, posMs, durMs);
        }

        @JavascriptInterface
        public void setWidgetQueue(String queueJson) {
            QueueWidgetProvider.saveQueue(MainActivity.this, queueJson == null ? "" : queueJson);
        }

        @JavascriptInterface
        public void setWidgetLyricsData(String syncedLine, String staticBlock, String trackTitle, boolean hasLyrics) {
            // Đã gỡ bỏ Lyrics Widget
        }

        @JavascriptInterface
        public void setArtwork(String b64) {
            // Album art cho MediaSession/Notification do native tự trích xuất trực tiếp từ tệp nhạc
        }

        @JavascriptInterface
        public void pickFiles() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("audio/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"audio/*", "text/*", "application/x-subrip"});
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try { startActivityForResult(i, 43); } catch (Exception e) { callJs("window.addBtnCancel&&addBtnCancel()"); }
            });
        }

        @JavascriptInterface
        public void pickFolder() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                    startActivityForResult(i, 44);
                }
                catch (Exception e) { callJs("window.addBtnCancel&&addBtnCancel()"); }
            });
        }

        private FileOutputStream overwriteOut;
        private File overwriteTmpFile;
        private String overwriteTxId;

        private boolean writeTempToUri(File srcFile, Uri destUri) {
            if (srcFile == null || !srcFile.exists() || destUri == null) return false;
            java.io.OutputStream dest = null;
            for (String mode : new String[]{"wt", "w", "rwt"}) {
                try {
                    dest = getContentResolver().openOutputStream(destUri, mode);
                    if (dest != null) break;
                } catch (Throwable ignored) {}
            }
            if (dest == null) return false;
            try (java.io.InputStream in = new java.io.FileInputStream(srcFile);
                 java.io.OutputStream out = dest) {
                byte[] buf = new byte[65536];
                int r;
                while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
                out.flush();
                return true;
            } catch (Throwable ignored) {
                return false;
            }
        }

        private boolean writeTempToFilePath(File srcFile, String filePath) {
            if (srcFile == null || !srcFile.exists() || filePath == null || filePath.isEmpty()) return false;
            try {
                File targetFile = filePath.startsWith("file://")
                        ? new File(Uri.parse(filePath).getPath())
                        : new File(filePath);
                if (!targetFile.exists() || !targetFile.canWrite()) return false;
                try (java.io.InputStream in = new java.io.FileInputStream(srcFile);
                     java.io.OutputStream out = new FileOutputStream(targetFile, false)) {
                    byte[] buf = new byte[65536];
                    int r;
                    while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
                    out.flush();
                    return true;
                }
            } catch (Throwable ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public String overwriteFileChunk(String nativeId, String nativeLocation, String txId, String b64, boolean last, String fallbackName) {
            try {
                if (overwriteOut == null || txId == null || !txId.equals(overwriteTxId)) {
                    try { if (overwriteOut != null) overwriteOut.close(); } catch (Exception ignored) {}
                    try { if (overwriteTmpFile != null && overwriteTmpFile.exists()) overwriteTmpFile.delete(); } catch (Exception ignored) {}
                    File dir = new File(getCacheDir(), "overwrite");
                    if (!dir.exists()) dir.mkdirs();
                    overwriteTxId = (txId == null || txId.isEmpty()) ? String.valueOf(System.currentTimeMillis()) : txId;
                    overwriteTmpFile = new File(dir, overwriteTxId.replaceAll("[^a-zA-Z0-9._-]", "_") + ".tmp");
                    overwriteOut = new FileOutputStream(overwriteTmpFile);
                }
                if (b64 != null && !b64.isEmpty()) {
                    overwriteOut.write(Base64.decode(b64, Base64.DEFAULT));
                }
                if (!last) return "";

                overwriteOut.flush();
                overwriteOut.close();
                overwriteOut = null;

                Uri targetUri = (nativeId != null && !nativeId.isEmpty()) ? served.get(nativeId) : null;
                String targetLoc = (nativeLocation != null && !nativeLocation.isEmpty())
                        ? nativeLocation
                        : ((nativeId != null && !nativeId.isEmpty()) ? servedLocations.get(nativeId) : null);

                if (targetUri == null && targetLoc != null && (targetLoc.startsWith("content://") || targetLoc.startsWith("file://"))) {
                    try { targetUri = Uri.parse(targetLoc); } catch (Throwable ignored) {}
                }
                if (targetUri == null && fallbackName != null && !fallbackName.isEmpty()) {
                    for (Map.Entry<String, Uri> entry : served.entrySet()) {
                        try {
                            if (fallbackName.equalsIgnoreCase(displayName(entry.getValue()))) {
                                targetUri = entry.getValue();
                                if (targetLoc == null || targetLoc.isEmpty()) targetLoc = servedLocations.get(entry.getKey());
                                break;
                            }
                        } catch (Exception ignored) {}
                    }
                }

                boolean wrote = false;
                if (targetUri != null) {
                    wrote = writeTempToUri(overwriteTmpFile, targetUri);
                }
                if (!wrote && targetLoc != null && !targetLoc.isEmpty() && !targetLoc.startsWith("content://")) {
                    wrote = writeTempToFilePath(overwriteTmpFile, targetLoc);
                }

                try { if (overwriteTmpFile != null) overwriteTmpFile.delete(); } catch (Exception ignored) {}
                overwriteTmpFile = null;

                if (!wrote) {
                    if (Build.VERSION.SDK_INT >= 30 && !android.os.Environment.isExternalStorageManager()) {
                        runOnUiThread(() -> {
                            try {
                                Intent permIntent = new Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                                permIntent.setData(Uri.parse("package:" + getPackageName()));
                                permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(permIntent);
                            } catch (Throwable ex) {
                                try {
                                    Intent fallbackPerm = new Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                                    fallbackPerm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                    startActivity(fallbackPerm);
                                } catch (Throwable ignored) {}
                            }
                        });
                        return "NEED_FILE_PERMISSION";
                    }
                    return "Cannot open target file for writing";
                }

                if (targetUri != null) {
                    synchronized (cachedMediaFiles) {
                        File cached = cachedMediaFiles.remove(targetUri.toString());
                        if (cached != null && cached.exists()) {
                            try { cached.delete(); } catch (Exception ignored) {}
                        }
                    }
                }
                return "";
            } catch (Throwable e) {
                try { if (overwriteOut != null) overwriteOut.close(); } catch (Exception ignored) {}
                overwriteOut = null;
                try { if (overwriteTmpFile != null && overwriteTmpFile.exists()) overwriteTmpFile.delete(); } catch (Exception ignored) {}
                overwriteTmpFile = null;
                return String.valueOf(e);
            }
        }

        @JavascriptInterface
        public boolean hasPendingExternalOpen() {
            return pendingExternalOpen;
        }

        @JavascriptInterface
        public void __nativeBackFallback() {
            runOnUiThread(() -> callJs("if(window.__showExitConfirmDialog){window.__showExitConfirmDialog();}else if(window.AndroidBridge&&window.AndroidBridge.exitBackground){window.AndroidBridge.exitBackground();}"));
        }

        @JavascriptInterface
        public void exitBackground() {
            runOnUiThread(() -> moveTaskToBack(true));
        }

        @JavascriptInterface
        public void exitAppCompletely() {
            runOnUiThread(() -> {
                try { NativeAudio.saveBackupSync(MainActivity.this); } catch (Throwable ignored) {}
                try {
                    getSharedPreferences(CRASH_PREFS, MODE_PRIVATE).edit()
                            .putBoolean("clean_exit", true)
                            .remove("code").remove("reason").remove("ts")
                            .commit();
                } catch (Throwable ignored) {}
                try { MediaWidgetProvider.resetToIdle(MainActivity.this); } catch (Throwable ignored) {}
                try { MediaWidgetProvider.resetWidgetColors(MainActivity.this); } catch (Throwable ignored) {}
                try { stopService(new Intent(MainActivity.this, MediaService.class)); } catch (Exception ignored) {}
                finishAffinity();
                android.os.Process.killProcess(android.os.Process.myPid());
            });
        }

        @JavascriptInterface
        public String consumeLastCrashInfo() {
            try {
                android.content.SharedPreferences sp = getSharedPreferences(CRASH_PREFS, MODE_PRIVATE);
                String code = sp.getString("code", "");
                if (code == null || code.isEmpty()) return "";
                String reason = sp.getString("reason", "");
                long ts = sp.getLong("ts", 0L);
                sp.edit().remove("code").remove("reason").remove("ts").apply();
                JSONObject o = new JSONObject();
                o.put("code", code);
                o.put("reason", reason == null ? "" : reason);
                o.put("ts", ts);
                return o.toString();
            } catch (Throwable ignored) {
                return "";
            }
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
        public boolean isIgnoringBatteryOptimizations() {
            return isIgnoringBatteryOptimizationsInternal();
        }

        @JavascriptInterface
        public void requestIgnoreBatteryOptimizations() {
            runOnUiThread(() -> {
                if (isIgnoringBatteryOptimizationsInternal()) {
                    callJs("window.__onAndroidBatteryOptResult&&window.__onAndroidBatteryOptResult(true)");
                    return;
                }
                if (Build.VERSION.SDK_INT >= 23) {
                    try {
                        Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivityForResult(intent, 47);
                        return;
                    } catch (Throwable ignored) {}
                    try {
                        Intent fallback = new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                        startActivityForResult(fallback, 47);
                        return;
                    } catch (Throwable ignored) {}
                }
                callJs("window.__onAndroidBatteryOptResult&&window.__onAndroidBatteryOptResult(" + isIgnoringBatteryOptimizationsInternal() + ")");
            });
        }

        @JavascriptInterface
        public void startUpdateDownload(String url) {
            if (url == null || url.trim().isEmpty()) return;
            startUpdateDownloadInternal(url.trim());
        }

        @JavascriptInterface
        public String getPermissionsStatus() {
            return getPermissionsStatusJson();
        }

        @JavascriptInterface
        public void requestMediaPermission() {
            runOnUiThread(() -> {
                if (hasFullMediaAccessInternal()) {
                    callJs("window.__onAndroidPermissionsUpdated&&window.__onAndroidPermissionsUpdated(" + getPermissionsStatusJson() + ")");
                    return;
                }
                if (!hasMediaPermissionInternal() || !hasImagesPermissionInternal()) {
                    if (Build.VERSION.SDK_INT >= 33) {
                        List<String> req = new ArrayList<>();
                        if (!hasMediaPermissionInternal()) req.add(Manifest.permission.READ_MEDIA_AUDIO);
                        if (!hasImagesPermissionInternal()) req.add(Manifest.permission.READ_MEDIA_IMAGES);
                        requestPermissions(req.toArray(new String[0]), 101);
                    } else if (Build.VERSION.SDK_INT >= 23) {
                        requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, 101);
                    }
                } else {
                    openAllFilesAccessSettings();
                }
            });
        }

        @JavascriptInterface
        public void requestAudioPermission() {
            runOnUiThread(() -> {
                if (hasMediaPermissionInternal()) {
                    callJs("window.__onAndroidPermissionsUpdated&&window.__onAndroidPermissionsUpdated(" + getPermissionsStatusJson() + ")");
                    return;
                }
                if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.READ_MEDIA_AUDIO}, 105);
                else if (Build.VERSION.SDK_INT >= 23) requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, 105);
            });
        }

        @JavascriptInterface
        public void requestImagesPermission() {
            runOnUiThread(() -> {
                if (hasImagesPermissionInternal()) {
                    callJs("window.__onAndroidPermissionsUpdated&&window.__onAndroidPermissionsUpdated(" + getPermissionsStatusJson() + ")");
                    return;
                }
                if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.READ_MEDIA_IMAGES}, 105);
                else if (Build.VERSION.SDK_INT >= 23) requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, 105);
            });
        }

        @JavascriptInterface
        public void requestAllFilesPermission() {
            runOnUiThread(() -> {
                if (hasAllFilesAccessInternal()) {
                    callJs("window.__onAndroidPermissionsUpdated&&window.__onAndroidPermissionsUpdated(" + getPermissionsStatusJson() + ")");
                    return;
                }
                openAllFilesAccessSettings();
            });
        }

        @JavascriptInterface
        public boolean hasNearbyPermission() { return hasNearbyPermissionInternal(); }

        @JavascriptInterface
        public void requestNearbyPermission() {
            runOnUiThread(() -> {
                if (hasNearbyPermissionInternal()) {
                    callJs("window.__onNearbyPermResult&&window.__onNearbyPermResult(true)");
                    return;
                }
                if (Build.VERSION.SDK_INT >= 31) requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, 104);
            });
        }

        @JavascriptInterface
        public String getOutputDevicesJson() { return getOutputDevicesJsonInternal(); }

        @JavascriptInterface
        public void openAppPermissionSettings() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    i.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                } catch (Throwable ignored) {}
            });
        }

        /** Mở bảng chuyển đầu ra phương tiện của hệ thống (WebView không tự ép định tuyến sang thiết bị cụ thể được). */
        @JavascriptInterface
        public void openSystemOutputSwitcher() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent("com.android.settings.panel.action.MEDIA_OUTPUT");
                    i.putExtra("com.android.settings.panel.extra.PACKAGE_NAME", getPackageName());
                    startActivity(i);
                } catch (Throwable ex) {
                    try { startActivity(new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)); } catch (Throwable ignored) {}
                }
            });
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                if (hasNotificationPermissionInternal()) {
                    callJs("window.__onAndroidPermissionsUpdated&&window.__onAndroidPermissionsUpdated(" + getPermissionsStatusJson() + ")");
                    return;
                }
                if (Build.VERSION.SDK_INT >= 33) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 102);
                }
            });
        }

        @JavascriptInterface
        public void setSetupDoneNative(boolean done) {
            getSharedPreferences("app", MODE_PRIVATE).edit().putBoolean("gs_done", done).apply();
        }

        @JavascriptInterface
        public void scanAllDeviceAudio(boolean clearExisting) {
            scanAllDeviceAudioInternal(clearExisting);
        }

        /** Đọc đầy đủ metadata (title, artist, album, year, genre, composer, cover) trực tiếp qua MediaMetadataRetriever của Android — hỗ trợ cả FLAC/M4A/OGG/OPUS/ID3v2.4 mà jsmediatags dễ bỏ sót hoặc đọc thiếu khi cắt 2MB đầu. */
        @JavascriptInterface
        public String readTrackMetadataJson(String nativeId) {
            return extractMetadataJsonInternal(nativeId, true);
        }

        /** Hiện / cập nhật thông báo tiến trình quét metadata ở nền; tự động xóa khi done >= total hoặc total <= 0. */
        @JavascriptInterface
        public void updateScanNotification(int done, int total, String currentTitle) {
            updateScanNotificationInternal(done, total, currentTitle);
        }

        @JavascriptInterface
        public boolean openFileInSystemFiles(String filePath, String nativeId) {
            try {
                String resolved = (filePath != null && !filePath.trim().isEmpty()) ? filePath.trim() : "";
                if (resolved.isEmpty() && nativeId != null && !nativeId.isEmpty()) {
                    String loc = servedLocations.get(nativeId);
                    if (loc != null && !loc.isEmpty()) resolved = loc;
                }
                if (resolved.isEmpty()) return false;

                File target = resolved.startsWith("file://") ? new File(Uri.parse(resolved).getPath()) : new File(resolved);
                if (target.exists()) {
                    File parent = target.getParentFile();
                    Intent dirIntent = new Intent(Intent.ACTION_VIEW);
                    Uri contentDir = Uri.parse("content://com.android.externalstorage.documents/root/primary");
                    if (parent != null && parent.getAbsolutePath().startsWith("/storage/emulated/0/")) {
                        String rel = parent.getAbsolutePath().substring("/storage/emulated/0/".length());
                        String encodedDocId = Uri.encode("primary:" + rel);
                        contentDir = Uri.parse("content://com.android.externalstorage.documents/document/" + encodedDocId);
                    }
                    dirIntent.setDataAndType(contentDir, DocumentsContract.Document.MIME_TYPE_DIR);
                    dirIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    if (dirIntent.resolveActivity(getPackageManager()) != null) {
                        runOnUiThread(() -> {
                            try { startActivity(dirIntent); } catch (Throwable ignored) {}
                        });
                        return true;
                    }

                    try {
                        Uri fileUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fp", target);
                        Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                        viewIntent.setDataAndType(fileUri, "*/*");
                        viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        if (viewIntent.resolveActivity(getPackageManager()) != null) {
                            runOnUiThread(() -> {
                                try { startActivity(viewIntent); } catch (Throwable ignored) {}
                            });
                            return true;
                        }
                    } catch (Throwable ignored) {}
                }

                if (resolved.startsWith("content://")) {
                    Uri u = Uri.parse(resolved);
                    Intent vi = new Intent(Intent.ACTION_VIEW, u);
                    vi.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    if (vi.resolveActivity(getPackageManager()) != null) {
                        runOnUiThread(() -> {
                            try { startActivity(vi); } catch (Throwable ignored) {}
                        });
                        return true;
                    }
                }
                return false;
            } catch (Throwable ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public String listAudioDirectoriesJson() {
            JSONArray arr = new JSONArray();
            java.util.Set<String> excluded = getExcludedDirsSet();
            java.util.Map<String, Integer> countMap = new java.util.TreeMap<>(String.CASE_INSENSITIVE_ORDER);
            try {
                android.net.Uri audioUri = android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                String[] proj = new String[]{
                        android.provider.MediaStore.Audio.Media.DATA,
                        android.provider.MediaStore.Audio.Media.DURATION,
                        android.provider.MediaStore.Audio.Media.MIME_TYPE
                };
                String sel = "(" + android.provider.MediaStore.Audio.Media.DURATION + " >= 3000 OR LOWER(COALESCE(" + android.provider.MediaStore.Audio.Media.MIME_TYPE + ", '')) LIKE 'audio/%')"
                        + " AND " + android.provider.MediaStore.Audio.Media.DATA + " IS NOT NULL";
                try (Cursor c = getContentResolver().query(audioUri, proj, sel, null, null)) {
                    if (c != null) {
                        int dataCol = c.getColumnIndex(android.provider.MediaStore.Audio.Media.DATA);
                        while (c.moveToNext()) {
                            String path = dataCol >= 0 ? c.getString(dataCol) : null;
                            if (path == null || path.isEmpty()) continue;
                            File f = new File(path);
                            String parent = f.getParent();
                            if (parent == null || parent.isEmpty() || parent.contains("/.")) continue;
                            countMap.put(parent, (countMap.get(parent) == null ? 0 : countMap.get(parent)) + 1);
                        }
                    }
                }
            } catch (Throwable ignored) {}
            for (java.util.Map.Entry<String, Integer> entry : countMap.entrySet()) {
                try {
                    String dirPath = entry.getKey();
                    File dirFile = new File(dirPath);
                    JSONObject o = new JSONObject();
                    o.put("path", dirPath);
                    o.put("name", dirFile.getName().isEmpty() ? dirPath : dirFile.getName());
                    o.put("count", entry.getValue());
                    o.put("excluded", isPathExcluded(dirPath, excluded));
                    arr.put(o);
                } catch (Throwable ignored) {}
            }
            return arr.toString();
        }

        @JavascriptInterface
        public String getExcludedDirectoriesJson() {
            JSONArray arr = new JSONArray();
            for (String p : getExcludedDirsSet()) arr.put(p);
            return arr.toString();
        }

        @JavascriptInterface
        public boolean isSystemDarkMode() {
            try {
                android.app.UiModeManager umm = (android.app.UiModeManager) getSystemService(UI_MODE_SERVICE);
                if (umm != null) {
                    int nm = umm.getNightMode();
                    if (nm == android.app.UiModeManager.MODE_NIGHT_YES) return true;
                    if (nm == android.app.UiModeManager.MODE_NIGHT_NO) return false;
                }
            } catch (Throwable ignored) {}
            try {
                int sysMode = android.content.res.Resources.getSystem().getConfiguration().uiMode
                        & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
                if (sysMode == android.content.res.Configuration.UI_MODE_NIGHT_YES) return true;
                if (sysMode == android.content.res.Configuration.UI_MODE_NIGHT_NO) return false;
            } catch (Throwable ignored) {}
            int mode = getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
            return mode == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        }

        @JavascriptInterface
        public void setLibraryScanPrefs(int minDurationSec, boolean autoScanLrc) {
            getSharedPreferences("app", MODE_PRIVATE).edit()
                    .putInt("min_duration_sec", Math.max(0, minDurationSec))
                    .putBoolean("auto_scan_lrc", autoScanLrc)
                    .apply();
        }

        @JavascriptInterface
        public void setExcludedDirectoriesJson(String jsonArr) {
            try {
                JSONArray arr = new JSONArray(jsonArr == null ? "[]" : jsonArr);
                java.util.Set<String> set = new java.util.HashSet<>();
                for (int i = 0; i < arr.length(); i++) {
                    String p = arr.optString(i, "").trim();
                    if (!p.isEmpty()) set.add(p);
                }
                getSharedPreferences("app", MODE_PRIVATE).edit().putStringSet("excluded_dirs", set).apply();
            } catch (Throwable ignored) {}
        }
    }

    private static final String SCAN_NOTIF_CHANNEL = "mp_scan_progress";
    private static final int SCAN_NOTIF_ID = 2026;

    private void cancelScanNotificationInternal() {
        try {
            android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(SCAN_NOTIF_ID);
        } catch (Throwable ignored) {}
    }

    private void updateScanNotificationInternal(int done, int total, String currentTitle) {
        try {
            android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (total <= 0 || done >= total) {
                nm.cancel(SCAN_NOTIF_ID);
                return;
            }
            if (Build.VERSION.SDK_INT >= 33 && !hasNotificationPermissionInternal()) return;
            if (Build.VERSION.SDK_INT >= 26) {
                android.app.NotificationChannel ch = new android.app.NotificationChannel(
                        SCAN_NOTIF_CHANNEL,
                        isEnglishLang() ? "Library scanning" : "Quét thư viện nhạc",
                        android.app.NotificationManager.IMPORTANCE_LOW
                );
                ch.setShowBadge(false);
                ch.enableVibration(false);
                ch.setSound(null, null);
                nm.createNotificationChannel(ch);
            }
            int safeDone = Math.max(0, Math.min(done, total));
            String title = isEnglishLang() ? "Scanning track metadata..." : "Đang quét thông tin bài hát...";
            String sub = safeDone + "/" + total;
            if (currentTitle != null && !currentTitle.trim().isEmpty()) {
                sub = sub + " • " + currentTitle.trim();
            }
            android.app.PendingIntent open = android.app.PendingIntent.getActivity(
                    this,
                    SCAN_NOTIF_ID,
                    new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                    android.app.PendingIntent.FLAG_IMMUTABLE | android.app.PendingIntent.FLAG_UPDATE_CURRENT
            );
            android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new android.app.Notification.Builder(this, SCAN_NOTIF_CHANNEL)
                    : new android.app.Notification.Builder(this);
            b.setSmallIcon(android.R.drawable.ic_popup_sync)
                    .setContentTitle(title)
                    .setContentText(sub)
                    .setContentIntent(open)
                    .setProgress(total, safeDone, false)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.notify(SCAN_NOTIF_ID, b.build());
        } catch (Throwable ignored) {}
    }

    private boolean isIgnoringBatteryOptimizationsInternal() {
        if (Build.VERSION.SDK_INT < 23) return true;
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
        } catch (Throwable ignored) {
            return false;
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
