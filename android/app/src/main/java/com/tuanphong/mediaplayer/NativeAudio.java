package com.tuanphong.mediaplayer;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;

import org.json.JSONObject;

import java.io.File;

/**
 * Trình phát nhạc thật nằm ở khung app (không phụ thuộc WebView). Trang web chỉ ra lệnh (nạp/phát/tạm dừng/tua)
 * và nhận lại sự kiện trạng thái; khi WebView chết rồi tải lại, trang hỏi lại trạng thái ở đây để vào đúng bài/vị trí.
 * Mọi thao tác với ExoPlayer đều chạy trên luồng chính.
 */
final class NativeAudio {
    private NativeAudio() {}

    private static final Handler main = new Handler(Looper.getMainLooper());
    private static Context app;
    private static ExoPlayer p;
    private static String curId = "", title = "", artist = "";
    // Hàng đợi do trang gửi sang: id/tiêu đề/nghệ sĩ theo thứ tự danh sách, order = thứ tự phát (shuffle) dạng chỉ số, repeat 0 tắt / 1 tất cả / 2 một bài
    private static String[] qIds = new String[0], qTitles = new String[0], qArtists = new String[0];
    private static int[] order = new int[0];
    private static int repeat = 0;
    private static boolean loaded = false, endedHandled = false;
    private static float rate = 1f, vol = 1f;
    /** elapsedRealtime của lần trang web phản hồi gần nhất (evaluateJavascript trả về = renderer còn sống). */
    static volatile long lastAck = 0;

    private static long sleepAt = 0;
    private static int sleepTracks = 0;
    private static final Runnable sleepRun = () -> { sleepAt = 0; pause(); emit("sleep"); };
    /** Hẹn giờ ngủ do app giữ để vẫn tạm dừng đúng giờ / đúng số bài khi WebView bị đóng băng. endAtMs = 0: không hẹn theo giờ; tracks = 0: không hẹn theo bài. */
    static void setSleep(long endAtMs, int tracks) {
        main.removeCallbacks(sleepRun);
        sleepAt = endAtMs; sleepTracks = Math.max(0, tracks);
        if (endAtMs > 0) main.postDelayed(sleepRun, Math.max(0, endAtMs - System.currentTimeMillis()));
    }

    static void post(Runnable r) { main.post(r); }

    static boolean active() { return loaded && p != null; }
    static boolean webAlive() { return MainActivity.instance != null && SystemClock.elapsedRealtime() - lastAck < 4000; }
    static boolean hasNext() { return stepQ(1) >= 0; }

    private static int curQ() {
        for (int i = 0; i < qIds.length; i++) if (qIds[i].equals(curId)) return i;
        return -1;
    }
    /** Chỉ số (trong danh sách) của bài cách bài hiện tại `dir` bước theo thứ tự phát; -1 nếu không có. Bỏ qua bài không mở được. */
    private static int stepQ(int dir) {
        int c = curQ();
        if (c < 0 || order.length == 0) return -1;
        if (dir > 0 && repeat == 2) return c;
        int pos = -1;
        for (int i = 0; i < order.length; i++) if (order[i] == c) { pos = i; break; }
        if (pos < 0) return -1;
        int n = order.length;
        for (int k = 1; k <= n; k++) {
            int np = pos + dir * k;
            if (np >= n || np < 0) {
                if (dir > 0 && repeat != 1) return -1;
                np = ((np % n) + n) % n;
            }
            int q = order[np];
            if (q == c) return -1;
            if (q >= 0 && q < qIds.length && !qIds[q].isEmpty() && MainActivity.resolveServed(qIds[q]) != null) return q;
        }
        return -1;
    }

    private static final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (p != null && p.getPlayWhenReady() && loaded) {
                emit("tick");
                main.postDelayed(this, 500);
            }
        }
    };

    private static void ensure(Context c) {
        if (p != null) return;
        app = c.getApplicationContext();
        p = new ExoPlayer.Builder(app).build();
        p.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        p.setHandleAudioBecomingNoisy(true);
        p.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int st) {
                if (st == Player.STATE_ENDED) { onEnded(); return; }
                emit("state");
            }
            @Override public void onPlayWhenReadyChanged(boolean pwr, int reason) {
                main.removeCallbacks(ticker);
                if (pwr) main.postDelayed(ticker, 500);
                emit("state");
            }
            @Override public void onPositionDiscontinuity(Player.PositionInfo o, Player.PositionInfo n, int reason) {
                if (reason == Player.DISCONTINUITY_REASON_SEEK) emit("seeked");
            }
            @Override public void onPlayerError(PlaybackException e) {
                emit("error");
            }
        });
    }

    private static Uri uriFor(String id) {
        Uri u = MainActivity.resolveServed(id);
        String loc = MainActivity.resolveLocation(id);
        try {
            if (loc != null && !loc.isEmpty()) {
                File f = new File(loc);
                if (f.isFile() && f.canRead()) return Uri.fromFile(f);
            }
        } catch (Throwable ignored) {}
        return u;
    }

    static void load(Context c, String id, String t, String a, long startMs, boolean play, float volume, float speed) {
        ensure(c);
        Uri u = uriFor(id);
        curId = id; title = t == null ? "" : t; artist = a == null ? "" : a;
        endedHandled = false;
        if (u == null) { loaded = true; emit("error"); return; }
        loaded = true;
        vol = volume; rate = speed <= 0 ? 1f : speed;
        p.setVolume(vol);
        p.setPlaybackParameters(new PlaybackParameters(rate));
        p.setMediaItem(MediaItem.fromUri(u), Math.max(0, startMs));
        p.prepare();
        p.setPlayWhenReady(play);
        emit("load");
    }

    static void play() {
        if (p == null || !loaded) return;
        if (p.getPlaybackState() == Player.STATE_ENDED) { p.seekTo(0); endedHandled = false; }
        p.setPlayWhenReady(true);
    }
    static void pause() { if (p != null && loaded) p.setPlayWhenReady(false); }
    static void toggle() { if (p != null && loaded) { if (p.getPlayWhenReady() && p.getPlaybackState() != Player.STATE_ENDED) pause(); else play(); } }
    static void seek(long ms) { if (p != null && loaded) { endedHandled = false; p.seekTo(Math.max(0, ms)); } }
    static void setVolume(float v) { vol = v; if (p != null) p.setVolume(v); }
    static void setRate(float r) { rate = r <= 0 ? 1f : r; if (p != null) p.setPlaybackParameters(new PlaybackParameters(rate)); }

    /** Dừng hẳn (trang chuyển sang phát bằng thẻ audio thường, hoặc app thoát). */
    static void stop() {
        loaded = false; curId = "";
        main.removeCallbacks(ticker);
        if (p != null) { try { p.stop(); p.clearMediaItems(); } catch (Throwable ignored) {} }
    }
    static void release() {
        main.removeCallbacks(sleepRun); sleepAt = 0; sleepTracks = 0;
        stop();
        if (p != null) { try { p.release(); } catch (Throwable ignored) {} p = null; }
    }

    static void setQueue(String json) {
        try {
            JSONObject o = new JSONObject(json);
            org.json.JSONArray ids = o.getJSONArray("ids"), ts = o.optJSONArray("titles"), as = o.optJSONArray("artists"), od = o.optJSONArray("order");
            int n = ids.length();
            String[] a1 = new String[n], a2 = new String[n], a3 = new String[n];
            for (int i = 0; i < n; i++) {
                a1[i] = ids.optString(i, ""); a2[i] = ts == null ? "" : ts.optString(i, ""); a3[i] = as == null ? "" : as.optString(i, "");
            }
            int[] ord = new int[od == null ? n : od.length()];
            for (int i = 0; i < ord.length; i++) ord[i] = od == null ? i : od.optInt(i, i);
            qIds = a1; qTitles = a2; qArtists = a3; order = ord; repeat = o.optInt("repeat", 0);
        } catch (Throwable ignored) {}
    }

    static int sessionId() { return p == null ? 0 : p.getAudioSessionId(); }

    /** Hết bài: nếu trang còn sống thì để trang tự quyết (shuffle/lặp/…); nếu trang chết thì app tự sang bài kế đã được báo trước. */
    private static void onEnded() {
        if (endedHandled) return;
        endedHandled = true;
        main.removeCallbacks(ticker);
        if (!webAlive()) {
            if (sleepTracks > 0 && --sleepTracks == 0) { emit("sleep"); return; }   // trang đang chết nên app tự đếm số bài hẹn giờ
            if (hasNext()) { advance(); return; }
        }
        emit("ended");
    }

    /** Sang bài kế (dùng khi trang đang chết / điều khiển từ thông báo). */
    static boolean advance() { return go(stepQ(1)); }
    /** Bài trước: đã phát quá 3 giây thì tua về đầu bài, không thì lùi một bài theo thứ tự phát. */
    static boolean previous() {
        if (p != null && loaded && p.getCurrentPosition() > 3000) { seek(0); return true; }
        if (!go(stepQ(-1))) { seek(0); }
        return true;
    }
    private static boolean go(int q) {
        if (p == null || q < 0 || q >= qIds.length) return false;
        load(app, qIds[q], qTitles[q], qArtists[q], 0, true, vol, rate);
        emit("advanced");
        return true;
    }

    static JSONObject snapshot(String ev) {
        JSONObject o = new JSONObject();
        try {
            o.put("ev", ev);
            o.put("id", curId);
            o.put("title", title);
            o.put("artist", artist);
            o.put("loaded", loaded);
            if (p != null && loaded) {
                int st = p.getPlaybackState();
                o.put("st", st == Player.STATE_ENDED ? "ended" : st == Player.STATE_BUFFERING ? "buffering" : st == Player.STATE_READY ? "ready" : "idle");
                o.put("pwr", p.getPlayWhenReady());
                o.put("pos", Math.max(0, p.getCurrentPosition()));
                long d = p.getDuration();
                o.put("dur", d == C.TIME_UNSET ? 0 : d);
                o.put("buf", Math.max(0, p.getBufferedPosition()));
                o.put("rate", rate);
                o.put("err", p.getPlayerError() != null);
            } else {
                o.put("st", "idle"); o.put("pwr", false); o.put("pos", 0); o.put("dur", 0); o.put("buf", 0); o.put("rate", rate); o.put("err", false);
            }
            o.put("qn", qIds.length);
        } catch (Throwable ignored) {}
        return o;
    }

    static String stateJson() { return snapshot("get").toString(); }

    private static void emit(String ev) {
        try {
            JSONObject o = snapshot(ev);
            MediaService.onNative(o);
            MainActivity a = MainActivity.instance;
            if (a != null) a.evalAck("window.__nativeAudioEv&&window.__nativeAudioEv(" + o.toString() + ")");
        } catch (Throwable ignored) {}
    }
}
