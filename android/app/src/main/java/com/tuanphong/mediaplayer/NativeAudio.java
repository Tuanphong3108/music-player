package com.tuanphong.mediaplayer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
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
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
final class NativeAudio {
    private NativeAudio() {}

    /** ExoPlayer chạy trên luồng riêng: UI/WebView bận (nạp thư viện, dựng danh sách) cũng không làm chậm lúc bắt đầu phát. */
    private static final android.os.HandlerThread pt = new android.os.HandlerThread("native-audio", android.os.Process.THREAD_PRIORITY_AUDIO);
    private static final Handler ph;
    private static final Handler uiH = new Handler(Looper.getMainLooper());
    static { pt.start(); ph = new Handler(pt.getLooper()); }
    /** EQ/preamp/mono/nén/cân bằng + phân tích phổ chạy trong chuỗi âm thanh của ExoPlayer. */
    static final MixerProcessor mixer = new MixerProcessor();
    static void setMixer(String json) {
        try {
            JSONObject o = new JSONObject(json);
            org.json.JSONArray e = o.optJSONArray("eq");
            float[] eq = new float[5];
            for (int i = 0; i < 5; i++) eq[i] = e == null ? 0f : (float) e.optDouble(i, 0);
            mixer.set((float) o.optDouble("pre", 0), o.optBoolean("eqOn", true), eq, o.optBoolean("mono", false), o.optBoolean("comp", false), (float) (o.optDouble("balance", 0) / 100.0));
        } catch (Throwable ignored) {}
    }
    static void setViz(boolean on) { mixer.vizOn = on; }
    static String fftBase64() {
        try { return android.util.Base64.encodeToString(mixer.fft, android.util.Base64.NO_WRAP); } catch (Throwable t) { return ""; }
    }
    private static volatile Context app;
    private static volatile ExoPlayer p;
    private static volatile int sid = 0;
    private static volatile String curId = "";
    private static String title = "", artist = "";
    // Hàng đợi do trang gửi sang: id/tiêu đề/nghệ sĩ/đường dẫn theo thứ tự danh sách, order = thứ tự phát (shuffle) dạng chỉ số, repeat 0 tắt / 1 tất cả / 2 một bài
    private static volatile String[] qIds = new String[0], qTitles = new String[0], qArtists = new String[0], qLocs = new String[0];
    private static volatile int[] order = new int[0];
    private static volatile boolean shuffled = false;
    private static volatile int repeat = 0;
    private static volatile boolean loaded = false;
    private static boolean endedHandled = false;
    private static float rate = 1f, vol = 1f;
    /** elapsedRealtime của lần trang web phản hồi gần nhất (evaluateJavascript trả về = renderer còn sống). */
    static volatile long lastAck = 0;

    private static long sleepAt = 0;
    private static long sleepDurationMin = 0;
    private static int sleepTracks = 0;
    private static int sleepTotalTracks = 0;
    private static volatile boolean sleepFiredPending = false;
    private static volatile String sleepFiredType = "";
    private static volatile long sleepFiredTotal = 0;
    private static final Runnable sleepRun = () -> triggerSleepEnded();
    /** Hẹn giờ ngủ do app giữ để vẫn tạm dừng đúng giờ / đúng số bài khi WebView bị đóng băng. endAtMs = 0: không hẹn theo giờ; tracks = 0: không hẹn theo bài. */
    static void setSleep(long endAtMs, int tracks) {
        ph.removeCallbacks(sleepRun);
        sleepAt = endAtMs;
        int tr = Math.max(0, tracks);
        sleepTracks = tr;
        sleepTotalTracks = tr > 0 ? tr : 0;
        if (endAtMs > 0L) {
            long rem = Math.max(0L, endAtMs - System.currentTimeMillis());
            sleepDurationMin = Math.max(1L, Math.round(rem / 60000.0));
            ph.postDelayed(sleepRun, rem);
        } else {
            sleepDurationMin = 0L;
        }
        if (sleepAt > 0L || tr > 0) {
            sleepFiredPending = false;
            sleepFiredType = "";
            sleepFiredTotal = 0L;
        }
    }

    static void triggerSleepEnded() {
        String type = sleepTracks > 0 ? "tracks" : "time";
        long total = "tracks".equals(type) ? Math.max(1L, sleepTotalTracks) : Math.max(1L, sleepDurationMin);
        sleepAt = 0L;
        sleepDurationMin = 0L;
        sleepTracks = 0;
        sleepTotalTracks = 0;
        ph.removeCallbacks(sleepRun);
        sleepFiredPending = true;
        sleepFiredType = type;
        sleepFiredTotal = total;
        pauseImpl();
        emit("sleep");
        if (app != null && isAppInBackground(app)) {
            showSleepEndedNotification(app, type, total);
        }
        if (isAppInBackground(app)) {
            MediaService.onNative(snapshot("sleep"));
        }
    }

    static boolean hasPendingSleepEndedNotice() {
        return sleepFiredPending;
    }

    static void notifyWebSleepEndedIfReady() {
        if (!sleepFiredPending) return;
        MainActivity a = MainActivity.instance;
        if (a != null) {
            String jsType = org.json.JSONObject.quote(sleepFiredType == null ? "time" : sleepFiredType);
            a.evalAck("window.__showNativeSleepEndedNotice&&window.__showNativeSleepEndedNotice(" + jsType + "," + sleepFiredTotal + ")");
        }
    }

    /** Kiểm tra thật ở tầng hệ thống xem app đang chạy ở nền / tắt màn hình hay đang mở trên màn hình. */
    private static boolean isAppInBackground(Context ctx) {
        MainActivity act = MainActivity.instance;
        if (act == null || act.isInBackgroundForMedia()) return true;
        if (ctx == null) return true;
        try {
            android.os.PowerManager pm = (android.os.PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) return true;
        } catch (Throwable ignored) {}
        try {
            android.app.KeyguardManager km = (android.app.KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) return true;
        } catch (Throwable ignored) {}
        try {
            android.app.ActivityManager am = (android.app.ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                java.util.List<android.app.ActivityManager.RunningAppProcessInfo> procs = am.getRunningAppProcesses();
                if (procs != null) {
                    int myPid = android.os.Process.myPid();
                    for (android.app.ActivityManager.RunningAppProcessInfo pi : procs) {
                        if (pi.pid == myPid) {
                            return pi.importance != android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
                        }
                    }
                }
            }
        } catch (Throwable ignored) {}
        return false;
    }

    static void checkTrackSleepOnEnd() {
        if (sleepTracks > 0 && --sleepTracks == 0) {
            triggerSleepEnded();
        }
    }

    static void consumeSleepEndedNotice() {
        sleepFiredPending = false;
        sleepFiredType = "";
        sleepFiredTotal = 0L;
        if (app != null) {
            cancelSleepEndedNotification(app);
        }
    }

    private static final String SLEEP_NOTIF_CHANNEL = "mp_sleep_timer";
    private static final int SLEEP_NOTIF_ID = 2027;

    static void cancelSleepEndedNotification(Context ctx) {
        if (ctx == null) return;
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(SLEEP_NOTIF_ID);
        } catch (Throwable ignored) {}
    }

    private static void showSleepEndedNotification(Context ctx, String type, long total) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            boolean isEn = "en".equalsIgnoreCase(ctx.getSharedPreferences("app", Context.MODE_PRIVATE).getString("lang", "vi"));
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel(
                        SLEEP_NOTIF_CHANNEL,
                        isEn ? "Sleep timer" : "Hẹn giờ ngủ",
                        NotificationManager.IMPORTANCE_HIGH
                );
                ch.setShowBadge(true);
                nm.createNotificationChannel(ch);
            }
            String title = isEn ? "Sleep timer" : "Đã tạm dừng theo hẹn giờ";
            String body = "tracks".equals(type)
                    ? (isEn
                        ? "Playback paused automatically because the timer for " + total + " tracks finished."
                        : "Nhạc đã tự tạm dừng vì hẹn giờ sau " + total + " bài đã hoàn thành.")
                    : (isEn
                        ? "Playback paused automatically because the " + total + "-minute timer ran out."
                        : "Nhạc đã tự tạm dừng vì hẹn giờ " + total + " phút đã hết.");
            PendingIntent open = PendingIntent.getActivity(
                    ctx,
                    SLEEP_NOTIF_ID,
                    new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP),
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );
            Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new Notification.Builder(ctx, SLEEP_NOTIF_CHANNEL)
                    : new Notification.Builder(ctx);
            b.setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new Notification.BigTextStyle().bigText(body))
                    .setPriority(Notification.PRIORITY_HIGH)
                    .setContentIntent(open)
                    .setAutoCancel(true)
                    .setVisibility(Notification.VISIBILITY_PUBLIC);
            nm.notify(SLEEP_NOTIF_ID, b.build());
        } catch (Throwable ignored) {}
    }

    static void post(Runnable r) { ph.post(r); }
    /** Khởi tạo sẵn trình phát lúc mở app để lần phát đầu tiên không phải chờ dựng ExoPlayer. */
    static void warmUp(final Context c) { ph.post(() -> ensure(c)); }

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
        int total = qIds.length;
        if (c < 0 || total == 0) return -1;
        if (dir > 0 && repeat == 2) return c;
        int[] seq = null;
        if (!shuffled || order.length != total) {
            seq = new int[total];
            for (int i = 0; i < total; i++) seq[i] = i;
        }
        int[] ord = seq != null ? seq : order;
        int pos = -1;
        for (int i = 0; i < ord.length; i++) if (ord[i] == c) { pos = i; break; }
        if (pos < 0) return -1;
        int n = ord.length;
        for (int k = 1; k <= n; k++) {
            int np = pos + dir * k;
            if (np >= n || np < 0) {
                if (dir > 0 && repeat != 1) return -1;
                np = ((np % n) + n) % n;
            }
            int q = ord[np];
            if (q == c) return -1;
            if (q >= 0 && q < qIds.length && !qIds[q].isEmpty() && MainActivity.resolveServed(qIds[q]) != null) return q;
        }
        return -1;
    }

    private static final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (p != null && loaded) {
                emit("tick");
                ph.postDelayed(this, 500);
            }
        }
    };

    private static void ensure(Context c) {
        if (p != null) return;
        app = c.getApplicationContext();
        // Nhạc trong máy: chỉ cần đệm rất ít là phát ngay (mặc định đợi 2,5 giây dữ liệu)
        androidx.media3.exoplayer.DefaultLoadControl lc = new androidx.media3.exoplayer.DefaultLoadControl.Builder()
                .setBufferDurationsMs(15000, 30000, 250, 1000).build();
        androidx.media3.exoplayer.DefaultRenderersFactory rf = new androidx.media3.exoplayer.DefaultRenderersFactory(app) {
            @Override
            protected androidx.media3.exoplayer.audio.AudioSink buildAudioSink(Context context, boolean enableFloatOutput, boolean enableAudioTrackPlaybackParams) {
                return new androidx.media3.exoplayer.audio.DefaultAudioSink.Builder(context)
                        .setEnableFloatOutput(false)
                        .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                        .setAudioProcessors(new androidx.media3.common.audio.AudioProcessor[] { mixer })
                        .build();
            }
        };
        p = new ExoPlayer.Builder(app, rf).setLooper(pt.getLooper()).setLoadControl(lc).build();
        sid = p.getAudioSessionId();
        p.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        p.setHandleAudioBecomingNoisy(true);
        p.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int st) {
                if (st == Player.STATE_ENDED) { onEnded(); return; }
                emit("state");
            }
            @Override public void onPlayWhenReadyChanged(boolean pwr, int reason) {
                ph.removeCallbacks(ticker);
                if (loaded) ph.postDelayed(ticker, 500);
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

    static void load(final Context c, final String id, final String t, final String a, final long startMs, final boolean play, final float volume, final float speed) {
        ph.post(() -> loadImpl(c, id, t, a, startMs, play, volume, speed));
    }
    private static void loadImpl(Context c, String id, String t, String a, long startMs, boolean play, float volume, float speed) {
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
        ph.removeCallbacks(ticker);
        ph.postDelayed(ticker, 500);
    }

    static void play() { ph.post(NativeAudio::playImpl); }
    private static void playImpl() {
        if (p == null || !loaded) return;
        if (p.getPlaybackState() == Player.STATE_ENDED) { p.seekTo(0); endedHandled = false; }
        p.setPlayWhenReady(true);
    }
    static void pause() { ph.post(NativeAudio::pauseImpl); }
    private static void pauseImpl() { if (p != null && loaded) p.setPlayWhenReady(false); }
    static void toggle() { ph.post(() -> { if (p != null && loaded) { if (p.getPlayWhenReady() && p.getPlaybackState() != Player.STATE_ENDED) pauseImpl(); else playImpl(); } }); }
    static void seek(final long ms) { ph.post(() -> { if (p != null && loaded) { endedHandled = false; p.seekTo(Math.max(0, ms)); } }); }
    static void setVolume(final float v) { ph.post(() -> { vol = v; if (p != null) p.setVolume(v); }); }
    static void setRate(final float r) { ph.post(() -> { rate = r <= 0 ? 1f : r; if (p != null) p.setPlaybackParameters(new PlaybackParameters(rate)); }); }

    /** Dừng hẳn (trang chuyển sang phát bằng thẻ audio thường, hoặc app thoát). */
    static void stop() { ph.post(NativeAudio::stopImpl); }
    private static void stopImpl() {
        loaded = false; curId = "";
        ph.removeCallbacks(ticker);
        if (p != null) { try { p.stop(); p.clearMediaItems(); } catch (Throwable ignored) {} }
        emit("stop");
    }
    static void release() {
        loaded = false;
        lastSnap = "{\"loaded\":false,\"id\":\"\",\"st\":\"idle\",\"pwr\":false}";
        lastSnapAt = SystemClock.elapsedRealtime();
        ph.post(() -> {
            ph.removeCallbacks(sleepRun); sleepAt = 0; sleepTracks = 0;
            stopImpl();
            if (p != null) { try { p.release(); } catch (Throwable ignored) {} p = null; }
        });
    }

    static void setQueue(String json) {
        try {
            JSONObject o = new JSONObject(json);
            org.json.JSONArray ids = o.getJSONArray("ids"), ts = o.optJSONArray("titles"), as = o.optJSONArray("artists"), locs = o.optJSONArray("locations"), od = o.optJSONArray("order");
            int n = ids.length();
            String[] a1 = new String[n], a2 = new String[n], a3 = new String[n], a4 = new String[n];
            for (int i = 0; i < n; i++) {
                a1[i] = ids.optString(i, "");
                a2[i] = ts == null ? "" : ts.optString(i, "");
                a3[i] = as == null ? "" : as.optString(i, "");
                String l = locs == null ? "" : locs.optString(i, "");
                if (l.isEmpty() && !a1[i].isEmpty()) {
                    String rl = MainActivity.resolveLocation(a1[i]);
                    if (rl != null) l = rl;
                }
                a4[i] = l;
            }
            int[] ord = new int[od == null ? n : od.length()];
            for (int i = 0; i < ord.length; i++) ord[i] = od == null ? i : od.optInt(i, i);
            boolean sh = o.optBoolean("shuffle", od != null && od.length() == n);
            qIds = a1; qTitles = a2; qArtists = a3; qLocs = a4; order = ord; shuffled = sh; repeat = o.optInt("repeat", 0);
        } catch (Throwable ignored) {}
    }

    /** Trả về hàng đợi hiện tại của trình phát native (kèm đường dẫn tệp + trạng thái shuffle/repeat/sleep) để WebView đồng bộ lại khi thoát ra vào lại. */
    static String queueStateJson() {
        try {
            JSONObject o = new JSONObject();
            String[] ids = qIds;
            String[] locs = qLocs;
            int[] ord = order;
            org.json.JSONArray jIds = new org.json.JSONArray();
            org.json.JSONArray jLocs = new org.json.JSONArray();
            for (int i = 0; i < ids.length; i++) {
                String id = ids[i] == null ? "" : ids[i];
                jIds.put(id);
                String loc = (locs != null && i < locs.length && locs[i] != null && !locs[i].isEmpty())
                        ? locs[i]
                        : MainActivity.resolveLocation(id);
                jLocs.put(loc == null ? "" : loc);
            }
            org.json.JSONArray jOrd = new org.json.JSONArray();
            for (int v : ord) jOrd.put(v);
            o.put("count", ids.length);
            o.put("ids", jIds);
            o.put("locations", jLocs);
            o.put("shuffle", shuffled && ord.length == ids.length);
            o.put("order", jOrd);
            o.put("repeat", repeat);
            long nowMs = System.currentTimeMillis();
            long remMs = sleepAt > nowMs ? (sleepAt - nowMs) : 0L;
            boolean sleepOn = (remMs > 0L) || (sleepTracks > 0);
            o.put("sleepActive", sleepOn);
            o.put("sleepAt", sleepAt);
            o.put("sleepRemainingMs", remMs);
            o.put("sleepTracks", sleepTracks);
            o.put("sleepTotalTracks", sleepTotalTracks);
            o.put("curId", curId == null ? "" : curId);
            String curLoc = MainActivity.resolveLocation(curId);
            o.put("curLoc", curLoc == null ? "" : curLoc);
            o.put("sleepFired", sleepFiredPending);
            o.put("sleepFiredType", sleepFiredType);
            o.put("sleepFiredTotal", sleepFiredTotal);
            return o.toString();
        } catch (Throwable t) {
            return "{\"count\":0,\"ids\":[],\"locations\":[],\"shuffle\":false,\"order\":[],\"repeat\":0,\"sleepActive\":false,\"sleepAt\":0,\"sleepRemainingMs\":0,\"sleepTracks\":0,\"sleepTotalTracks\":0,\"curId\":\"\",\"curLoc\":\"\"}";
        }
    }

    static int sessionId() { return sid; }

    /** Hết bài: kiểm tra hẹn giờ theo số bài trước; nếu trang chết thì app tự sang bài kế đã được báo trước. */
    private static void onEnded() {
        if (endedHandled) return;
        endedHandled = true;
        if (sleepTracks > 0) {
            checkTrackSleepOnEnd();
            return;
        }
        if (!webAlive() && hasNext()) {
            advance();
            return;
        }
        emit("ended");
    }

    /** Sang bài kế (dùng khi trang đang chết / điều khiển từ thông báo). */
    static boolean advance() {
        final int q = stepQ(1);
        if (q < 0) return false;
        ph.post(() -> go(q));
        return true;
    }
    /** Bài trước: đã phát quá 3 giây thì tua về đầu bài, không thì lùi một bài theo thứ tự phát. */
    static boolean previous() {
        ph.post(() -> {
            if (p != null && loaded && p.getCurrentPosition() > 3000) { p.seekTo(0); endedHandled = false; return; }
            if (!go(stepQ(-1)) && p != null && loaded) { p.seekTo(0); endedHandled = false; }
        });
        return true;
    }
    private static boolean go(int q) {
        if (p == null || q < 0 || q >= qIds.length) return false;
        loadImpl(app, qIds[q], qTitles[q], qArtists[q], 0, true, vol, rate);
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
            o.put("shuffle", shuffled && order.length == qIds.length);
            o.put("repeat", repeat);
            long nowMs = System.currentTimeMillis();
            long remMs = sleepAt > nowMs ? (sleepAt - nowMs) : 0L;
            o.put("sleepActive", remMs > 0L || sleepTracks > 0);
            o.put("sleepRemainingMs", remMs);
            o.put("sleepTracks", sleepTracks);
            o.put("sleepFired", sleepFiredPending);
            o.put("sleepFiredType", sleepFiredType);
            o.put("sleepFiredTotal", sleepFiredTotal);
        } catch (Throwable ignored) {}
        return o;
    }

    private static long lastMatchSyncAt = 0;

    /** Khớp trạng thái 0.5s: đồng bộ hàng đợi/shuffle/repeat/sleep nếu WebView gửi lệch hoặc lúc WebView đang chết ở nền. */
    private static void matchStateEveryHalfSec() {
        long nowMs = System.currentTimeMillis();
        if (sleepAt > 0L && nowMs >= sleepAt) {
            triggerSleepEnded();
            return;
        }
        if (nowMs - lastMatchSyncAt < 2000L) return;
        lastMatchSyncAt = nowMs;
        MainActivity a = MainActivity.instance;
        if (a != null && webAlive()) {
            a.evalAck("window.__matchNativeSession&&window.__matchNativeSession(" + queueStateJson() + ")");
        }
    }

    private static volatile String lastSnap = "{\"loaded\":false,\"id\":\"\"}";
    private static volatile long lastSnapAt = 0;
    /** Trạng thái gần nhất (đọc được từ mọi luồng); vị trí được ngoại suy theo thời gian đã trôi nếu đang phát. */
    static String stateJson() {
        try {
            JSONObject o = new JSONObject(lastSnap);
            if (o.optBoolean("pwr") && "ready".equals(o.optString("st"))) {
                long el = SystemClock.elapsedRealtime() - lastSnapAt;
                o.put("pos", o.optLong("pos") + (long) (el * o.optDouble("rate", 1.0)));
            }
            return o.toString();
        } catch (Throwable t) { return lastSnap; }
    }

    private static long lastSvcTickAt = 0;
    private static long lastTickSentAt = 0;

    private static void emit(String ev) {
        try {
            final JSONObject o = snapshot(ev);
            final String json = o.toString();
            final long now = SystemClock.elapsedRealtime();
            lastSnap = json;
            lastSnapAt = now;
            final boolean isTick = "tick".equals(ev);
            if (isTick) matchStateEveryHalfSec();
            // MediaSession tự nội suy vị trí theo tốc độ phát -> giãn tick xuống 1.5s để không spam IPC hệ thống
            if (!isTick || now - lastSvcTickAt >= 1500) {
                lastSvcTickAt = now;
                uiH.post(() -> MediaService.onNative(o));
            }
            MainActivity a = MainActivity.instance;
            if (a != null) {
                // Nếu WebView chưa xử lý xong tick trước (< 1.5s) thì bỏ qua tick trùng để không dồn hàng đợi gây lag UI
                if (isTick && lastTickSentAt > lastAck && now - lastTickSentAt < 1500) return;
                if (isTick) lastTickSentAt = now;
                a.evalAck("window.__nativeAudioEv&&window.__nativeAudioEv(" + json + ")");
            }
        } catch (Throwable ignored) {}
    }
}
