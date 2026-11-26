package com.tuanphong.mediaplayer;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Bảng điều khiển Developer Console thuần Android (nằm ngoài DOM WebView để trang web không thể làm vỡ giao diện).
 * Hiển thị dạng cửa sổ vuông ở nửa dưới màn hình và đẩy WebView lên phía trên (layout_weight = 1), hỗ trợ kéo cạnh trên để đổi chiều cao.
 */
final class NativeDevConsole {
    interface Host {
        WebView getWebView();
        boolean isEnglish();
    }

    private static final int MAX_LOGS = 400;

    private static final class Entry {
        final String level; // LOG, INFO, WARN, ERROR, CMD, RES
        final String time;
        final String text;
        Entry(String lv, String tm, String tx) { this.level = lv; this.time = tm; this.text = tx; }
    }

    private final Activity act;
    private final Host host;
    private final LinearLayout panel;
    private final LinearLayout logList;
    private final ScrollView scroll;
    private final EditText input;
    private final TextView btnFilter;
    private final List<Entry> entries = new ArrayList<>();
    private final SimpleDateFormat timeFmt = new SimpleDateFormat("HH:mm:ss.SSS", Locale.US);

    private String filter = "ALL"; // ALL, WARN, ERROR
    private int panelHeightPx;

    NativeDevConsole(Activity activity, Host host) {
        this.act = activity;
        this.host = host;

        int screenH = activity.getResources().getDisplayMetrics().heightPixels;
        this.panelHeightPx = Math.max(dp(220), Math.min(dp(340), (int) (screenH * 0.38f)));

        panel = new LinearLayout(activity);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackgroundColor(0xFF121216);
        panel.setVisibility(View.GONE);
        panel.setClickable(true);
        panel.setFocusable(true);

        // Thanh viền trên kiêm tay nắm kéo đổi chiều cao cửa sổ vuông
        View resizeBar = new View(activity);
        resizeBar.setBackgroundColor(0xFF3A3A46);
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4));
        panel.addView(resizeBar, rlp);

        // Thanh tiêu đề
        LinearLayout header = new LinearLayout(activity);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(0xFF1C1C22);
        header.setPadding(dp(10), dp(4), dp(6), dp(4));
        panel.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(40)));

        TextView title = new TextView(activity);
        title.setText("</> Console");
        title.setTextColor(0xFFD0BCFF);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        title.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        header.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        // Kéo trên thanh tiêu đề hoặc viền trên để thay đổi chiều cao cửa sổ Console
        View.OnTouchListener resizeTouch = new View.OnTouchListener() {
            float startY = 0f;
            int startH = 0;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        startY = e.getRawY();
                        startH = panel.getHeight() > 0 ? panel.getHeight() : panelHeightPx;
                        return true;
                    case MotionEvent.ACTION_MOVE: {
                        int sh = act.getResources().getDisplayMetrics().heightPixels;
                        int minH = dp(140);
                        int maxH = Math.max(minH + dp(60), (int) (sh * 0.78f));
                        int dy = Math.round(startY - e.getRawY());
                        panelHeightPx = Math.max(minH, Math.min(maxH, startH + dy));
                        ViewGroup.LayoutParams lp = panel.getLayoutParams();
                        if (lp != null) {
                            lp.height = panelHeightPx;
                            panel.setLayoutParams(lp);
                        }
                        return true;
                    }
                }
                return false;
            }
        };
        resizeBar.setOnTouchListener(resizeTouch);
        title.setOnTouchListener(resizeTouch);

        btnFilter = makeActionBtn("ALL", 0xFF2B2B36, 0xFFE6E1E5);
        btnFilter.setOnClickListener(v -> cycleFilter());
        header.addView(btnFilter, actionLp());

        TextView btnInspect = makeActionBtn("Soi", 0xFF2B2B36, 0xFF80CBC4);
        btnInspect.setOnClickListener(v -> triggerTapInspect());
        header.addView(btnInspect, actionLp());

        TextView btnCopy = makeActionBtn("Copy", 0xFF2B2B36, 0xFFE6E1E5);
        btnCopy.setOnClickListener(v -> copyLogs());
        header.addView(btnCopy, actionLp());

        TextView btnClear = makeActionBtn("Clear", 0xFF2B2B36, 0xFFFFB74D);
        btnClear.setOnClickListener(v -> clearLogs());
        header.addView(btnClear, actionLp());

        TextView btnClose = makeActionBtn("✕", 0xFF3A2327, 0xFFFF8A80);
        btnClose.setOnClickListener(v -> hide());
        header.addView(btnClose, actionLp());

        // Đường kẻ phân cách header
        View div1 = new View(activity);
        div1.setBackgroundColor(0xFF2B2B35);
        panel.addView(div1, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));

        // Khu vực hiển thị log
        scroll = new ScrollView(activity);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(0xFF121216);
        logList = new LinearLayout(activity);
        logList.setOrientation(LinearLayout.VERTICAL);
        logList.setPadding(dp(8), dp(6), dp(8), dp(6));
        scroll.addView(logList, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        panel.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // Đường kẻ phân cách ô nhập lệnh
        View div2 = new View(activity);
        div2.setBackgroundColor(0xFF2B2B35);
        panel.addView(div2, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));

        // Thanh nhập lệnh JS ở đáy
        LinearLayout inputRow = new LinearLayout(activity);
        inputRow.setOrientation(LinearLayout.HORIZONTAL);
        inputRow.setGravity(Gravity.CENTER_VERTICAL);
        inputRow.setBackgroundColor(0xFF1A1A20);
        inputRow.setPadding(dp(8), dp(4), dp(6), dp(4));
        panel.addView(inputRow, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44)));

        TextView prompt = new TextView(activity);
        prompt.setText(">");
        prompt.setTextColor(0xFFD0BCFF);
        prompt.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        prompt.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f);
        prompt.setPadding(dp(2), 0, dp(6), 0);
        inputRow.addView(prompt);

        input = new EditText(activity);
        input.setHint("JavaScript...");
        input.setHintTextColor(0xFF777788);
        input.setTextColor(0xFFF2F2F7);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        input.setTypeface(Typeface.MONOSPACE);
        input.setBackgroundColor(Color.TRANSPARENT);
        input.setSingleLine(true);
        input.setImeOptions(EditorInfo.IME_ACTION_SEND | EditorInfo.IME_FLAG_NO_EXTRACT_UI);
        input.setPadding(dp(2), dp(4), dp(6), dp(4));
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND
                    || actionId == EditorInfo.IME_ACTION_DONE
                    || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN)) {
                submitCommand();
                return true;
            }
            return false;
        });
        inputRow.addView(input, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));

        TextView runBtn = makeActionBtn("▶", 0xFF4F378B, 0xFFEADDFF);
        runBtn.setOnClickListener(v -> submitCommand());
        inputRow.addView(runBtn, actionLp());
    }

    View getView() {
        return panel;
    }

    LinearLayout.LayoutParams createLayoutParams() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, panelHeightPx);
    }

    boolean isVisible() {
        return panel.getVisibility() == View.VISIBLE;
    }

    void show() {
        act.runOnUiThread(() -> {
            ViewGroup.LayoutParams lp = panel.getLayoutParams();
            if (lp != null) {
                lp.height = panelHeightPx;
                panel.setLayoutParams(lp);
            }
            panel.setVisibility(View.VISIBLE);
            rebuildList();
        });
    }

    void hide() {
        act.runOnUiThread(() -> {
            hideKeyboard();
            panel.setVisibility(View.GONE);
        });
    }

    void toggle() {
        if (isVisible()) hide();
        else show();
    }

    void onWebConsoleMessage(ConsoleMessage cm) {
        if (cm == null) return;
        String lv = "LOG";
        ConsoleMessage.MessageLevel ml = cm.messageLevel();
        if (ml == ConsoleMessage.MessageLevel.ERROR) lv = "ERROR";
        else if (ml == ConsoleMessage.MessageLevel.WARNING) lv = "WARN";
        else if (ml == ConsoleMessage.MessageLevel.TIP || ml == ConsoleMessage.MessageLevel.DEBUG) lv = "INFO";
        String msg = cm.message() == null ? "" : cm.message();
        String src = cm.sourceId();
        if (src != null && !src.isEmpty() && ("ERROR".equals(lv) || "WARN".equals(lv))) {
            int slash = src.lastIndexOf('/');
            String shortSrc = slash >= 0 ? src.substring(slash + 1) : src;
            msg = msg + " (" + shortSrc + ":" + cm.lineNumber() + ")";
        }
        append(lv, msg);
    }

    void append(final String level, final String text) {
        final String lv = level == null ? "LOG" : level.toUpperCase(Locale.US);
        final String tx = text == null ? "" : text;
        final String tm = timeFmt.format(new Date());
        act.runOnUiThread(() -> {
            Entry e = new Entry(lv, tm, tx);
            entries.add(e);
            if (entries.size() > MAX_LOGS) {
                entries.remove(0);
                if (isVisible()) {
                    rebuildList();
                    return;
                }
            }
            if (isVisible() && matchesFilter(e)) {
                logList.addView(buildRowView(e));
                scrollToBottom();
            }
        });
    }

    private boolean matchesFilter(Entry e) {
        if ("ALL".equals(filter)) return true;
        if ("WARN".equals(filter)) return "WARN".equals(e.level) || "ERROR".equals(e.level);
        if ("ERROR".equals(filter)) return "ERROR".equals(e.level);
        return true;
    }

    private void cycleFilter() {
        if ("ALL".equals(filter)) filter = "WARN";
        else if ("WARN".equals(filter)) filter = "ERROR";
        else filter = "ALL";
        btnFilter.setText(filter);
        rebuildList();
    }

    private void rebuildList() {
        logList.removeAllViews();
        int shown = 0;
        for (Entry e : entries) {
            if (!matchesFilter(e)) continue;
            logList.addView(buildRowView(e));
            shown++;
        }
        if (shown == 0) {
            TextView empty = new TextView(act);
            empty.setText(host.isEnglish() ? "No logs yet." : "Chưa có log nào.");
            empty.setTextColor(0xFF777788);
            empty.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
            empty.setTypeface(Typeface.MONOSPACE);
            empty.setPadding(dp(4), dp(8), dp(4), dp(8));
            logList.addView(empty);
        }
        scrollToBottom();
    }

    private View buildRowView(Entry e) {
        TextView tv = new TextView(act);
        tv.setText("[" + e.time + "] " + e.text);
        tv.setTypeface(Typeface.MONOSPACE);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        tv.setTextIsSelectable(true);
        tv.setPadding(dp(6), dp(4), dp(6), dp(4));

        int fg = 0xFFE6E1E5;
        int bg = 0xFF18181E;
        if ("ERROR".equals(e.level)) { fg = 0xFFFF8A80; bg = 0xFF2B171A; }
        else if ("WARN".equals(e.level)) { fg = 0xFFFFD54F; bg = 0xFF292415; }
        else if ("CMD".equals(e.level)) { fg = 0xFFD0BCFF; bg = 0xFF1E1A2B; }
        else if ("RES".equals(e.level)) { fg = 0xFFA5D6A7; bg = 0xFF162218; }
        else if ("INFO".equals(e.level)) { fg = 0xFF80DEEA; bg = 0xFF152024; }

        tv.setTextColor(fg);
        tv.setBackgroundColor(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(2);
        tv.setLayoutParams(lp);
        return tv;
    }

    private void scrollToBottom() {
        scroll.post(() -> scroll.fullScroll(View.FOCUS_DOWN));
    }

    private void submitCommand() {
        String code = input.getText() == null ? "" : input.getText().toString().trim();
        if (code.isEmpty()) return;
        input.setText("");
        append("CMD", "> " + code);
        WebView w = host.getWebView();
        if (w == null) {
            append("ERROR", "WebView is null");
            return;
        }
        String js = "(function(){try{" +
                "var __r=(0,eval)(" + JSONObject.quote(code) + ");" +
                "if(__r&&typeof __r.then==='function'){" +
                "__r.then(function(v){window.AndroidBridge&&window.AndroidBridge.devConsoleLog&&window.AndroidBridge.devConsoleLog('RES','< '+String(v));})" +
                ".catch(function(e){window.AndroidBridge&&window.AndroidBridge.devConsoleLog&&window.AndroidBridge.devConsoleLog('ERROR',String(e&&e.stack||e));});" +
                "return 'Promise {<pending>}';" +
                "}" +
                "if(__r===null)return 'null';" +
                "if(__r===undefined)return 'undefined';" +
                "if(typeof __r==='object'){try{return JSON.stringify(__r,null,2);}catch(e){return String(__r);}}" +
                "return String(__r);" +
                "}catch(e){return '__ERR__:'+(e&&e.stack?e.stack:String(e));}})()";
        w.evaluateJavascript(js, val -> {
            String decoded = unquoteJsResult(val);
            if (decoded.startsWith("__ERR__:")) {
                append("ERROR", decoded.substring(8));
            } else {
                append("RES", "< " + decoded);
            }
        });
    }

    private void triggerTapInspect() {
        WebView w = host.getWebView();
        if (w == null) return;
        Toast.makeText(act, host.isEnglish()
                ? "Tap anywhere on the page above to inspect layers"
                : "Chạm vào bất kỳ chỗ nào trên WebView phía trên để soi lớp phủ", Toast.LENGTH_SHORT).show();
        String js = "(function(){" +
                "if(window.__mpNativeInspectHandler){document.removeEventListener('pointerdown',window.__mpNativeInspectHandler,true);}" +
                "window.__mpNativeInspectHandler=function(e){" +
                "document.removeEventListener('pointerdown',window.__mpNativeInspectHandler,true);" +
                "window.__mpNativeInspectHandler=null;" +
                "var x=Math.round(e.clientX),y=Math.round(e.clientY);" +
                "var st=document.elementsFromPoint(x,y).slice(0,10).map(function(el,i){" +
                "var cs=getComputedStyle(el);" +
                "var id=el.id?('#'+el.id):'';" +
                "var cl=(typeof el.className==='string'&&el.className.trim())?('.'+el.className.trim().split(/\\s+/).join('.')):'';" +
                "return (i+1)+'. '+el.tagName.toLowerCase()+id+cl+' [z='+cs.zIndex+', pe='+cs.pointerEvents+', op='+cs.opacity+', pos='+cs.position+']';" +
                "});" +
                "var ae=document.activeElement;" +
                "var aeStr=ae?(ae.tagName.toLowerCase()+(ae.id?'#'+ae.id:'')):'none';" +
                "var out='Inspect ('+x+','+y+') | ss-open='+document.body.classList.contains('ss-open')+' | active='+aeStr+'\\n'+st.join('\\n');" +
                "if(window.AndroidBridge&&window.AndroidBridge.devConsoleLog){window.AndroidBridge.devConsoleLog('INFO',out);}" +
                "};" +
                "document.addEventListener('pointerdown',window.__mpNativeInspectHandler,true);" +
                "})()";
        w.evaluateJavascript(js, null);
    }

    private void copyLogs() {
        if (entries.isEmpty()) return;
        StringBuilder sb = new StringBuilder();
        for (Entry e : entries) {
            sb.append('[').append(e.time).append("] [").append(e.level).append("] ").append(e.text).append('\n');
        }
        try {
            ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) {
                cm.setPrimaryClip(ClipData.newPlainText("MediaPlayer Console", sb.toString()));
                Toast.makeText(act, host.isEnglish() ? "Copied logs" : "Đã sao chép log", Toast.LENGTH_SHORT).show();
            }
        } catch (Throwable ignored) {}
    }

    private void clearLogs() {
        entries.clear();
        rebuildList();
    }

    private void hideKeyboard() {
        try {
            InputMethodManager imm = (InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.hideSoftInputFromWindow(input.getWindowToken(), 0);
        } catch (Throwable ignored) {}
    }

    private static String unquoteJsResult(String raw) {
        if (raw == null || "null".equals(raw)) return "null";
        if (raw.length() >= 2 && raw.startsWith("\"") && raw.endsWith("\"")) {
            try {
                return new org.json.JSONArray("[" + raw + "]").getString(0);
            } catch (Throwable ignored) {}
        }
        return raw;
    }

    private TextView makeActionBtn(String label, int bg, int fg) {
        TextView b = new TextView(act);
        b.setText(label);
        b.setTextColor(fg);
        b.setBackgroundColor(bg);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        b.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(8), dp(5), dp(8), dp(5));
        b.setClickable(true);
        return b;
    }

    private LinearLayout.LayoutParams actionLp() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = dp(4);
        return lp;
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, act.getResources().getDisplayMetrics()));
    }
}
