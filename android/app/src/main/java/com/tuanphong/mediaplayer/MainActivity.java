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
                            InputStream in = getContentResolver().openInputStream(src);
                            String mime = getContentResolver().getType(src);
                            Map<String, String> h = new HashMap<>();
                            h.put("Access-Control-Allow-Origin", "*");
                            return new WebResourceResponse(mime == null ? "application/octet-stream" : mime, null, 200, "OK", h, in);
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
            public void onPageFinished(WebView v, String url) {
                if (url.startsWith("https://tuanphong3108.github.io/")) {
                    pageReady = true;
                    flushPending();
                } else pageReady = false;
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
        handleIntent(getIntent());
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
        moveTaskToBack(true); // giữ nhạc phát nền
    }

    @Override
    protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration c) {
        super.onConfigurationChanged(c);
        callJs("window.__systemAccentChanged&&__systemAccentChanged()");
    }

    @Override
    protected void onResume() {
        super.onResume();
        callJs("window.__systemAccentChanged&&__systemAccentChanged()");
    }

    @Override
    protected void onDestroy() {
        if (instance == this) instance = null;
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
        public void pickFolder() {
            runOnUiThread(() -> {
                try { startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), 44); }
                catch (Exception e) { callJs("window.addBtnCancel&&addBtnCancel()"); }
            });
        }
    }
}
