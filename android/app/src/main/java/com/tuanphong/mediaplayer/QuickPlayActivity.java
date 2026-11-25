package com.tuanphong.mediaplayer;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;

import java.util.Locale;

/**
 * Sheet mini hiện nổi phía dưới khi mở tệp nhạc từ app khác (trình quản lý tệp...): ảnh bìa, tên, thanh tua, điều khiển cơ bản và nút "Open full player".
 * Tự phát bằng ExoPlayer riêng (không dựng WebView) nên mở gần như tức thì; bấm nút mới chuyển tệp + vị trí sang app chính.
 */
public class QuickPlayActivity extends Activity {
    private ExoPlayer player;
    private Uri uri;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private WavySeek seek;
    private TextView tvTitle, tvArtist, tvAlbum, tvPos, tvDur;
    private ImageView art, btnPlayIcon;
    private TextView artNote;
    private View btnPlay, btnPrev, btnNext, card;
    private long fallbackDur = 0;
    private boolean vi, dark, handedOff = false, ended = false;

    // Bảng màu (khớp phong cách MD3 Expressive)
    private int cSurface, cOnSurface, cOnVariant, cPrimary, cTrack, cSecBtn, cOnSecBtn, cPlayBtn, cOnPlayBtn, cOpenBtn, cOnOpenBtn, cArtBg;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        vi = Locale.getDefault().getLanguage().equals("vi");
        dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        pickColors();
        uri = uriFrom(getIntent());
        if (uri == null) { finish(); return; }
        buildUi();
        initPlayer();
        loadMetaAsync();
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        Uri u = uriFrom(i);
        if (u == null) return;
        setIntent(i);
        uri = u;
        ended = false;
        player.setMediaItem(MediaItem.fromUri(uri));
        player.prepare();
        player.play();
        fallbackDur = 0;
        loadMetaAsync();
    }

    private static Uri uriFrom(Intent i) {
        if (i == null) return null;
        Uri u = i.getData();
        if (u == null && i.getClipData() != null && i.getClipData().getItemCount() > 0) u = i.getClipData().getItemAt(0).getUri();
        return u;
    }

    private void pickColors() {
        if (dark) {
            cSurface = 0xFF1F2129; cOnSurface = 0xFFE4E2EA; cOnVariant = 0xFFC7C6D2; cPrimary = 0xFFB9C3FF; cTrack = 0xFF464955;
            cSecBtn = 0xFFD0D4EE; cOnSecBtn = 0xFF1B1E32; cPlayBtn = 0xFFD9BDF0; cOnPlayBtn = 0xFF2B1A3C; cOpenBtn = 0xFF44507A; cOnOpenBtn = 0xFFDDE1FF; cArtBg = 0xFF2E3140;
        } else {
            cSurface = 0xFFF3F2FA; cOnSurface = 0xFF1B1B21; cOnVariant = 0xFF46464F; cPrimary = 0xFF4A5AA8; cTrack = 0xFFCACBD6;
            cSecBtn = 0xFFDCE1FF; cOnSecBtn = 0xFF151B44; cPlayBtn = 0xFFEBDCFF; cOnPlayBtn = 0xFF2B1A3C; cOpenBtn = 0xFF4A5AA8; cOnOpenBtn = 0xFFFFFFFF; cArtBg = 0xFFE1E2EC;
        }
    }

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    private GradientDrawable round(int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private void buildUi() {
        final FrameLayout root = new FrameLayout(this);
        root.setOnClickListener(v -> finish());   // chạm ra ngoài sheet = đóng

        card = new LinearLayout(this);
        final LinearLayout col = (LinearLayout) card;
        col.setOrientation(LinearLayout.VERTICAL);
        col.setBackground(round(cSurface, 36));
        col.setPadding(dp(24), dp(10), dp(24), dp(20));
        col.setClickable(true);
        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        clp.setMargins(dp(12), 0, dp(12), dp(12));
        if (getResources().getDisplayMetrics().widthPixels > dp(600)) clp.width = dp(520);
        root.addView(card, clp);

        // Tay nắm: kéo xuống để đóng
        View handle = new View(this);
        handle.setBackground(round(cTrack, 4));
        FrameLayout handleBox = new FrameLayout(this);
        handleBox.addView(handle, new FrameLayout.LayoutParams(dp(36), dp(4), Gravity.CENTER));
        col.addView(handleBox, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(24)));
        attachDragToDismiss(handleBox);

        // Hàng ảnh bìa + chữ
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        col.addView(row, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout artBox = new FrameLayout(this);
        artBox.setBackground(round(cArtBg, 22));
        artBox.setClipToOutline(true);
        artBox.setOutlineProvider(new android.view.ViewOutlineProvider() {
            @Override public void getOutline(View v, android.graphics.Outline o) { o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), dp(22)); }
        });
        art = new ImageView(this);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);
        artBox.addView(art, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        artNote = new TextView(this);
        artNote.setText("♪");
        artNote.setTextSize(TypedValue.COMPLEX_UNIT_SP, 44);
        artNote.setTextColor(cPrimary);
        artNote.setGravity(Gravity.CENTER);
        artBox.addView(artNote, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        row.addView(artBox, new LinearLayout.LayoutParams(dp(96), dp(96)));

        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        tlp.leftMargin = dp(20);
        row.addView(texts, tlp);
        tvTitle = text(26, cOnSurface, true);
        tvTitle.setMaxLines(2);
        tvTitle.setEllipsize(TextUtils.TruncateAt.END);
        tvArtist = text(17, cOnVariant, false);
        tvArtist.setSingleLine(true);
        tvArtist.setEllipsize(TextUtils.TruncateAt.END);
        tvAlbum = text(14, cOnVariant, false);
        tvAlbum.setSingleLine(true);
        tvAlbum.setEllipsize(TextUtils.TruncateAt.END);
        texts.addView(tvTitle);
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        alp.topMargin = dp(6);
        texts.addView(tvArtist, alp);
        texts.addView(tvAlbum);

        // Thanh tua dạng sóng
        seek = new WavySeek(this);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(36));
        slp.topMargin = dp(18);
        col.addView(seek, slp);
        seek.listener = (frac, fin) -> {
            long d = durationMs();
            if (d <= 0) return;
            long pos = (long) (frac * d);
            tvPos.setText(fmt(pos));
            if (fin) { player.seekTo(pos); ended = false; }
        };

        LinearLayout times = new LinearLayout(this);
        times.setOrientation(LinearLayout.HORIZONTAL);
        tvPos = text(14, cOnVariant, false);
        tvDur = text(14, cOnVariant, false);
        tvPos.setText("00:00"); tvDur.setText("00:00");
        View sp = new View(this);
        times.addView(tvPos);
        times.addView(sp, new LinearLayout.LayoutParams(0, 1, 1f));
        times.addView(tvDur);
        times.setPadding(dp(4), 0, dp(4), 0);
        col.addView(times, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Điều khiển
        LinearLayout ctr = new LinearLayout(this);
        ctr.setOrientation(LinearLayout.HORIZONTAL);
        ctr.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams ctrLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(76));
        ctrLp.topMargin = dp(20);
        col.addView(ctr, ctrLp);

        btnPrev = ctlButton(R.drawable.ic_qp_prev, cSecBtn, cOnSecBtn, 38);
        btnPlay = ctlButton(R.drawable.ic_qp_pause, cPlayBtn, cOnPlayBtn, 26);
        btnPlayIcon = (ImageView) ((FrameLayout) btnPlay).getChildAt(0);
        btnNext = ctlButton(R.drawable.ic_qp_next, cSecBtn, cOnSecBtn, 38);
        LinearLayout.LayoutParams b1 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
        LinearLayout.LayoutParams b2 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
        LinearLayout.LayoutParams b3 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
        b2.leftMargin = dp(10); b2.rightMargin = dp(10);
        ctr.addView(btnPrev, b1);
        ctr.addView(btnPlay, b2);
        ctr.addView(btnNext, b3);
        btnNext.setAlpha(0.38f);   // Mở từ ngoài chỉ có 1 tệp, không có bài kế
        btnNext.setEnabled(false);
        btnPrev.setOnClickListener(v -> { player.seekTo(0); ended = false; if (!player.isPlaying()) player.play(); });
        btnPlay.setOnClickListener(v -> {
            if (ended || player.getPlaybackState() == Player.STATE_ENDED) { player.seekTo(0); ended = false; player.play(); return; }
            if (player.isPlaying()) player.pause(); else player.play();
        });

        // Nút mở app chính
        TextView open = new TextView(this);
        open.setText(vi ? "Mở trình phát đầy đủ" : "Open full player");
        open.setTextColor(cOnOpenBtn);
        open.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        open.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        open.setGravity(Gravity.CENTER);
        open.setBackground(round(cOpenBtn, 28));
        open.setOnClickListener(v -> openFullPlayer());
        LinearLayout.LayoutParams olp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(58));
        olp.topMargin = dp(20);
        col.addView(open, olp);

        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, wi) -> {
            Insets bars = wi.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return wi;
        });
        card.setTranslationY(dp(60));
        card.setAlpha(0f);
        card.animate().translationY(0).alpha(1f).setDuration(220).setInterpolator(new DecelerateInterpolator()).start();
    }

    private TextView text(int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        return t;
    }

    private View ctlButton(int icon, int bg, int fg, int radiusDp) {
        FrameLayout f = new FrameLayout(this);
        f.setBackground(round(bg, radiusDp));
        f.setClickable(true);
        ImageView iv = new ImageView(this);
        iv.setImageResource(icon);
        iv.setColorFilter(fg);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(34), dp(34), Gravity.CENTER);
        f.addView(iv, lp);
        f.setTag(new int[] { bg, fg });
        return f;
    }

    private void attachDragToDismiss(View handle) {
        final float[] y0 = { 0 };
        handle.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN: y0[0] = e.getRawY(); return true;
                case MotionEvent.ACTION_MOVE: {
                    float dy = Math.max(0, e.getRawY() - y0[0]);
                    card.setTranslationY(dy);
                    return true;
                }
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL: {
                    float dy = Math.max(0, e.getRawY() - y0[0]);
                    if (dy > dp(90)) finish();
                    else card.animate().translationY(0).setDuration(160).start();
                    return true;
                }
            }
            return false;
        });
    }

    private void initPlayer() {
        androidx.media3.extractor.DefaultExtractorsFactory ef = new androidx.media3.extractor.DefaultExtractorsFactory()
                .setConstantBitrateSeekingEnabled(true)
                .setConstantBitrateSeekingAlwaysEnabled(true)
                .setMp3ExtractorFlags(androidx.media3.extractor.mp3.Mp3Extractor.FLAG_ENABLE_INDEX_SEEKING);
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new androidx.media3.exoplayer.source.DefaultMediaSourceFactory(this, ef))
                .build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.addListener(new Player.Listener() {
            @Override public void onIsPlayingChanged(boolean p) { syncPlayIcon(); }
            @Override public void onPlayWhenReadyChanged(boolean pwr, int r) { syncPlayIcon(); }
            @Override public void onPlaybackStateChanged(int st) {
                if (st == Player.STATE_ENDED) { ended = true; player.pause(); }
                syncPlayIcon();
            }
            @Override public void onPlayerError(PlaybackException e) { syncPlayIcon(); }
        });
        try { NativeAudio.pause(); } catch (Throwable ignored) {}   // nếu app chính đang phát bài khác thì dừng lại nhường tệp vừa mở
        player.setMediaItem(MediaItem.fromUri(uri));
        player.prepare();
        player.play();
        ui.post(tick);
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            long d = durationMs();
            long pos = Math.max(0, player.getCurrentPosition());
            if (d > 0 && pos > d) pos = d;
            if (!seek.dragging) {
                seek.setProgress(d > 0 ? Math.min(1f, (float) pos / d) : 0f);
                tvPos.setText(fmt(ended && d > 0 ? d : pos));
            }
            tvDur.setText(fmt(d));
            seek.setPlaying(player.isPlaying());
            ui.postDelayed(this, 250);
        }
    };

    private long durationMs() {
        long d = player == null ? C.TIME_UNSET : player.getDuration();
        if (d == C.TIME_UNSET || d <= 0) d = fallbackDur;
        return Math.max(0, d);
    }

    private void syncPlayIcon() {
        if (player == null) return;
        boolean playing = player.getPlayWhenReady() && player.getPlaybackState() != Player.STATE_ENDED && !ended;
        btnPlayIcon.setImageResource(playing ? R.drawable.ic_qp_pause : R.drawable.ic_qp_play);
        // Đang phát: ô vuông bo tròn; tạm dừng: viên thuốc (đúng tinh thần MD3E)
        btnPlay.setBackground(round(cPlayBtn, playing ? 26 : 38));
    }

    private static String fmt(long ms) {
        long s = Math.max(0, ms) / 1000;
        long h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
        return h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, m, sec) : String.format(Locale.US, "%02d:%02d", m, sec);
    }

    private void loadMetaAsync() {
        final Uri u = uri;
        final Context ctx = getApplicationContext();
        tvTitle.setText(displayName(u));
        tvArtist.setText(vi ? "Không rõ nghệ sĩ" : "Unknown Artist");
        tvAlbum.setText(vi ? "Không rõ album" : "Unknown Album");
        new Thread(() -> {
            String title = null, artist = null, album = null;
            long dur = 0;
            Bitmap bmp = null;
            MediaMetadataRetriever r = new MediaMetadataRetriever();
            try {
                r.setDataSource(ctx, u);
                title = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE);
                artist = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
                if (empty(artist)) artist = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST);
                album = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM);
                String ds = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                if (ds != null) dur = Long.parseLong(ds.trim());
                byte[] pic = r.getEmbeddedPicture();
                if (pic != null && pic.length > 0) {
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(pic, 0, pic.length, o);
                    int ss = 1;
                    while (o.outWidth / (ss * 2) >= 512 && o.outHeight / (ss * 2) >= 512) ss *= 2;
                    o = new BitmapFactory.Options();
                    o.inSampleSize = ss;
                    bmp = BitmapFactory.decodeByteArray(pic, 0, pic.length, o);
                }
            } catch (Throwable ignored) {
            } finally { try { r.release(); } catch (Throwable ignored) {} }
            final String ft = title, fa = artist, fl = album; final long fd = dur; final Bitmap fb = bmp;
            ui.post(() -> {
                if (isDestroyed() || !u.equals(uri)) return;
                if (!empty(ft)) tvTitle.setText(ft);
                if (!empty(fa)) tvArtist.setText(fa);
                if (!empty(fl)) tvAlbum.setText(fl);
                fallbackDur = fd;
                if (fb != null) { art.setImageBitmap(fb); artNote.setVisibility(View.GONE); }
                else { art.setImageDrawable(null); artNote.setVisibility(View.VISIBLE); }
            });
        }, "qp-meta").start();
    }

    private static boolean empty(String s) { return s == null || s.trim().isEmpty(); }

    private String displayName(Uri u) {
        String n = null;
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) n = c.getString(0);
        } catch (Throwable ignored) {}
        if (empty(n)) n = u.getLastPathSegment();
        if (empty(n)) n = "Media";
        int dot = n.lastIndexOf('.');
        if (dot > 0 && n.length() - dot <= 6) n = n.substring(0, dot);
        return n;
    }

    private void openFullPlayer() {
        if (handedOff) return;
        handedOff = true;
        long pos = player != null ? Math.max(0, player.getCurrentPosition()) : 0;
        boolean playing = player != null && player.getPlayWhenReady() && !ended;
        Intent i = new Intent(this, MainActivity.class);
        i.setAction(Intent.ACTION_VIEW);
        i.setData(uri);
        i.setClipData(ClipData.newRawUri("", uri));
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        i.putExtra("qp_pos", ended ? 0L : pos);
        i.putExtra("qp_play", playing || ended);
        releasePlayer();
        startActivity(i);
        finish();
    }

    private void releasePlayer() {
        ui.removeCallbacks(tick);
        if (player != null) { try { player.release(); } catch (Throwable ignored) {} player = null; }
    }

    @Override
    protected void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }

    /** Thanh tua dạng sóng (MD3E): phần đã phát là sóng chuyển động khi đang phát, phần còn lại là đường thẳng. */
    static class WavySeek extends View {
        interface L { void onSeek(float frac, boolean fin); }
        L listener;
        boolean dragging;
        private float prog, amp, phase;
        private boolean playing;
        private final Paint wave = new Paint(Paint.ANTI_ALIAS_FLAG), track = new Paint(Paint.ANTI_ALIAS_FLAG), thumb = new Paint(Paint.ANTI_ALIAS_FLAG), dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        private final ValueAnimator anim;
        private final float dens;

        WavySeek(Context c) {
            super(c);
            dens = c.getResources().getDisplayMetrics().density;
            QuickPlayActivity a = (QuickPlayActivity) c;
            wave.setStyle(Paint.Style.STROKE); wave.setStrokeCap(Paint.Cap.ROUND); wave.setStrokeWidth(4 * dens); wave.setColor(a.cPrimary);
            track.setStyle(Paint.Style.STROKE); track.setStrokeCap(Paint.Cap.ROUND); track.setStrokeWidth(4 * dens); track.setColor(a.cTrack);
            thumb.setColor(a.cPrimary);
            dot.setColor(a.cPrimary);
            anim = ValueAnimator.ofFloat(0f, 1f);
            anim.setDuration(1600);
            anim.setRepeatCount(ValueAnimator.INFINITE);
            anim.setInterpolator(new android.view.animation.LinearInterpolator());
            anim.addUpdateListener(an -> {
                phase = -(float) an.getAnimatedValue() * (float) (Math.PI * 2);
                float target = (playing || dragging) ? 3f * dens : 0f;
                amp += (target - amp) * 0.12f;
                invalidate();
            });
        }

        @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); anim.start(); }
        @Override protected void onDetachedFromWindow() { anim.cancel(); super.onDetachedFromWindow(); }

        void setProgress(float p) { prog = p; invalidate(); }
        void setPlaying(boolean p) { playing = p; }

        @Override protected void onDraw(Canvas cv) {
            float w = getWidth(), h = getHeight(), cy = h / 2f;
            float r = 9 * dens;
            float x0 = r, x1 = w - r;
            float px = x0 + (x1 - x0) * Math.max(0f, Math.min(1f, prog));
            float wl = 24 * dens;
            path.reset();
            path.moveTo(x0, cy);
            for (float x = x0; x <= px; x += 2f) {
                float fade = Math.min(1f, (x - x0) / (12 * dens));   // sóng nở dần từ đầu thanh
                path.lineTo(x, cy + amp * fade * (float) Math.sin((x / wl) * 2 * Math.PI + phase));
            }
            cv.drawPath(path, wave);
            float gap = r + 4 * dens;
            if (px + gap < x1) cv.drawLine(px + gap, cy, x1, cy, track);
            dot.setColor(wave.getColor());
            cv.drawCircle(x1, cy, 2 * dens, dot);
            float ty = cy + (px > x0 ? amp * (float) Math.sin((px / wl) * 2 * Math.PI + phase) : 0f);
            cv.drawCircle(px, ty, dragging ? r * 1.15f : r, thumb);
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            float r = 9 * dens;
            float frac = (e.getX() - r) / Math.max(1f, getWidth() - 2 * r);
            frac = Math.max(0f, Math.min(1f, frac));
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    getParent().requestDisallowInterceptTouchEvent(true);
                    dragging = true; prog = frac;
                    if (listener != null) listener.onSeek(frac, false);
                    invalidate();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    prog = frac;
                    if (listener != null) listener.onSeek(frac, false);
                    invalidate();
                    return true;
                case MotionEvent.ACTION_UP:
                    prog = frac; dragging = false;
                    if (listener != null) listener.onSeek(frac, true);
                    invalidate();
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    dragging = false;
                    invalidate();
                    return true;
            }
            return super.onTouchEvent(e);
        }
    }
}
