package com.tuanphong.mediaplayer;

import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.common.util.UnstableApi;

import java.nio.ByteBuffer;

/**
 * Bộ trộn âm thanh chạy ngay trong chuỗi xử lý của ExoPlayer (thay cho chuỗi Web Audio khi app tự phát):
 * preamp -> EQ 5 dải (lowshelf 60 / peaking 230, 910, 3600 / highshelf 14000, Q=1) -> mono -> nén -> cân bằng L/R,
 * kèm phân tích phổ 128 dải (kiểu AnalyserNode, fft 256) cho visualizer. Chạy trên luồng phát nhạc.
 */
@OptIn(markerClass = UnstableApi.class)
final class MixerProcessor extends BaseAudioProcessor {
    static final float[] FREQS = { 60f, 230f, 910f, 3600f, 14000f };

    // Tham số (đặt từ luồng khác)
    volatile float preDb = 0f;
    volatile boolean eqOn = true, mono = false, comp = false, vizOn = false;
    volatile float[] eqDb = new float[5];
    volatile float balance = 0f;          // -1..1
    private volatile boolean dirty = true;
    volatile byte[] fft = new byte[128];

    private boolean pcm16 = false;
    private int ch = 2, sr = 44100;
    private final double[][] coef = new double[5][5];
    private final double[][][] z = new double[2][5][2];
    private float compEnvDb = 0f;          // mức gain-reduction đang áp (dB, <= 0)
    // FFT
    private final float[] ring = new float[256];
    private int ringPos = 0, sinceFft = 0;
    private final float[] re = new float[256], im = new float[256], win = new float[256], smooth = new float[128];

    MixerProcessor() {
        for (int i = 0; i < 256; i++) {
            double a = 0.16, a0 = (1 - a) / 2, a1 = 0.5, a2 = a / 2;   // Blackman như AnalyserNode
            win[i] = (float) (a0 - a1 * Math.cos(2 * Math.PI * i / 256) + a2 * Math.cos(4 * Math.PI * i / 256));
        }
    }

    void set(float preDb, boolean eqOn, float[] eq, boolean mono, boolean comp, float balance) {
        this.preDb = preDb; this.eqOn = eqOn; this.eqDb = eq; this.mono = mono; this.comp = comp;
        this.balance = Math.max(-1f, Math.min(1f, balance));
        dirty = true;
    }

    @Override
    protected AudioFormat onConfigure(AudioFormat in) {
        pcm16 = in.encoding == C.ENCODING_PCM_16BIT && (in.channelCount == 1 || in.channelCount == 2);
        ch = in.channelCount; sr = in.sampleRate;
        dirty = true;
        return in;   // luôn "hoạt động" nhưng định dạng khác thì chỉ chuyển tiếp nguyên vẹn
    }

    @Override protected void onFlush() { resetState(); }
    @Override protected void onReset() { resetState(); }
    private void resetState() {
        for (double[][] c : z) for (double[] b : c) { b[0] = 0; b[1] = 0; }
        compEnvDb = 0f; ringPos = 0; sinceFft = 0;
        java.util.Arrays.fill(ring, 0f); java.util.Arrays.fill(smooth, 0f);
    }

    private void recompute() {
        float[] g = eqDb;
        for (int i = 0; i < 5; i++) {
            double f0 = Math.min(FREQS[i], sr * 0.45), gain = i < g.length ? g[i] : 0;
            double A = Math.pow(10, gain / 40), w0 = 2 * Math.PI * f0 / sr, cw = Math.cos(w0), sw = Math.sin(w0);
            double b0, b1, b2, a0, a1, a2;
            if (i == 0 || i == 4) {   // shelf, S = 1
                double alpha = sw / 2 * Math.sqrt(2.0), sq = 2 * Math.sqrt(A) * alpha;
                if (i == 0) {
                    b0 = A * ((A + 1) - (A - 1) * cw + sq); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - sq);
                    a0 = (A + 1) + (A - 1) * cw + sq; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - sq;
                } else {
                    b0 = A * ((A + 1) + (A - 1) * cw + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - sq);
                    a0 = (A + 1) - (A - 1) * cw + sq; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - sq;
                }
            } else {                   // peaking, Q = 1
                double alpha = sw / 2.0;
                b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
            }
            coef[i][0] = b0 / a0; coef[i][1] = b1 / a0; coef[i][2] = b2 / a0; coef[i][3] = a1 / a0; coef[i][4] = a2 / a0;
        }
        dirty = false;
    }

    @Override
    public void queueInput(ByteBuffer in) {
        int n = in.remaining();
        if (n == 0) return;
        ByteBuffer out = replaceOutputBuffer(n);
        if (!pcm16) { out.put(in); out.flip(); return; }
        if (dirty) recompute();
        final float pre = (float) Math.pow(10, preDb / 20.0);
        float[] g = eqDb;
        boolean useEq = eqOn;
        if (useEq) { useEq = false; for (float v : g) if (v != 0f) { useEq = true; break; } }
        final boolean useMono = mono && ch == 2, useComp = comp, viz = vizOn;
        final float bal = balance;
        final double gl, gr;
        double x = bal <= 0 ? bal + 1 : bal;
        gl = Math.cos(x * Math.PI / 2); gr = Math.sin(x * Math.PI / 2);
        final int frames = n / (2 * ch);
        final float attack = (float) Math.exp(-1.0 / (0.003 * sr)), release = (float) Math.exp(-1.0 / (0.25 * sr));
        final int hop = Math.max(256, sr / 30);
        for (int f = 0; f < frames; f++) {
            float l = in.getShort() / 32768f, r = ch == 2 ? in.getShort() / 32768f : l;
            l *= pre; r *= pre;
            if (useEq) {
                for (int b = 0; b < 5; b++) {
                    double[] c = coef[b];
                    double[] zz = z[0][b];
                    double y = c[0] * l + zz[0]; zz[0] = c[1] * l - c[3] * y + zz[1]; zz[1] = c[2] * l - c[4] * y; l = (float) y;
                    if (ch == 2) {
                        double[] zr = z[1][b];
                        double yr = c[0] * r + zr[0]; zr[0] = c[1] * r - c[3] * yr + zr[1]; zr[1] = c[2] * r - c[4] * yr; r = (float) yr;
                    }
                }
                if (ch == 1) r = l;
            }
            if (useMono) { float m = (l + r) * 0.5f; l = m; r = m; }
            if (useComp) {   // DynamicsCompressor mặc định của Web Audio: ngưỡng -24 dB, knee 30, tỉ lệ 12:1, attack 3ms, release 250ms
                float lvl = Math.max(Math.abs(l), Math.abs(r));
                float db = lvl > 1e-6f ? 20f * (float) Math.log10(lvl) : -120f;
                float over = db - (-24f), reduce;          // dB trên ngưỡng
                if (over <= -15f) reduce = 0f;
                else if (over >= 15f) reduce = -(over - over / 12f);
                else { float t = over + 15f; reduce = -(t * t) / 60f * (1f - 1f / 12f); }   // vùng knee 30 dB (nội suy bậc hai)
                float target = Math.min(0f, reduce);
                float coefT = target < compEnvDb ? attack : release;
                compEnvDb = coefT * compEnvDb + (1f - coefT) * target;
                float gain = (float) Math.pow(10, compEnvDb / 20.0);
                l *= gain; r *= gain;
            }
            if (bal != 0f && ch == 2) {
                float nl, nr;
                if (bal <= 0) { nl = (float) (l + r * gl); nr = (float) (r * gr); }
                else { nl = (float) (l * gl); nr = (float) (r + l * gr); }
                l = nl; r = nr;
            }
            if (viz) {
                ring[ringPos] = (l + (ch == 2 ? r : l)) * 0.5f;
                ringPos = (ringPos + 1) & 255;
                if (++sinceFft >= hop) { sinceFft = 0; analyse(); }
            }
            out.putShort(clip(l));
            if (ch == 2) out.putShort(clip(r));
        }
        in.position(in.limit());
        out.flip();
    }

    private static short clip(float v) {
        int s = Math.round(v * 32768f);
        return (short) (s > 32767 ? 32767 : Math.max(s, -32768));
    }

    /** FFT 256 điểm + làm mượt 0,8 + quy đổi dB (-100..-30) -> byte 0..255, giống AnalyserNode. */
    private void analyse() {
        for (int i = 0; i < 256; i++) { re[i] = ring[(ringPos + i) & 255] * win[i]; im[i] = 0f; }
        // bit-reversal
        for (int i = 1, j = 0; i < 256; i++) {
            int bit = 128;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) { float t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
        }
        for (int len = 2; len <= 256; len <<= 1) {
            double ang = -2 * Math.PI / len;
            float wr = (float) Math.cos(ang), wi = (float) Math.sin(ang);
            for (int i = 0; i < 256; i += len) {
                float cr = 1f, ci = 0f;
                for (int k = 0; k < len / 2; k++) {
                    int a = i + k, b = i + k + len / 2;
                    float tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
                    re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
                    float ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
                }
            }
        }
        byte[] o = new byte[128];
        for (int k = 0; k < 128; k++) {
            float mag = (float) Math.sqrt(re[k] * re[k] + im[k] * im[k]) / 256f;
            smooth[k] = 0.8f * smooth[k] + 0.2f * mag;
            float db = smooth[k] > 1e-9f ? 20f * (float) Math.log10(smooth[k]) : -200f;
            int v = Math.round((db + 100f) / 70f * 255f);
            o[k] = (byte) (v < 0 ? 0 : Math.min(v, 255));
        }
        fft = o;
    }
}
