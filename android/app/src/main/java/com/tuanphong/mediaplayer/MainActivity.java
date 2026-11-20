package com.tuanphong.mediaplayer;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends Activity {
    static final String APP_URL = "https://tuanphong3108.github.io/music-player/index.html";
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
        getWindow().setStatusBarColor(0xFF1C1B1F);
        getWindow().setNavigationBarColor(0xFF1C1B1F);
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF1C1B1F);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

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
        web.setBackgroundColor(0xFF1C1B1F);
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

    private void hideBars(boolean hide) {
        getWindow().getDecorView().setSystemUiVisibility(hide
                ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                : View.SYSTEM_UI_FLAG_VISIBLE);
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

    void sendCmd(final String cmd) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.__nativeCmd&&window.__nativeCmd('" + cmd + "')", null); });
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == 42 && filePathCb != null) {
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
    protected void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    class Bridge {
        @JavascriptInterface
        public void setPlaying(boolean playing, String title) {
            Intent i = new Intent(MainActivity.this, MediaService.class);
            i.setAction(MediaService.ACTION_UPDATE);
            i.putExtra("playing", playing);
            i.putExtra("title", title);
            try {
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
            } catch (Exception ignored) {}
        }
    }
}
