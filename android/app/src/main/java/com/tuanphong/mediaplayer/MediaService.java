package com.tuanphong.mediaplayer;

import android.app.*;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

public class MediaService extends Service {
    static final String ACTION_UPDATE = "update";
    static final String CH = "playback";
    private boolean playing = false;
    private String title = "";

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        String a = i == null ? null : i.getAction();
        if (a != null && a.startsWith("cmd:")) {
            if (MainActivity.instance != null) MainActivity.instance.sendCmd(a.substring(4));
            return START_NOT_STICKY;
        }
        if (i != null) {
            playing = i.getBooleanExtra("playing", false);
            String t = i.getStringExtra("title");
            title = t == null ? "" : t;
        }
        show();
        return START_NOT_STICKY;
    }

    private PendingIntent act(String cmd) {
        Intent i = new Intent(this, MediaService.class).setAction("cmd:" + cmd);
        return PendingIntent.getService(this, cmd.hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void show() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26)
            nm.createNotificationChannel(new NotificationChannel(CH, "Phát nhạc", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_media_play)
         .setContentTitle(title.isEmpty() ? "Media Player" : title)
         .setContentText(playing ? "Đang phát" : "Tạm dừng")
         .setContentIntent(open)
         .setOngoing(playing)
         .setOnlyAlertOnce(true)
         .addAction(android.R.drawable.ic_media_previous, "Trước", act("prev"))
         .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Dừng" : "Phát", act("toggle"))
         .addAction(android.R.drawable.ic_media_next, "Sau", act("next"));
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(1, n);
        if (!playing) stopForeground(false); // giữ thông báo nhưng cho phép vuốt bỏ
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
