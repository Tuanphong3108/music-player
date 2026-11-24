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
    static final String ACTION_NATIVE_SYNC = "native_sync";
    static final String CH = "playback";
    static MediaService inst;
    private static volatile org.json.JSONObject pendingNative;
    private MediaSession session;
    private boolean playing = false;
    private PowerManager.WakeLock wake;
    private final android.os.Handler fgHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable stopFgRunnable = () -> {
        if (!playing) {
            try {
                if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_DETACH);
                else stopForeground(false);
            } catch (Throwable ignored) {}
        }
    };

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
            @Override public void onPlay() { if (NativeAudio.active()) NativeAudio.play(); else if (!NativeAudio.resumeFromSaved(MediaService.this) && !playing) cmd("toggle"); }
            @Override public void onPause() { if (NativeAudio.active()) NativeAudio.pause(); else if (playing) cmd("toggle"); }
            @Override public void onSkipToNext() { skip(true); }
            @Override public void onSkipToPrevious() { skip(false); }
            @Override public void onSeekTo(long p) { if (NativeAudio.active()) NativeAudio.seek(p); else cmd("seek:" + p); }
            @Override public void onStop() { NativeAudio.release(); clearSession(); stopSelf(); }
        });
        session.setActive(false);
    }

    /** Bài kế/trước: nếu trang đang mở trên màn hình thì để trang quyết; nếu ở nền/tắt màn hình thì app tự chuyển bài bằng trình phát native để không bị loạn/chồng lệnh. */
    private void skip(final boolean next) {
        // Hàng đợi/shuffle/repeat do native giữ: luôn để native chuyển bài, trang chỉ nhận lại qua sự kiện "advanced"
        if (NativeAudio.active()) {
            if (next) { if (!NativeAudio.advance()) NativeAudio.seek(0); } else NativeAudio.previous();
            return;
        }
        cmd(next ? "next" : "prev");
    }

    /** Sự kiện từ trình phát native -> cập nhật phiên phát/thông báo ngay cả khi trang web không phản hồi; tự khởi chạy MediaService nếu chưa chạy. */
    static void onNative(org.json.JSONObject o) {
        if (o == null) return;
        MediaService s = inst;
        if (s == null) {
            if (!NativeAudio.active()) return;
            pendingNative = o;
            try {
                android.content.Context ctx = MainActivity.instance != null
                        ? MainActivity.instance.getApplicationContext()
                        : NativeAudio.appContext();
                if (ctx != null) {
                    Intent si = new Intent(ctx, MediaService.class).setAction(ACTION_NATIVE_SYNC);
                    if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(si);
                    else ctx.startService(si);
                }
            } catch (Throwable ignored) {}
            return;
        }
        try { s.applyNative(o); } catch (Throwable ignored) {}
    }

    private static final long TRANSITION_GRACE_MS = 4000;
    private long lastPlayingAt = 0;
    private final Runnable graceRecheck = () -> {
        try { if (NativeAudio.active()) applyNative(NativeAudio.snapshot("sync")); } catch (Throwable ignored) {}
    };

    private void applyNative(org.json.JSONObject o) {
        if (!NativeAudio.active()) return;
        String st = o.optString("st");
        boolean pwr = o.optBoolean("pwr");
        String ns = o.optBoolean("err") ? "error" : "ended".equals(st) ? "ended"
                : (pwr ? ("buffering".equals(st) ? "buffering" : "playing") : "paused");
        String t = o.optString("title"), ar = o.optString("artist"), incomingId = o.optString("id");
        long d = o.optLong("dur", 0);
        boolean trackChanged = (!incomingId.isEmpty() && !incomingId.equals(curTrackId)) || (!t.isEmpty() && !t.equals(title));
        // Chuyển bài: khoảnh khắc hết bài / nạp bài kế có thể báo "paused/ended" ngắn -> giữ trạng thái đang phát (foreground + wakelock) tối đa ~4s
        // để Android không coi service là nhàn rỗi và kill trong lúc chuyển. Người dùng chủ động tạm dừng (không đổi bài, không hết bài) thì không bị ảnh hưởng.
        long nowRt = SystemClock.elapsedRealtime();
        if ("playing".equals(ns) || "buffering".equals(ns)) lastPlayingAt = nowRt;
        else if (!o.optBoolean("err") && ("ended".equals(st) || trackChanged) && nowRt - lastPlayingAt < TRANSITION_GRACE_MS) {
            ns = "buffering";
            fgHandler.removeCallbacks(graceRecheck);
            fgHandler.postDelayed(graceRecheck, TRANSITION_GRACE_MS + 250);
        }
        boolean metaChanged = trackChanged || !ns.equals(state) || (d > 0 && d != dur);
        if (trackChanged) {
            curTrackId = incomingId;
            artRetries = 0;
            art = null;
            artDirty = true;
            loadNativeArtworkForId(incomingId, t);
        } else if (!incomingId.isEmpty() && art == null && !incomingId.equals(loadingArtForId)) {
            loadNativeArtworkForId(incomingId, t);
        }
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

    private volatile String curTrackId = "";
    private volatile String loadingArtForId = "";
    private final android.util.LruCache<String, Bitmap> artMemCache = new android.util.LruCache<>(12);

    /** Trích xuất trực tiếp ảnh bìa nhúng từ tệp gốc trên luồng nền Android khi đổi bài, không phụ thuộc WebView gửi lên. */
    private void loadNativeArtworkForId(final String nativeId, final String expectedTitle) {
        if (nativeId == null || nativeId.isEmpty()) return;
        loadingArtForId = nativeId;
        Bitmap cached = artMemCache.get(nativeId);
        if (cached != null && !cached.isRecycled()) {
            art = cached;
            artDirty = false;
            publish();
            return;
        }
        new Thread(() -> {
            android.media.MediaMetadataRetriever mmr = null;
            try {
                mmr = new android.media.MediaMetadataRetriever();
                String directPath = MainActivity.resolveLocation(nativeId);
                if (directPath == null) directPath = NativeAudio.locForId(nativeId);   // thư viện chưa quét lại: lấy đường dẫn từ hàng đợi native đã lưu
                android.net.Uri src = MainActivity.resolveServed(nativeId);
                if (directPath != null && new java.io.File(directPath).canRead()) {
                    mmr.setDataSource(directPath);
                } else if (src != null) {
                    mmr.setDataSource(this, src);
                } else {
                    scheduleArtRetry(nativeId, expectedTitle);
                    return;
                }
                byte[] pic = mmr.getEmbeddedPicture();
                if ((pic == null || pic.length == 0) && directPath != null) pic = folderCoverBytes(directPath);   // không có ảnh nhúng: thử cover.jpg/folder.jpg cùng thư mục
                if (pic == null || pic.length == 0) return;
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(pic, 0, pic.length, bounds);
                int sample = 1;
                int maxDim = Math.max(bounds.outWidth, bounds.outHeight);
                while (maxDim / (sample * 2) >= 320) sample *= 2;
                BitmapFactory.Options opts = new BitmapFactory.Options();
                opts.inSampleSize = sample;
                Bitmap decoded = BitmapFactory.decodeByteArray(pic, 0, pic.length, opts);
                if (decoded == null) return;
                int bw = decoded.getWidth(), bh = decoded.getHeight();
                int side = Math.min(bw, bh);
                Bitmap cropped = (bw != bh && side > 0)
                        ? Bitmap.createBitmap(decoded, (bw - side) / 2, (bh - side) / 2, side, side)
                        : decoded;
                Bitmap scaled = (cropped.getWidth() > 320 || cropped.getHeight() > 320)
                        ? Bitmap.createScaledBitmap(cropped, 320, 320, true)
                        : cropped;
                if (scaled != cropped) cropped.recycle();
                if (cropped != decoded) decoded.recycle();
                artMemCache.put(nativeId, scaled);
                final Bitmap finalBmp = scaled;
                fgHandler.post(() -> {
                    if (!nativeId.equals(curTrackId) && (expectedTitle == null || !expectedTitle.equals(title))) {
                        return;
                    }
                    art = finalBmp;
                    artDirty = false;
                    publish();
                });
            } catch (Throwable ignored) {
            } finally {
                if (mmr != null) { try { mmr.release(); } catch (Throwable ignored) {} }
            }
        }, "media-service-art").start();
    }

    private int artRetries = 0;
    private void scheduleArtRetry(final String nativeId, final String expectedTitle) {
        fgHandler.post(() -> {
            if (artRetries >= 8 || !nativeId.equals(curTrackId) || art != null) return;
            artRetries++;
            fgHandler.postDelayed(() -> {
                if (nativeId.equals(curTrackId) && art == null) loadNativeArtworkForId(nativeId, expectedTitle);
            }, 2500);
        });
    }

    private static byte[] folderCoverBytes(String path) {
        try {
            java.io.File dir = new java.io.File(path).getParentFile();
            if (dir == null) return null;
            String[] names = { "cover.jpg", "cover.png", "folder.jpg", "folder.png", "albumart.jpg", "AlbumArt.jpg", "front.jpg", "Cover.jpg", "Folder.jpg" };
            for (String n : names) {
                java.io.File f = new java.io.File(dir, n);
                if (f.isFile() && f.canRead() && f.length() < 8L * 1024 * 1024) {
                    java.io.FileInputStream in = new java.io.FileInputStream(f);
                    try { java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(); byte[] buf = new byte[16384]; int r; while ((r = in.read(buf)) > 0) bo.write(buf, 0, r); return bo.toByteArray(); }
                    finally { try { in.close(); } catch (Throwable ignored) {} }
                }
            }
        } catch (Throwable ignored) {}
        return null;
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
        if (i != null && ACTION_NATIVE_SYNC.equals(a)) {
            org.json.JSONObject snap = pendingNative != null ? pendingNative : (NativeAudio.active() ? NativeAudio.snapshot("sync") : null);
            pendingNative = null;
            if (snap != null && NativeAudio.active()) {
                applyNative(snap);
            } else {
                clearSession();
            }
            return START_NOT_STICKY;
        }
        if (i != null && ACTION_ART.equals(a)) {
            // Album art cho MediaSession/Notification do native tự đọc trực tiếp từ tệp nhạc
            return START_NOT_STICKY;
        } else if (i != null) {
            // Khi trình phát native (ExoPlayer) đang hoạt động thì dùng trực tiếp snapshot từ NativeAudio (vẫn đảm bảo startForeground) -> không để WebView ghi đè --:-- / 0:00
            if (NativeAudio.active()) {
                applyNative(NativeAudio.snapshot("sync"));
                return START_NOT_STICKY;
            }
            String ns = nz(i.getStringExtra("state"));
            boolean metaChanged;
            String t = nz(i.getStringExtra("title")), ar = nz(i.getStringExtra("artist"));
            long d = i.getLongExtra("dur", 0);
            if (ns.isEmpty()) ns = i.getBooleanExtra("playing", false) ? "playing" : "paused";   // APK/bản trang cũ chỉ gửi playing
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


    /** Đọc trực tiếp vị trí và thời lượng từ MediaSession (tự nội suy theo tốc độ phát khi đang phát) để Widget không phụ thuộc WebView. */
    static long[] readSessionProgress() {
        MediaService s = inst;
        if (s == null || s.session == null) return null;
        try {
            android.media.session.MediaController ctrl = s.session.getController();
            if (ctrl == null) return null;
            PlaybackState ps = ctrl.getPlaybackState();
            MediaMetadata md = ctrl.getMetadata();
            if (ps == null && md == null) return null;
            long durMs = md != null ? Math.max(0L, md.getLong(MediaMetadata.METADATA_KEY_DURATION)) : 0L;
            long posMs = 0L;
            if (ps != null) {
                posMs = Math.max(0L, ps.getPosition());
                if (ps.getState() == PlaybackState.STATE_PLAYING) {
                    long elapsed = Math.max(0L, SystemClock.elapsedRealtime() - ps.getLastPositionUpdateTime());
                    float spd = ps.getPlaybackSpeed() > 0f ? ps.getPlaybackSpeed() : 1f;
                    posMs += (long) (elapsed * spd);
                }
            }
            if (durMs > 0L) posMs = Math.min(posMs, durMs);
            return new long[]{ posMs, durMs };
        } catch (Throwable ignored) {
            return null;
        }
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
        MediaWidgetProvider.saveProgress(this, p, dur);
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
                .setOngoing(true)
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
            fgHandler.removeCallbacks(stopFgRunnable);
            // Luôn giữ thông báo foreground khi còn phiên (kể cả tạm dừng) để Android không kill app dưới nền; chỉ gỡ khi clearSession/đóng app.
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
