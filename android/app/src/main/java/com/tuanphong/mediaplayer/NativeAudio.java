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
    /** Lý do gần nhất ExoPlayer đổi playWhenReady (Player.PLAY_WHEN_READY_CHANGE_REASON_*), gửi kèm snapshot để trang biết pause là do người dùng hay do hệ thống. */
    private static volatile int lastPwrReason = 1;
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
    private static final Runnable sleepRun = () -> triggerSleepEnded("time", Math.max(1L, sleepDurationMin));
    /** Hẹn giờ ngủ do app giữ để vẫn tạm dừng đúng giờ / đúng số bài khi WebView bị đóng băng. endAtMs = 0: không hẹn theo giờ; tracks = 0: không hẹn theo bài. */
    static void setSleep(long endAtMs, int tracks) {
        ph.removeCallbacks(sleepRun);
        sleepAt = endAtMs;
        int tr = Math.max(0, tracks);
        if (tr <= 0) {
            sleepTracks = 0;
            sleepTotalTracks = 0;
        } else {
            if (sleepTracks <= 0 || tr > sleepTotalTracks) {
                sleepTotalTracks = tr;
            }
            sleepTracks = tr;
        }
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
        String type = sleepTotalTracks > 0 ? "tracks" : "time";
        long total = "tracks".equals(type) ? Math.max(1L, sleepTotalTracks) : Math.max(1L, sleepDurationMin);
        triggerSleepEnded(type, total);
    }

    static void triggerSleepEnded(String explicitType, long explicitTotal) {
        String type = "tracks".equals(explicitType) ? "tracks" : "time";
        long total = Math.max(1L, explicitTotal);
        sleepAt = 0L;
        sleepDurationMin = 0L;
        sleepTracks = 0;
        sleepTotalTracks = 0;
        ph.removeCallbacks(sleepRun);
        ph.removeCallbacks(ticker);
        sleepFiredPending = true;
        sleepFiredType = type;
        sleepFiredTotal = total;
        pauseImpl();
        final JSONObject snap = snapshot("sleep");
        emit("sleep");
        Context ctx = app != null ? app : (MainActivity.instance != null ? MainActivity.instance.getApplicationContext() : null);
        if (ctx != null && (isAppInBackground(ctx) || !webAlive())) {
            showSleepEndedNotification(ctx, type, total);
        }
        uiH.post(() -> MediaService.onNative(snap));
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

    /** Giảm số bài hẹn giờ ngủ khi hết bài. Trả về true nếu đã hết số bài và vừa kích hoạt dừng ngủ. */
    static boolean checkTrackSleepOnEnd() {
        if (sleepTracks <= 0) return false;
        long total = Math.max(1L, sleepTotalTracks > 0 ? sleepTotalTracks : sleepTracks);
        sleepTracks--;
        if (sleepTracks <= 0) {
            triggerSleepEnded("tracks", total);
            return true;
        }
        return false;
    }

    static void consumeSleepEndedNotice() {
        Context ctx = app != null ? app : (MainActivity.instance != null ? MainActivity.instance.getApplicationContext() : null);
        // Không cho WebView chạy nền tự hủy thông báo khi người dùng chưa quay lại màn hình app
        if (ctx != null && isAppInBackground(ctx)) return;
        sleepFiredPending = false;
        sleepFiredType = "";
        sleepFiredTotal = 0L;
        if (ctx != null) {
            cancelSleepEndedNotification(ctx);
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
            NotificationChannel ch = new NotificationChannel(
                    SLEEP_NOTIF_CHANNEL,
                    isEn ? "Sleep timer" : "Hẹn giờ ngủ",
                    NotificationManager.IMPORTANCE_HIGH
            );
            ch.setShowBadge(true);
            nm.createNotificationChannel(ch);
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
            Notification.Builder b = new Notification.Builder(ctx, SLEEP_NOTIF_CHANNEL);
            b.setSmallIcon(R.drawable.ic_stat_music_note)
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
    static Context appContext() { return app; }
    static boolean webAlive() { return MainActivity.instance != null && SystemClock.elapsedRealtime() - lastAck < 4000; }
    /** Native đang phát và người dùng đã rời app: mọi lệnh điều khiển từ WebView bị bỏ qua; trang chỉ hỏi lại trạng thái (nativeAudioState) khi quay lại. */
    static boolean nativeOwnsPlayback() {
        MainActivity a = MainActivity.instance;
        return active() && a != null && a.hasLeftApp();
    }
    static boolean hasNext() { return stepQ(1, true) >= 0; }

    private static int curQ() {
        for (int i = 0; i < qIds.length; i++) if (qIds[i].equals(curId)) return i;
        return -1;
    }
    /** Chỉ số (trong danh sách) của bài cách bài hiện tại `dir` bước theo thứ tự phát; -1 nếu không có. Bỏ qua bài không mở được. */
    private static int stepQ(int dir) {
        return stepQ(dir, false);
    }
    private static volatile boolean forceWrap = false;
    private static int stepQ(int dir, boolean respectRepeatOne) {
        String[] ids = qIds;
        int total = ids.length;
        int c = -1;
        String activeId = curId;
        for (int i = 0; i < total; i++) {
            if (activeId != null && activeId.equals(ids[i])) { c = i; break; }
        }
        if (c < 0 || total == 0) return -1;
        if (dir > 0 && respectRepeatOne && repeat == 2) return c;
        boolean useShuffle = shuffled && order != null && order.length == total;
        int[] ord;
        if (useShuffle) {
            ord = order;
        } else {
            ord = new int[total];
            for (int i = 0; i < total; i++) ord[i] = i;
        }
        int pos = -1;
        for (int i = 0; i < ord.length; i++) if (ord[i] == c) { pos = i; break; }
        if (pos < 0) return -1;
        int n = ord.length;
        for (int k = 1; k <= n; k++) {
            int np = pos + dir * k;
            if (np >= n || np < 0) {
                if (dir > 0 && repeat == 0 && !forceWrap) return -1;
                np = ((np % n) + n) % n;
            }
            int q = ord[np];
            if (q == c) return -1;
            if (q >= 0 && q < ids.length && !ids[q].isEmpty() && MainActivity.resolveServed(ids[q]) != null) return q;
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

    private static volatile int prefOutId = -1;
    static int preferredOutputId() { return prefOutId; }
    private static android.media.AudioDeviceInfo findOutput(Context c, int id) {
        try {
            android.media.AudioManager am = (android.media.AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            for (android.media.AudioDeviceInfo d : am.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS)) if (d.getId() == id) return d;
        } catch (Throwable ignored) {}
        return null;
    }
    /** Ép ExoPlayer xuất ra thiết bị đầu ra cụ thể (AudioTrack.setPreferredDevice); id < 0 = mặc định hệ thống. */
    static boolean setPreferredOutput(final Context c, final int id) {
        final android.media.AudioDeviceInfo info = id >= 0 ? findOutput(c, id) : null;
        if (id >= 0 && info == null) return false;
        prefOutId = id;
        if (p == null) return false;
        ph.post(() -> { try { if (p != null) p.setPreferredAudioDevice(info); } catch (Throwable ignored) {} });
        return true;
    }
    private static volatile long fbDurMs = 0;
    private static volatile String fbDurId = "";
    private static volatile String cueRebuildId = "";
    private static final java.util.Map<String, Uri> seekableCache = new java.util.concurrent.ConcurrentHashMap<>();
    private static boolean id0Eq(String id) { return id != null && id.equals(curId); }

    /** Tự động dựng lại bảng chỉ mục Cues trong cache cho tệp WebM/MKV bị ExoPlayer báo seekable=false để tua mượt + giữ nguyên EQ. */
    private static void tryRebuildWebmCues(final String trackId) {
        if (trackId == null || trackId.isEmpty() || trackId.equals(cueRebuildId)) return;
        final Context c = app;
        final Uri srcUri = uriFor(trackId);
        if (c == null || srcUri == null) return;
        cueRebuildId = trackId;
        new Thread(() -> {
            Uri fixed = WebmCueIndexer.ensureSeekable(c, srcUri);
            if (fixed == null) return;
            seekableCache.put(trackId, fixed);
            ph.post(() -> {
                if (p == null || !loaded || !trackId.equals(curId)) return;
                if (p.isCurrentMediaItemSeekable()) return;
                long resumePos = Math.max(0L, p.getCurrentPosition());
                boolean wasPlaying = p.getPlayWhenReady();
                p.setMediaItem(MediaItem.fromUri(fixed), resumePos);
                p.prepare();
                p.setPlayWhenReady(wasPlaying);
                emit("state");
            });
        }, "webm-cues").start();
    }
    /** Đọc thời lượng dự phòng ở luồng riêng: với một số MP3 dài không có bảng TOC thì ExoPlayer trả TIME_UNSET nên giao diện hiện 0:00. */
    private static void fetchFallbackDuration(final String id, final Uri u) {
        fbDurMs = 0; fbDurId = id;
        final Context c = app;
        if (c == null || u == null) return;
        new Thread(() -> {
            android.media.MediaMetadataRetriever r = new android.media.MediaMetadataRetriever();
            try {
                r.setDataSource(c, u);
                String v = r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION);
                long d = v == null ? 0 : Long.parseLong(v.trim());
                if (d > 0 && id.equals(fbDurId)) { fbDurMs = d; ph.post(() -> { if (id.equals(curId)) emit("state"); }); }
            } catch (Throwable ignored) {
            } finally { try { r.release(); } catch (Throwable ignored) {} }
        }, "dur-fallback").start();
    }

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
        // MP3/AAC không có bảng TOC (VBR không Xing hoặc header Xing lỗi) mặc định là "không tua được": bật CBR seeking + đánh chỉ mục khung MP3.
        androidx.media3.extractor.DefaultExtractorsFactory ef = new androidx.media3.extractor.DefaultExtractorsFactory()
                .setConstantBitrateSeekingEnabled(true)
                .setConstantBitrateSeekingAlwaysEnabled(true)
                .setMp3ExtractorFlags(androidx.media3.extractor.mp3.Mp3Extractor.FLAG_ENABLE_INDEX_SEEKING);
        p = new ExoPlayer.Builder(app, rf)
                .setMediaSourceFactory(new androidx.media3.exoplayer.source.DefaultMediaSourceFactory(app, ef))
                .setLooper(pt.getLooper()).setLoadControl(lc).build();
        sid = p.getAudioSessionId();
        if (prefOutId >= 0) { android.media.AudioDeviceInfo pd = findOutput(app, prefOutId); if (pd != null) p.setPreferredAudioDevice(pd); else prefOutId = -1; }
        p.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        p.setHandleAudioBecomingNoisy(true);
        p.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int st) {
                if (st == Player.STATE_READY) {
                    errStreak = 0;
                    if (p != null && !p.isCurrentMediaItemSeekable()) {
                        tryRebuildWebmCues(curId);
                    }
                }
                if (st == Player.STATE_ENDED) { onEnded(); return; }
                emit("state");
            }
            @Override public void onPlayWhenReadyChanged(boolean pwr, int reason) {
                lastPwrReason = reason;
                android.util.Log.d("MPPause", "pwr=" + pwr + " reason=" + reason + " st=" + (p != null ? p.getPlaybackState() : -1) + " id=" + curId);
                ph.removeCallbacks(ticker);
                // Sau khi hết bài & dừng theo hẹn giờ ngủ, không bắn lại state/tick với STATE_ENDED kẻo WebView tưởng hết bài thường rồi tự nhảy bài kế
                if (!pwr && endedHandled && p != null && p.getPlaybackState() == Player.STATE_ENDED) {
                    return;
                }
                if (loaded) ph.postDelayed(ticker, 500);
                emit("state");
            }
            @Override public void onPositionDiscontinuity(Player.PositionInfo o, Player.PositionInfo n, int reason) {
                android.util.Log.d("MPSeek", "discontinuity reason=" + reason + " old=" + o.positionMs + " new=" + n.positionMs);
                if (reason == Player.DISCONTINUITY_REASON_SEEK) emit("seeked");
            }
            @Override public void onPlayerError(PlaybackException e) {
                if (skipBadTrack()) return;
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
        Uri u = seekableCache.get(id);
        if (u == null) u = uriFor(id);
        curId = id; cueRebuildId = ""; title = t == null ? "" : t; artist = a == null ? "" : a;
        endedHandled = false;
        if (u == null) { loaded = true; if (skipBadTrack()) return; emit("error"); return; }
        loaded = true;
        // Ở nền thì âm lượng native luôn 100% (trang cũng ép 1.0 khi ẩn): tránh kẹt ở 0/thấp do bước tắt tiếng tạm lúc khôi phục khiến bài mới im lặng tới khi vào app
        vol = (play && isAppInBackground(app)) ? 1f : volume; rate = speed <= 0 ? 1f : speed;
        p.setVolume(vol);
        p.setPlaybackParameters(new PlaybackParameters(rate));
        p.setMediaItem(MediaItem.fromUri(u), Math.max(0, startMs));
        p.setPlayWhenReady(play);
        p.prepare();
        fetchFallbackDuration(id, u);
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
    static void seek(final long ms) {
        ph.post(() -> {
            if (p == null || !loaded) return;
            endedHandled = false;
            long t = Math.max(0, ms);
            long d = p.getDuration();
            // Không để một lệnh tua (vd. từ thông báo) vượt/chạm cuối bài: sẽ bị coi là hết bài rồi lặp/nhảy lại từ đầu
            if (d != C.TIME_UNSET && d > 2000 && t > d - 800) t = d - 800;
            Uri curU = uriFor(curId);
            String sch = curU == null ? "null" : String.valueOf(curU.getScheme());
            boolean seekable = p.isCurrentMediaItemSeekable();
            android.util.Log.d("MPSeek", "seek req=" + ms + " clamped=" + t + " dur=" + d + " cur=" + p.getCurrentPosition() + " st=" + p.getPlaybackState() + " seekable=" + seekable + " scheme=" + sch + " bg=" + isAppInBackground(app));
            // Nếu tệp thật sự không có bảng tua (vd. WebM/MKV thiếu Cues), không đẩy seekTo(>0) xuống ExoPlayer để tránh bị kéo tụt về 0:00
            if (!seekable && t > 0) {
                emit("state");
                return;
            }
            p.seekTo(t);
        });
    }
    static void setVolume(final float v) { ph.post(() -> { vol = (v < 1f && isAppInBackground(app)) ? 1f : v; if (p != null) p.setVolume(vol); }); }
    static void setRate(final float r) { ph.post(() -> { rate = r <= 0 ? 1f : r; if (p != null) p.setPlaybackParameters(new PlaybackParameters(rate)); }); }

    /** Dừng hẳn (trang chuyển sang phát bằng thẻ audio thường, hoặc app thoát). */
    static void stop() { ph.post(NativeAudio::stopImpl); }
    private static void stopImpl() {
        if (loaded && curId != null && !curId.isEmpty()) {
            persistSessionBackup(SystemClock.elapsedRealtime(), true, true);
        }
        loaded = false; curId = "";
        ph.removeCallbacks(ticker);
        if (p != null) { try { p.stop(); p.clearMediaItems(); } catch (Throwable ignored) {} }
        emit("stop");
    }
    static void release() {
        if (loaded && curId != null && !curId.isEmpty()) {
            saveBackupSync(app);
        }
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
            int[] ord = new int[n];
            boolean sh = o.optBoolean("shuffle", false) && od != null && od.length() == n;
            for (int i = 0; i < n; i++) {
                ord[i] = sh ? od.optInt(i, i) : i;
            }
            shuffled = sh;
            order = ord;
            qIds = a1; qTitles = a2; qArtists = a3; qLocs = a4; repeat = o.optInt("repeat", 0);
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
    static void setShuffleEnabled(boolean enabled) {
        int total = qIds.length;
        int[] seq = new int[total];
        for (int i = 0; i < total; i++) seq[i] = i;
        if (!enabled) {
            order = seq;
            shuffled = false;
        } else {
            if (order == null || order.length != total) order = seq;
            shuffled = true;
        }
    }
    static boolean isShuffleEnabled() { return shuffled; }

    /** Hết bài: kiểm tra hẹn giờ theo số bài trước; nếu trang chết thì app tự sang bài kế đã được báo trước. */
    private static void onEnded() {
        android.util.Log.d("MPSeek", "onEnded handled=" + endedHandled + " repeat=" + repeat + " bg=" + isAppInBackground(app));
        if (endedHandled) return;
        endedHandled = true;
        if (sleepTracks > 0 && checkTrackSleepOnEnd()) {
            return;
        }
        // Người dùng không ở trong app (nền / tắt màn hình / trang chết): native tự chuyển bài, không chờ WebView (có thể đang bị đóng băng).
        if (!webAlive() || isAppInBackground(app)) {
            if (repeat == 2 && p != null) {   // lặp 1 bài
                p.seekTo(0); endedHandled = false; p.setPlayWhenReady(true);
                return;
            }
            if (advance()) return;
        }
        emit("ended");
    }

    private static int errStreak = 0;
    /** Bài không đọc được: nếu người dùng không ở trong app thì tự sang bài kế (tối đa hết một vòng hàng đợi để khỏi lặp vô hạn). */
    private static boolean skipBadTrack() {
        if (webAlive() && !isAppInBackground(app)) return false;
        if (errStreak >= Math.max(1, qIds.length)) return false;
        errStreak++;
        return advance();
    }

    /** Sang bài kế (dùng khi trang đang chết / điều khiển từ thông báo). Bấm Next luôn sang bài kế ngay cả khi lặp 1 bài. */

    /** Đường dẫn tệp của bài theo hàng đợi native (vẫn dùng được khi thư viện chưa quét lại sau lúc khởi động). */
    static String locForId(String id) {
        if (id == null || id.isEmpty()) return null;
        String[] ids = qIds, locs = qLocs;
        for (int i = 0; i < ids.length && i < locs.length; i++) {
            if (id.equals(ids[i]) && locs[i] != null && !locs[i].isEmpty()) return locs[i];
        }
        return null;
    }

    /** Native chưa nạp bài (vd. vừa mở lại, trang chưa sẵn sàng): tự nạp bài đã lưu và phát, không cần nhờ WebView. Trả về false nếu chưa xác định được bài. */
    static boolean resumeFromSaved(Context c) { return resumeFromSaved(c, -1, true); }
    /** posMs >= 0: bắt đầu từ vị trí đó (ví dụ người dùng kéo thanh tua trên thông báo khi native chưa nạp bài); play=false thì nạp ở trạng thái Pause. */
    static boolean resumeFromSaved(Context c, long posMs, boolean play) {
        try {
            String raw = persistedSessionJson(c);
            if (raw == null || raw.isEmpty()) return false;
            JSONObject o = new JSONObject(raw);
            String id = o.optString("id", "");
            String loc = o.optString("curLoc", "");
            if (MainActivity.resolveServed(id) == null || (!loc.isEmpty() && !loc.equalsIgnoreCase(String.valueOf(MainActivity.resolveLocation(id))) && MainActivity.resolveLocation(id) != null)) {
                String byLoc = loc.isEmpty() ? null : MainActivity.idForLocation(loc);
                if (byLoc == null) return false;
                id = byLoc;
            }
            if (MainActivity.resolveServed(id) == null) return false;
            load(c, id, o.optString("title", ""), o.optString("artist", ""), posMs >= 0 ? posMs : o.optLong("pos", 0), play, vol <= 0 ? 1f : vol, rate <= 0 ? 1f : rate);
            return true;
        } catch (Throwable t) { return false; }
    }

    /** Người dùng bấm Next (MediaSession/thông báo/widget): luôn sang bài kế, kể cả Repeat One hoặc đang ở bài cuối (quay vòng như nút Next trong app). */
    static boolean advanceManual() {
        forceWrap = true;
        final int q;
        try { q = stepQ(1, false); } finally { forceWrap = false; }
        if (q < 0) return false;
        ph.post(() -> go(q));
        return true;
    }

    static boolean advance() {
        final int q = stepQ(1, false);
        if (q < 0) return false;
        ph.post(() -> go(q));
        return true;
    }
    /** Bài trước: khi bật Shuffle và đã phát quá 5s thì về 0:00, từ 0-5s hoặc khi tắt Shuffle thì lùi về bài trước. */
    static boolean previous() {
        ph.post(() -> {
            if (p != null && loaded && shuffled && p.getCurrentPosition() > 5000) { p.seekTo(0); endedHandled = false; return; }
            if (!go(stepQ(-1, false)) && p != null && loaded) { p.seekTo(0); endedHandled = false; }
        });
        return true;
    }
    private static boolean go(int q) {
        if (p == null || q < 0 || q >= qIds.length) return false;
        // Đang ở nền: nếu âm lượng còn kẹt ở 0 (do bước tắt tiếng tạm lúc khôi phục mà trang chưa kịp trả về) thì trả về 100% để bài kế không bị mất tiếng
        if (vol < 0.01f && isAppInBackground(app)) vol = 1f;
        loadImpl(app, qIds[q], qTitles[q], qArtists[q], 0, true, vol, rate);
        emit("advanced");
        return true;
    }

    /** Yêu cầu đẩy snapshot mới nhất từ đúng luồng ExoPlayer sang MediaService (tránh đọc Player từ Main Thread). */
    static void syncToMediaService() {
        ph.post(() -> {
            if (!active()) return;
            final JSONObject snap = snapshot("sync");
            uiH.post(() -> MediaService.onNative(snap));
        });
    }

    static JSONObject snapshot(String ev) {
        // ExoPlayer chỉ được truy cập trên luồng pt: nếu gọi từ luồng khác (Main Thread), lấy từ stateJson() (thread-safe, đã ngoại suy vị trí) để không bị IllegalStateException trả về pos=0/dur=0.
        if (Looper.myLooper() != pt.getLooper()) {
            try {
                JSONObject cached = new JSONObject(stateJson());
                cached.put("ev", ev);
                return cached;
            } catch (Throwable ignored) {}
        }
        JSONObject o = new JSONObject();
        try {
            o.put("ev", ev);
            o.put("id", curId);
            String curLoc = MainActivity.resolveLocation(curId);
            if (curLoc == null || curLoc.isEmpty()) curLoc = locForId(curId);
            o.put("curLoc", curLoc == null ? "" : curLoc);
            o.put("title", title);
            o.put("artist", artist);
            o.put("loaded", loaded);
            if (p != null && loaded) {
                int st = p.getPlaybackState();
                o.put("st", st == Player.STATE_ENDED ? "ended" : st == Player.STATE_BUFFERING ? "buffering" : st == Player.STATE_READY ? "ready" : "idle");
                o.put("pwr", p.getPlayWhenReady());
                o.put("pwrReason", lastPwrReason);
                o.put("pos", Math.max(0, p.getCurrentPosition()));
                long d = p.getDuration();
                if ((d == C.TIME_UNSET || d <= 0) && fbDurMs > 0 && id0Eq(fbDurId)) d = fbDurMs;   // ExoPlayer chưa/không đọc được thời lượng (MP3 dài/VBR không TOC): dùng thời lượng đọc từ MediaMetadataRetriever
                o.put("dur", d == C.TIME_UNSET ? 0 : d);
                o.put("buf", Math.max(0, p.getBufferedPosition()));
                o.put("rate", rate);
                o.put("err", p.getPlayerError() != null);
                o.put("seekable", p.isCurrentMediaItemSeekable());
            } else {
                o.put("st", "idle"); o.put("pwr", false); o.put("pos", 0); o.put("dur", 0); o.put("buf", 0); o.put("rate", rate); o.put("err", false); o.put("seekable", true);
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
    private static long lastBgPersistAt = 0L;
    private static final String PREFS_NATIVE_SESSION = "native_session_backup";

    /** Ghi trạng thái hàng đợi, shuffle/repeat, hẹn giờ ngủ và vị trí bài hiện tại xuống SharedPreferences để khôi phục nếu WebView chết hoặc app sập. */
    private static void persistSessionBackup(long nowElapsed, boolean force) {
        persistSessionBackup(nowElapsed, force, false);
    }

    private static void persistSessionBackup(long nowElapsed, boolean force, boolean syncCommit) {
        try {
            Context c = app;
            if (c == null) {
                MainActivity ma = MainActivity.instance;
                if (ma != null) c = ma.getApplicationContext();
            }
            if (c == null) return;
            if (!force && nowElapsed - lastBgPersistAt < 1000L) return;

            final boolean hasCurTrack = loaded && curId != null && !curId.isEmpty();
            final boolean hasQueue = qIds != null && qIds.length > 0;
            // Tuyệt đối KHÔNG ghi đè bản lưu khi ExoPlayer đã bị dừng/trống (vd. lúc stopImpl/release/đóng app)
            if (!hasCurTrack && !hasQueue) return;
            lastBgPersistAt = nowElapsed;

            android.content.SharedPreferences.Editor ed = c.getSharedPreferences(PREFS_NATIVE_SESSION, Context.MODE_PRIVATE).edit();

            if (hasCurTrack) {
                long posNow = 0L;
                long durNow = 0L;
                boolean pwrNow = false;
                String stNow = "idle";
                if (p != null && loaded) {
                    try {
                        int st = p.getPlaybackState();
                        stNow = st == Player.STATE_ENDED ? "ended" : st == Player.STATE_BUFFERING ? "buffering" : st == Player.STATE_READY ? "ready" : "idle";
                        pwrNow = p.getPlayWhenReady();
                        posNow = Math.max(0L, p.getCurrentPosition());
                        long d = p.getDuration();
                        durNow = d == C.TIME_UNSET ? 0L : Math.max(0L, d);
                    } catch (Throwable ignored) {
                        // Nếu gọi từ luồng UI (onStop/onDestroy/exitAppCompletely) -> dùng vị trí mới nhất trong lastSnap
                        try {
                            JSONObject ls = new JSONObject(lastSnap);
                            stNow = ls.optString("st", "idle");
                            pwrNow = ls.optBoolean("pwr", false);
                            posNow = Math.max(0L, ls.optLong("pos", 0L));
                            durNow = Math.max(0L, ls.optLong("dur", 0L));
                        } catch (Throwable ignored2) {}
                    }
                }

                JSONObject snap = new JSONObject();
                snap.put("id", curId);
                String curLocNow = MainActivity.resolveLocation(curId);
                if (curLocNow == null || curLocNow.isEmpty()) {
                    curLocNow = locForId(curId);
                }
                if (curLocNow == null) curLocNow = "";
                snap.put("curLoc", curLocNow);
                snap.put("curPath", curLocNow);
                snap.put("title", title == null ? "" : title);
                snap.put("artist", artist == null ? "" : artist);
                snap.put("loaded", true);
                snap.put("st", stNow);
                snap.put("pwr", pwrNow);
                snap.put("pos", posNow);
                snap.put("dur", durNow);
                snap.put("rate", rate);
                boolean isShuf = shuffled && order != null && order.length == qIds.length;
                snap.put("shuffle", isShuf);
                snap.put("repeat", repeat);
                snap.put("savedAtElapsed", nowElapsed);
                snap.put("savedAtWall", System.currentTimeMillis());

                if (isShuf) {
                    org.json.JSONArray jOrd = new org.json.JSONArray();
                    int curShufflePos = -1;
                    for (int i = 0; i < order.length; i++) {
                        int qIdx = order[i];
                        jOrd.put(qIdx);
                        String tid = (qIdx >= 0 && qIdx < qIds.length && qIds[qIdx] != null) ? qIds[qIdx] : "";
                        if (curId.equals(tid)) curShufflePos = i;
                    }
                    snap.put("shuffleOrder", jOrd);
                    snap.put("shufflePos", curShufflePos);
                }
                ed.putString("session_json", snap.toString());
            }

            if (hasQueue) {
                boolean isShuf = shuffled && order != null && order.length == qIds.length;
                String qJsonStr = queueStateJson();
                JSONObject qObj = new JSONObject(qJsonStr);
                if (isShuf) {
                    org.json.JSONArray jOrd = new org.json.JSONArray();
                    org.json.JSONArray jShufIds = new org.json.JSONArray();
                    org.json.JSONArray jShufTitles = new org.json.JSONArray();
                    org.json.JSONArray jShufArtists = new org.json.JSONArray();
                    org.json.JSONArray jShufLocs = new org.json.JSONArray();
                    int curShufflePos = -1;
                    for (int i = 0; i < order.length; i++) {
                        int qIdx = order[i];
                        jOrd.put(qIdx);
                        String tid = (qIdx >= 0 && qIdx < qIds.length && qIds[qIdx] != null) ? qIds[qIdx] : "";
                        String tt = (qIdx >= 0 && qIdx < qTitles.length && qTitles[qIdx] != null) ? qTitles[qIdx] : "";
                        String ta = (qIdx >= 0 && qIdx < qArtists.length && qArtists[qIdx] != null) ? qArtists[qIdx] : "";
                        String tl = (qIdx >= 0 && qIdx < qLocs.length && qLocs[qIdx] != null) ? qLocs[qIdx] : "";
                        if (curId != null && !curId.isEmpty() && curId.equals(tid)) curShufflePos = i;
                        jShufIds.put(tid);
                        jShufTitles.put(tt);
                        jShufArtists.put(ta);
                        jShufLocs.put(tl);
                    }
                    qObj.put("shuffle", true);
                    qObj.put("order", jOrd);
                    qObj.put("shuffleOrder", jOrd);
                    qObj.put("shufflePos", curShufflePos);
                    qObj.put("shuffleIds", jShufIds);
                    qObj.put("shuffleTitles", jShufTitles);
                    qObj.put("shuffleArtists", jShufArtists);
                    qObj.put("shuffleLocations", jShufLocs);
                    qJsonStr = qObj.toString();
                }
                ed.putString("queue_json", qJsonStr);
            }

            ed.putLong("updated_at", System.currentTimeMillis());
            if (syncCommit) ed.commit();
            else ed.apply();
        } catch (Throwable ignored) {}
    }

    static boolean isCurrentlyPlaying() {
        try {
            if (p != null && loaded && p.getPlayWhenReady() && p.getPlaybackState() != Player.STATE_ENDED && p.getPlaybackState() != Player.STATE_IDLE) {
                return true;
            }
        } catch (Throwable ignored) {}
        try {
            JSONObject ls = new JSONObject(lastSnap);
            return ls.optBoolean("pwr", false);
        } catch (Throwable ignored) {}
        return false;
    }

    /** Khớp trạng thái 0.5s: lưu snapshot phục hồi + đồng bộ hàng đợi/shuffle/repeat/sleep nếu WebView gửi lệch hoặc lúc WebView đang chết ở nền. */
    private static void matchStateEveryHalfSec() {
        long nowElapsed = SystemClock.elapsedRealtime();
        persistSessionBackup(nowElapsed, false);
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
    static String persistedSessionJson(Context ctx) {
        try {
            Context c = ctx != null ? ctx : app;
            if (c == null) return "";
            String raw = c.getSharedPreferences(PREFS_NATIVE_SESSION, Context.MODE_PRIVATE).getString("session_json", "");
            if (raw == null || raw.isEmpty()) return "";
            JSONObject o = new JSONObject(raw);
            o.put("fromBackup", true);
            o.put("pwr", false); // Khôi phục từ bản lưu (sau crash/đóng app) luôn đặt trạng thái Pause
            return o.toString();
        } catch (Throwable ignored) {
            return "";
        }
    }

    static String persistedQueueJson(Context ctx) {
        try {
            Context c = ctx != null ? ctx : app;
            if (c == null) return "";
            String raw = c.getSharedPreferences(PREFS_NATIVE_SESSION, Context.MODE_PRIVATE).getString("queue_json", "");
            if (raw == null || raw.isEmpty()) return "";
            JSONObject o = new JSONObject(raw);
            o.put("fromBackup", true);
            return o.toString();
        } catch (Throwable ignored) {
            return "";
        }
    }

    static void saveBackupNow(Context ctx) {
        if (ctx != null && app == null) app = ctx.getApplicationContext();
        persistSessionBackup(SystemClock.elapsedRealtime(), true, false);
    }

    static void saveBackupSync(Context ctx) {
        if (ctx != null && app == null) app = ctx.getApplicationContext();
        persistSessionBackup(SystemClock.elapsedRealtime(), true, true);
    }

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
            else if (!"stop".equals(ev)) persistSessionBackup(now, true, false);
            if (isTick && (app == null || isAppInBackground(app))) {
                persistSessionBackup(now, false);
            }
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
