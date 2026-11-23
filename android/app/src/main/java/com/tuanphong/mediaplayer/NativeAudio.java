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
    private static String nextId = "", nextTitle = "", nextArtist = "";
    private static boolean loaded = false, endedHandled = false;
    private static float rate = 1f, vol = 1f;
    /** elapsedRealtime của lần trang web phản hồi gần nhất (evaluateJavascript trả về = renderer còn sống). */
    static volatile long lastAck = 0;

    static void post(Runnable r) { main.post(r); }

    static boolean active() { return loaded && p != null; }
    static boolean webAlive() { return MainActivity.instance != null && SystemClock.elapsedRealtime() - lastAck < 4000; }
    static boolean hasNext() { return !nextId.isEmpty() && MainActivity.resolveServed(nextId) != null; }

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
        stop();
        if (p != null) { try { p.release(); } catch (Throwable ignored) {} p = null; }
    }

    static void setNext(String id, String t, String a) {
        nextId = id == null ? "" : id; nextTitle = t == null ? "" : t; nextArtist = a == null ? "" : a;
    }

    static int sessionId() { return p == null ? 0 : p.getAudioSessionId(); }

    /** Hết bài: nếu trang còn sống thì để trang tự quyết (shuffle/lặp/…); nếu trang chết thì app tự sang bài kế đã được báo trước. */
    private static void onEnded() {
        if (endedHandled) return;
        endedHandled = true;
        main.removeCallbacks(ticker);
        if (!webAlive() && hasNext()) { advance(); return; }
        emit("ended");
    }

    /** Sang bài kế do trang đã báo trước (dùng khi trang đang chết / điều khiển từ thông báo). */
    static boolean advance() {
        if (p == null || !hasNext()) return false;
        String id = nextId, t = nextTitle, a = nextArtist;
        nextId = ""; 
        load(app, id, t, a, 0, true, vol, rate);
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
            o.put("nextId", nextId);
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
