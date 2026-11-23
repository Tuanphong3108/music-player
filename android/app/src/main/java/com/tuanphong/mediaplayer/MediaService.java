package com.tuanphong.mediaplayer;

import android.app.*;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * Phát nền + điều khiển phát qua MediaSession của hệ thống (màn hình khoá, trình phát media trong Cài đặt nhanh,
 * tai nghe/Bluetooth). Android bắt buộc dịch vụ nền có 1 thông báo nên dùng kênh IMPORTANCE_MIN (im lặng, thu gọn).
 */
public class MediaService extends Service {
    static final String ACTION_UPDATE = "update";
    static final String ACTION_ART = "art";
    static final String CH = "playback";
    static MediaService inst;
    private MediaSession session;
    private boolean playing = false;
    private PowerManager.WakeLock wake;
    private final android.os.Handler fgHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable stopFgRunnable = () -> { if (!playing) { try { stopForeground(false); } catch (Throwable ignored) {} } };

    /** Giữ CPU thức khi đang phát để tắt màn hình không làm nhạc giật/ngắt (tự nhả khi dừng, có hạn 30 phút để không rò pin). */
    private void holdWake(boolean on) {
        try {
            if (on) {
                if (wake == null) {
                    PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                    wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mediaplayer:playback");
                    wake.setReferenceCounted(false);
                }
                wake.acquire(30 * 60 * 1000L);
            } else if (wake != null && wake.isHeld()) {
                wake.release();
            }
        } catch (Throwable ignored) {}
    }
    private String title = "", artist = "";
    private long pos = 0, dur = 0;
    private float speed = 0f;
    private Bitmap art;
    /** playing | paused | buffering | ended | error | none (trang gửi sang). */
    private String state = "none";
    private long buffered = 0;
    private boolean artDirty = false;
    private long stamp = 0;   // elapsedRealtime tại thời điểm trang chụp vị trí -> vị trí hệ thống nội suy chính xác, không trễ theo độ trễ IPC

    @Override
    public void onCreate() {
        super.onCreate();
        inst = this;
        session = new MediaSession(this, "MediaPlayer");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { if (NativeAudio.active()) NativeAudio.play(); else if (!playing) cmd("toggle"); }
            @Override public void onPause() { if (NativeAudio.active()) NativeAudio.pause(); else if (playing) cmd("toggle"); }
            @Override public void onSkipToNext() { skip(true); }
            @Override public void onSkipToPrevious() { skip(false); }
            @Override public void onSeekTo(long p) { if (NativeAudio.active()) NativeAudio.seek(p); else cmd("seek:" + p); }
            @Override public void onStop() { NativeAudio.release(); clearSession(); stopSelf(); }
        });
        session.setActive(false);
    }

    /** Bài kế/trước: trang còn sống thì để trang quyết (shuffle/lặp); trang đang chết thì app tự làm bằng trình phát native. */
    private void skip(final boolean next) {
        final String c = next ? "next" : "prev";
        MainActivity m = MainActivity.instance;
        if (!NativeAudio.active() || m == null) {
            if (NativeAudio.active()) { if (next) { if (!NativeAudio.advance()) NativeAudio.seek(0); } else NativeAudio.previous(); return; }
            cmd(c); return;
        }
        m.probeWeb(() -> cmd(c), () -> {
            if (next) { if (!NativeAudio.advance()) NativeAudio.seek(0); } else NativeAudio.previous();
        });
    }

    /** Sự kiện từ trình phát native -> cập nhật phiên phát/thông báo ngay cả khi trang web không phản hồi. */
    static void onNative(org.json.JSONObject o) {
        MediaService s = inst;
        if (s == null) return;
        try { s.applyNative(o); } catch (Throwable ignored) {}
    }

    private void applyNative(org.json.JSONObject o) {
        if (!NativeAudio.active()) return;
        String st = o.optString("st");
        boolean pwr = o.optBoolean("pwr");
        String ns = o.optBoolean("err") ? "error" : "ended".equals(st) ? "ended"
                : (pwr ? ("buffering".equals(st) ? "buffering" : "playing") : "paused");
        String t = o.optString("title"), ar = o.optString("artist");
        long d = o.optLong("dur", 0);
        boolean metaChanged = (!t.isEmpty() && !t.equals(title)) || !ns.equals(state) || (d > 0 && d != dur);
        if (!t.isEmpty() && !t.equals(title)) { art = null; MediaWidgetProvider.saveArtwork(this, null); }
        if (!t.isEmpty()) { title = t; artist = ar; }
        if (d > 0) dur = d;
        state = ns;
        playing = "playing".equals(ns) || "buffering".equals(ns);
        holdWake(playing);
        pos = o.optLong("pos", 0);
        buffered = o.optLong("buf", 0);
        stamp = SystemClock.elapsedRealtime();
        speed = playing ? (float) o.optDouble("rate", 1.0) : 0f;
        if (!metaChanged && session != null && session.isActive()) publishPlaybackOnly(); else publish();
    }

    private void cmd(String c) { if (MainActivity.instance != null) MainActivity.instance.sendCmd(c); }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        try {
            return handleCommand(i);
        } catch (Throwable t) {
            return START_NOT_STICKY;   // lỗi cập nhật phiên phát không được phép làm sập cả app
        }
    }

    private int handleCommand(Intent i) {
        String a = i == null ? null : i.getAction();
        if (a != null && a.startsWith("cmd:")) {
            String c = a.substring(4);
            if (NativeAudio.active()) {
                if ("toggle".equals(c)) { NativeAudio.toggle(); return START_NOT_STICKY; }
                if ("next".equals(c)) { skip(true); return START_NOT_STICKY; }
                if ("prev".equals(c)) { skip(false); return START_NOT_STICKY; }
                if (c.startsWith("seek:")) { try { NativeAudio.seek(Long.parseLong(c.substring(5))); } catch (Throwable ignored) {} return START_NOT_STICKY; }
            }
            cmd(c);
            return START_NOT_STICKY;
        }
        if (i != null && ACTION_ART.equals(a)) {
            byte[] b = i.getByteArrayExtra("art");
            art = (b == null || b.length == 0) ? null : BitmapFactory.decodeByteArray(b, 0, b.length);
            artDirty = false;
            MediaWidgetProvider.saveArtwork(this, art);
        } else if (i != null) {
            String ns = nz(i.getStringExtra("state"));
            boolean metaChanged;
            String t = nz(i.getStringExtra("title")), ar = nz(i.getStringExtra("artist"));
            long d = i.getLongExtra("dur", 0);
            if (ns.isEmpty()) ns = i.getBooleanExtra("playing", false) ? "playing" : "paused";   // APK/bản trang cũ chỉ gửi playing
            if (NativeAudio.active() && ("none".equals(ns) || t.isEmpty())) return START_NOT_STICKY;   // trang vừa tải lại chưa biết gì: trình phát native mới là nguồn đúng
            metaChanged = !t.equals(title) || !ar.equals(artist) || d != dur || !ns.equals(state);
            state = ns;
            playing = "playing".equals(ns) || "buffering".equals(ns);
            holdWake(playing);
            title = t; artist = ar; dur = d;
            pos = i.getLongExtra("pos", 0);
            buffered = i.getLongExtra("buf", 0);
            stamp = i.getLongExtra("stamp", 0);
            speed = i.getFloatExtra("speed", playing ? 1f : 0f);
            if (!metaChanged && !artDirty && session != null && session.isActive()) { publishPlaybackOnly(); return START_NOT_STICKY; }
        }
        publish();
        return START_NOT_STICKY;
    }

    private void clearSession() {
        playing = false;
        holdWake(false);
        MediaWidgetProvider.savePlaybackState(this, false, "", "", "", 0);
        QueueWidgetProvider.clearQueue(this);
        if (session != null) {
            try {
                session.setPlaybackState(new PlaybackState.Builder()
                        .setState(PlaybackState.STATE_NONE, 0, 0f, SystemClock.elapsedRealtime())
                        .build());
                session.setMetadata(null);
                session.setActive(false);
            } catch (Exception ignored) {}
        }
        try {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (Exception ignored) {}
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(1);
        } catch (Exception ignored) {}
    }

    private static String nz(String s) { return s == null ? "" : s; }

    private PendingIntent act(String c) {
        Intent i = new Intent(this, MediaService.class).setAction("cmd:" + c);
        return PendingIntent.getService(this, c.hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }


    /** Chỉ cập nhật PlaybackState (mỗi giây): không dựng lại thông báo, vị trí + thời điểm chụp + tốc độ + bộ đệm đều chính xác. */
    private void publishPlaybackOnly() {
        if (session == null) return;
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP;
        int st;
        switch (state) {
            case "playing": st = PlaybackState.STATE_PLAYING; break;
            case "buffering": st = PlaybackState.STATE_BUFFERING; break;
            case "error": st = PlaybackState.STATE_ERROR; break;
            case "ended": st = PlaybackState.STATE_PAUSED; break;   // hết bài: giữ ở cuối bài, vẫn bấm Phát lại được từ thanh điều khiển hệ thống
            default: st = PlaybackState.STATE_PAUSED;
        }
        long p = pos;
        if (dur > 0) p = Math.max(0, Math.min(p, dur));
        float sp = (st == PlaybackState.STATE_PLAYING) ? (speed > 0f ? speed : 1f) : 0f;
        long when = stamp > 0 ? stamp : SystemClock.elapsedRealtime();
        PlaybackState.Builder pb = new PlaybackState.Builder()
                .setActions(actions)
                .setState(st, p, sp, when);
        if (buffered > 0) pb.setBufferedPosition(Math.max(p, buffered));
        if (st == PlaybackState.STATE_ERROR) pb.setErrorMessage("Không phát được tệp này");
        session.setPlaybackState(pb.build());
    }

    private void publish() {
        if (title.isEmpty() && dur <= 0 && !playing) {
            clearSession();
            return;
        }
        if (session != null && !session.isActive()) session.setActive(true);
        MediaMetadata.Builder mb = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, dur);
        if (art != null) mb.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
        session.setMetadata(mb.build());
        publishPlaybackOnly();
        MediaWidgetProvider.savePlaybackState(this, playing, title, artist, null, 0);
        MediaWidgetProvider.saveProgress(this, pos, dur);

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH, "Phát nhạc", NotificationManager.IMPORTANCE_MIN);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title.isEmpty() ? "Media Player" : title)
                .setContentText(artist)
                .setContentIntent(open)
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2))
                .addAction(android.R.drawable.ic_media_previous, "Trước", act("prev"))
                .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Dừng" : "Phát", act("toggle"))
                .addAction(android.R.drawable.ic_media_next, "Sau", act("next"));
        if (art != null) b.setLargeIcon(art);
        Notification n = b.build();
        // Android 12+ có thể từ chối startForeground khi app đang ở nền (ForegroundServiceStartNotAllowedException) -> không để làm sập app
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(1, n);
            // Không rời trạng thái foreground ngay khi tạm dừng (chuyển bài / dừng ngắn): rời rồi vào lại từ nền sẽ bị Android 12+ chặn -> sập hoặc bị đóng băng
            fgHandler.removeCallbacks(stopFgRunnable);
            if (!playing) fgHandler.postDelayed(stopFgRunnable, 15000);
        } catch (Throwable fe) {
            try { nm.notify(1, n); } catch (Throwable ignored) {}
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Người dùng vuốt lên đóng app khỏi đa nhiệm: đánh dấu thoát chủ động, dọn widget/màu sạch sẽ và KHÔNG ghi mã lỗi
        NativeAudio.release();
        clearSession();
        try {
            getSharedPreferences("crash_report", MODE_PRIVATE).edit()
                    .putBoolean("clean_exit", true)
                    .remove("code").remove("reason").remove("ts")
                    .commit();
        } catch (Throwable ignored) {}
        try { MediaWidgetProvider.resetToIdle(this); } catch (Throwable ignored) {}
        try { MediaWidgetProvider.resetWidgetColors(this); } catch (Throwable ignored) {}
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        inst = null;
        NativeAudio.release();
        clearSession();
        if (session != null) { session.release(); session = null; }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
