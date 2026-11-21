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
import android.os.SystemClock;

/**
 * Phát nền + điều khiển phát qua MediaSession của hệ thống (màn hình khoá, trình phát media trong Cài đặt nhanh,
 * tai nghe/Bluetooth). Android bắt buộc dịch vụ nền có 1 thông báo nên dùng kênh IMPORTANCE_MIN (im lặng, thu gọn).
 */
public class MediaService extends Service {
    static final String ACTION_UPDATE = "update";
    static final String ACTION_ART = "art";
    static final String CH = "playback";
    private MediaSession session;
    private boolean playing = false;
    private String title = "", artist = "";
    private long pos = 0, dur = 0;
    private float speed = 0f;
    private Bitmap art;

    @Override
    public void onCreate() {
        super.onCreate();
        session = new MediaSession(this, "MediaPlayer");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { if (!playing) cmd("toggle"); }
            @Override public void onPause() { if (playing) cmd("toggle"); }
            @Override public void onSkipToNext() { cmd("next"); }
            @Override public void onSkipToPrevious() { cmd("prev"); }
            @Override public void onSeekTo(long p) { cmd("seek:" + p); }
            @Override public void onStop() { clearSession(); stopSelf(); }
        });
        session.setActive(false);
    }

    private void cmd(String c) { if (MainActivity.instance != null) MainActivity.instance.sendCmd(c); }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        String a = i == null ? null : i.getAction();
        if (a != null && a.startsWith("cmd:")) { cmd(a.substring(4)); return START_NOT_STICKY; }
        if (i != null && ACTION_ART.equals(a)) {
            byte[] b = i.getByteArrayExtra("art");
            art = (b == null || b.length == 0) ? null : BitmapFactory.decodeByteArray(b, 0, b.length);
        } else if (i != null) {
            playing = i.getBooleanExtra("playing", false);
            title = nz(i.getStringExtra("title"));
            artist = nz(i.getStringExtra("artist"));
            pos = i.getLongExtra("pos", 0);
            dur = i.getLongExtra("dur", 0);
            speed = i.getFloatExtra("speed", playing ? 1f : 0f);
        }
        publish();
        return START_NOT_STICKY;
    }

    private void clearSession() {
        playing = false;
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
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP;
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, pos, playing ? (speed > 0f ? speed : 1f) : 0f, SystemClock.elapsedRealtime())
                .build());

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
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(1, n);
        if (!playing) stopForeground(false);
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        clearSession();
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        clearSession();
        if (session != null) { session.release(); session = null; }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
