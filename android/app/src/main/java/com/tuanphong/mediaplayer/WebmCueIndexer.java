package com.tuanphong.mediaplayer;

import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Quét nhanh các khối Cluster trong tệp WebM/Matroska bị thiếu bảng Cues (khiến ExoPlayer báo seekable=false)
 * và dựng lại bản sao trong cache có gắn đầy đủ bảng chỉ mục Cues ngay trước Cluster đầu tiên — không mã hóa lại âm thanh,
 * giữ nguyên chất lượng bit-exact và giúp ExoPlayer tua mượt + giữ trọn bộ trộn EQ 5 dải.
 */
final class WebmCueIndexer {
    private static final String TAG = "WebmCueIndexer";
    private static final long MAX_FILE_BYTES = 128L * 1024L * 1024L;
    private static final int MAX_CACHE_FILES = 12;

    private static final long ID_EBML = 0x1A45DFA3L;
    private static final long ID_SEGMENT = 0x18538067L;
    private static final long ID_SEEK_HEAD = 0x114D9B74L;
    private static final long ID_TRACKS = 0x1654AE6BL;
    private static final long ID_TRACK_ENTRY = 0xAEL;
    private static final long ID_TRACK_NUMBER = 0xD7L;
    private static final long ID_CUES = 0x1C53BB6BL;
    private static final long ID_CLUSTER = 0x1F43B675L;
    private static final long ID_TIMECODE = 0xE7L;

    private WebmCueIndexer() {}

    /**
     * Nếu srcUri là tệp WebM/MKV hợp lệ có >= 2 Cluster, trả về Uri của bản cache đã gắn bảng Cues chuẩn.
     * Nếu không phải WebM/MKV hoặc không thể dựng bảng, trả về null.
     */
    static Uri ensureSeekable(Context ctx, Uri srcUri) {
        if (ctx == null || srcUri == null) return null;
        File cacheDir = new File(ctx.getCacheDir(), "webm_cues");
        if (!cacheDir.exists()) cacheDir.mkdirs();

        // Kiểm tra nhanh 4 byte đầu có phải EBML (1A 45 DF A3) không
        if (!isEbmlHeader(ctx, srcUri)) return null;

        long srcLen = -1;
        long srcMod = 0;
        File directFile = null;
        if ("file".equalsIgnoreCase(srcUri.getScheme()) && srcUri.getPath() != null) {
            File f = new File(srcUri.getPath());
            if (f.isFile() && f.canRead()) {
                directFile = f;
                srcLen = f.length();
                srcMod = f.lastModified();
            }
        }

        String keyRaw = srcUri.toString() + "|" + srcLen + "|" + srcMod;
        String hash = Integer.toHexString(keyRaw.hashCode());
        File outFile = new File(cacheDir, "cue_" + hash + ".webm");
        if (outFile.isFile() && outFile.length() > 0) {
            outFile.setLastModified(System.currentTimeMillis());
            return Uri.fromFile(outFile);
        }

        File tempSrc = null;
        RandomAccessFile raf = null;
        ParcelFileDescriptor pfd = null;
        FileInputStream pfdIn = null;
        try {
            FileChannel ch = null;
            long fileSize = -1;
            if (directFile != null) {
                raf = new RandomAccessFile(directFile, "r");
                ch = raf.getChannel();
                fileSize = ch.size();
            } else {
                try {
                    pfd = ctx.getContentResolver().openFileDescriptor(srcUri, "r");
                    if (pfd != null) {
                        pfdIn = new FileInputStream(pfd.getFileDescriptor());
                        FileChannel cand = pfdIn.getChannel();
                        long sz = cand.size();
                        if (sz > 0) {
                            cand.position(0);
                            ch = cand;
                            fileSize = sz;
                        }
                    }
                } catch (Throwable ignored) {
                    ch = null;
                }
                if (ch == null) {
                    // Fallback: chép tạm từ stream content:// không hỗ trợ seek
                    tempSrc = new File(cacheDir, "src_" + System.nanoTime() + ".tmp");
                    try (InputStream in = ctx.getContentResolver().openInputStream(srcUri);
                         FileOutputStream fos = new FileOutputStream(tempSrc)) {
                        if (in == null) return null;
                        byte[] buf = new byte[65536];
                        int n;
                        long total = 0;
                        while ((n = in.read(buf)) != -1) {
                            total += n;
                            if (total > MAX_FILE_BYTES) return null;
                            fos.write(buf, 0, n);
                        }
                    }
                    raf = new RandomAccessFile(tempSrc, "r");
                    ch = raf.getChannel();
                    fileSize = ch.size();
                }
            }

            if (ch == null || fileSize <= 32 || fileSize > MAX_FILE_BYTES) return null;

            File tmpOut = new File(cacheDir, "cue_" + hash + "_" + System.nanoTime() + ".tmp");
            boolean ok = rebuildWithCues(ch, fileSize, tmpOut);
            if (!ok || !tmpOut.isFile() || tmpOut.length() <= 0) {
                try { tmpOut.delete(); } catch (Throwable ignored) {}
                return null;
            }
            if (outFile.exists()) outFile.delete();
            if (!tmpOut.renameTo(outFile)) {
                try { tmpOut.delete(); } catch (Throwable ignored) {}
                return null;
            }
            pruneCache(cacheDir);
            return Uri.fromFile(outFile);
        } catch (Throwable t) {
            Log.w(TAG, "Failed to rebuild WebM Cues: " + t.getMessage());
            return null;
        } finally {
            try { if (raf != null) raf.close(); } catch (Throwable ignored) {}
            try { if (pfdIn != null) pfdIn.close(); } catch (Throwable ignored) {}
            try { if (pfd != null) pfd.close(); } catch (Throwable ignored) {}
            if (tempSrc != null) { try { tempSrc.delete(); } catch (Throwable ignored) {} }
        }
    }

    private static boolean isEbmlHeader(Context ctx, Uri u) {
        try (InputStream in = ctx.getContentResolver().openInputStream(u)) {
            if (in == null) return false;
            byte[] h = new byte[4];
            int r = 0;
            while (r < 4) {
                int n = in.read(h, r, 4 - r);
                if (n <= 0) return false;
                r += n;
            }
            return (h[0] & 0xFF) == 0x1A && (h[1] & 0xFF) == 0x45 && (h[2] & 0xFF) == 0xDF && (h[3] & 0xFF) == 0xA3;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static void pruneCache(File dir) {
        try {
            File[] files = dir.listFiles((d, name) -> name.endsWith(".webm"));
            if (files == null || files.length <= MAX_CACHE_FILES) return;
            Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
            for (int i = 0; i < files.length - MAX_CACHE_FILES; i++) {
                try { files[i].delete(); } catch (Throwable ignored) {}
            }
        } catch (Throwable ignored) {}
    }

    private static final class Span {
        final long start;
        final long len;
        Span(long s, long l) { this.start = s; this.len = l; }
    }

    private static final class ClusterInfo {
        final long relPos;
        final long timecode;
        ClusterInfo(long r, long t) { this.relPos = r; this.timecode = t; }
    }

    private static final class Vint {
        final long val;
        final int len;
        final boolean unknown;
        Vint(long v, int l, boolean u) { this.val = v; this.len = l; this.unknown = u; }
    }

    private static boolean rebuildWithCues(FileChannel ch, long fileSize, File outFile) throws IOException {
        byte[] small = new byte[16];
        // 1. Đọc header EBML đầu tệp
        Vint ebmlId = readId(ch, 0, fileSize, small);
        if (ebmlId == null || ebmlId.val != ID_EBML) return false;
        Vint ebmlSz = readSize(ch, ebmlId.len, fileSize, small);
        if (ebmlSz == null || ebmlSz.unknown) return false;
        long segPos = ebmlId.len + ebmlSz.len + ebmlSz.val;
        if (segPos >= fileSize) return false;

        // 2. Đọc header Segment
        Vint segId = readId(ch, segPos, fileSize, small);
        if (segId == null || segId.val != ID_SEGMENT) return false;
        Vint segSz = readSize(ch, segPos + segId.len, fileSize, small);
        if (segSz == null) return false;
        long segDataStart = segPos + segId.len + segSz.len;
        long segEnd = segSz.unknown ? fileSize : Math.min(fileSize, segDataStart + segSz.val);
        if (segDataStart >= segEnd) return false;

        List<Span> keptHeaders = new ArrayList<>();
        List<ClusterInfo> clusters = new ArrayList<>();
        long firstClusterPos = -1;
        long trackNumber = 1;
        long pos = segDataStart;

        // 3. Quét các phần tử cấp 1 trong Segment (giữ lại Info/Tracks, bỏ SeekHead/Cues cũ, ghi nhận toàn bộ Cluster)
        while (pos < segEnd) {
            Vint id = readId(ch, pos, segEnd, small);
            if (id == null) break;
            Vint sz = readSize(ch, pos + id.len, segEnd, small);
            if (sz == null) break;
            long dataStart = pos + id.len + sz.len;
            long nextPos = sz.unknown ? -1 : (dataStart + sz.val);
            if (nextPos > segEnd) nextPos = segEnd;

            if (id.val == ID_CLUSTER) {
                if (firstClusterPos < 0) firstClusterPos = pos;
                long tc = readClusterTimecode(ch, dataStart, sz.unknown ? Math.min(segEnd, dataStart + 256) : Math.min(segEnd, nextPos), small);
                if (tc >= 0) {
                    clusters.add(new ClusterInfo(pos - segDataStart, tc));
                }
                if (nextPos > pos) {
                    pos = nextPos;
                } else {
                    // Cluster có kích thước không xác định: dò tiến tìm chữ ký Cluster kế tiếp (1F 43 B6 75)
                    long found = findNextCluster(ch, dataStart + 8, segEnd, small);
                    if (found < 0) break;
                    pos = found;
                }
            } else if (firstClusterPos < 0) {
                if (id.val == ID_TRACKS && !sz.unknown && nextPos > dataStart) {
                    long tn = readFirstTrackNumber(ch, dataStart, nextPos, small);
                    if (tn > 0) trackNumber = tn;
                }
                if (id.val != ID_SEEK_HEAD && id.val != ID_CUES && !sz.unknown && nextPos > pos) {
                    keptHeaders.add(new Span(pos, nextPos - pos));
                }
                if (nextPos <= pos) break;
                pos = nextPos;
            } else {
                // Phần tử sau Cluster (Tags, Cues cuối tệp...)
                if (nextPos <= pos) break;
                pos = nextPos;
            }
        }

        if (firstClusterPos < 0 || clusters.size() < 2) return false;

        long headerBytesLen = 0;
        for (Span sp : keptHeaders) headerBytesLen += sp.len;

        int posBytes = (fileSize > 0x70000000L) ? 8 : 4;
        byte[] dummyCues = buildCuesElement(clusters, trackNumber, 0L, posBytes);
        long shift = (headerBytesLen + dummyCues.length) - (firstClusterPos - segDataStart);
        byte[] cuesBytes = buildCuesElement(clusters, trackNumber, shift, posBytes);
        if (cuesBytes.length != dummyCues.length) return false;

        long tailLen = segEnd - firstClusterPos;
        long newSegDataSize = headerBytesLen + cuesBytes.length + tailLen;

        // 4. Ghi tệp mới: EBML + Segment (8-byte size) + Header gốc + Cues mới + toàn bộ dữ liệu Cluster nguyên vẹn
        try (FileOutputStream fos = new FileOutputStream(outFile)) {
            copyRange(ch, 0, segPos, fos);
            // Segment ID (18 53 80 67) + 8-byte VINT size
            byte[] segHdr = new byte[12];
            segHdr[0] = 0x18; segHdr[1] = 0x53; segHdr[2] = (byte) 0x80; segHdr[3] = 0x67;
            segHdr[4] = 0x01;
            for (int i = 0; i < 7; i++) {
                segHdr[11 - i] = (byte) ((newSegDataSize >>> (8 * i)) & 0xFF);
            }
            fos.write(segHdr);
            for (Span sp : keptHeaders) {
                copyRange(ch, sp.start, sp.len, fos);
            }
            fos.write(cuesBytes);
            copyRange(ch, firstClusterPos, tailLen, fos);
            fos.flush();
        }
        Log.d(TAG, "Rebuilt WebM Cues: " + clusters.size() + " clusters, cues=" + cuesBytes.length + "B");
        return true;
    }

    private static long readFirstTrackNumber(FileChannel ch, long start, long end, byte[] small) throws IOException {
        long p = start;
        while (p < end) {
            Vint id = readId(ch, p, end, small);
            if (id == null) break;
            Vint sz = readSize(ch, p + id.len, end, small);
            if (sz == null || sz.unknown) break;
            long dStart = p + id.len + sz.len;
            long next = Math.min(end, dStart + sz.val);
            if (id.val == ID_TRACK_ENTRY) {
                long q = dStart;
                while (q < next) {
                    Vint cid = readId(ch, q, next, small);
                    if (cid == null) break;
                    Vint csz = readSize(ch, q + cid.len, next, small);
                    if (csz == null || csz.unknown) break;
                    long cdStart = q + cid.len + csz.len;
                    long cNext = Math.min(next, cdStart + csz.val);
                    if (cid.val == ID_TRACK_NUMBER && csz.val >= 1 && csz.val <= 8) {
                        return readUInt(ch, cdStart, (int) csz.val, small);
                    }
                    if (cNext <= q) break;
                    q = cNext;
                }
            }
            if (next <= p) break;
            p = next;
        }
        return 1;
    }

    private static long readClusterTimecode(FileChannel ch, long start, long limit, byte[] small) throws IOException {
        long p = start;
        int steps = 0;
        while (p < limit && steps++ < 8) {
            Vint id = readId(ch, p, limit, small);
            if (id == null) return -1;
            Vint sz = readSize(ch, p + id.len, limit, small);
            if (sz == null || sz.unknown) return -1;
            long dStart = p + id.len + sz.len;
            if (id.val == ID_TIMECODE && sz.val >= 1 && sz.val <= 8 && dStart + sz.val <= limit) {
                return readUInt(ch, dStart, (int) sz.val, small);
            }
            long next = dStart + sz.val;
            if (next <= p) return -1;
            p = next;
        }
        return -1;
    }

    private static long findNextCluster(FileChannel ch, long from, long end, byte[] small) throws IOException {
        byte[] buf = new byte[65536];
        ByteBuffer bb = ByteBuffer.wrap(buf);
        long pos = from;
        while (pos < end - 8) {
            int toRead = (int) Math.min(buf.length, end - pos);
            bb.clear();
            bb.limit(toRead);
            ch.position(pos);
            int n = 0;
            while (n < toRead) {
                int r = ch.read(bb);
                if (r <= 0) break;
                n += r;
            }
            if (n < 8) return -1;
            for (int i = 0; i <= n - 4; i++) {
                if ((buf[i] & 0xFF) == 0x1F && (buf[i + 1] & 0xFF) == 0x43 && (buf[i + 2] & 0xFF) == 0xB6 && (buf[i + 3] & 0xFF) == 0x75) {
                    long cand = pos + i;
                    Vint sz = readSize(ch, cand + 4, end, small);
                    if (sz != null) {
                        long dStart = cand + 4 + sz.len;
                        long tc = readClusterTimecode(ch, dStart, Math.min(end, dStart + 128), small);
                        if (tc >= 0) return cand;
                    }
                }
            }
            pos += Math.max(1, n - 3);
        }
        return -1;
    }

    private static byte[] buildCuesElement(List<ClusterInfo> clusters, long trackNum, long shift, int posBytes) {
        ByteArrayOutputStream body = new ByteArrayOutputStream(clusters.size() * 20);
        ByteArrayOutputStream tp = new ByteArrayOutputStream(24);
        ByteArrayOutputStream cp = new ByteArrayOutputStream(32);
        for (ClusterInfo c : clusters) {
            long newPos = Math.max(0L, c.relPos + shift);
            tp.reset();
            writeUIntElem(tp, 0xF7, trackNum, 1);         // CueTrack
            writeUIntElem(tp, 0xF1, newPos, posBytes);    // CueClusterPosition (độ dài cố định)
            byte[] tpBytes = tp.toByteArray();

            cp.reset();
            writeUIntElem(cp, 0xB3, c.timecode, 1);       // CueTime
            cp.write(0xB7);                               // CueTrackPositions
            writeVintSize(cp, tpBytes.length);
            cp.write(tpBytes, 0, tpBytes.length);
            byte[] cpBytes = cp.toByteArray();

            body.write(0xBB);                             // CuePoint
            writeVintSize(body, cpBytes.length);
            body.write(cpBytes, 0, cpBytes.length);
        }
        byte[] bodyBytes = body.toByteArray();
        ByteArrayOutputStream out = new ByteArrayOutputStream(bodyBytes.length + 12);
        out.write(0x1C); out.write(0x53); out.write(0xBB); out.write(0x6B); // Cues ID
        writeVintSize(out, bodyBytes.length);
        out.write(bodyBytes, 0, bodyBytes.length);
        return out.toByteArray();
    }

    private static void writeUIntElem(ByteArrayOutputStream out, int id1Byte, long val, int minBytes) {
        int n = minBytes;
        for (int b = 8; b > n; b--) {
            if (((val >>> (8 * (b - 1))) & 0xFFL) != 0) { n = b; break; }
        }
        if (n < 1) n = 1;
        out.write(id1Byte);
        out.write(0x80 | n);
        for (int i = n - 1; i >= 0; i--) {
            out.write((int) ((val >>> (8 * i)) & 0xFFL));
        }
    }

    private static void writeVintSize(ByteArrayOutputStream out, long size) {
        int len = 1;
        while (len < 8 && size >= ((1L << (7 * len)) - 1L)) len++;
        int first = (1 << (8 - len)) | (int) (size >>> (8 * (len - 1)));
        out.write(first);
        for (int i = len - 2; i >= 0; i--) {
            out.write((int) ((size >>> (8 * i)) & 0xFFL));
        }
    }

    private static Vint readId(FileChannel ch, long pos, long limit, byte[] small) throws IOException {
        if (pos >= limit) return null;
        if (readExact(ch, pos, small, 1) < 1) return null;
        int b0 = small[0] & 0xFF;
        if (b0 == 0) return null;
        int len = Integer.numberOfLeadingZeros(b0) - 24 + 1;
        if (len < 1 || len > 4 || pos + len > limit) return null;
        if (len > 1 && readExact(ch, pos + 1, small, len - 1) < len - 1) return null;
        long id = b0;
        for (int i = 0; i < len - 1; i++) id = (id << 8) | (small[i] & 0xFF);
        return new Vint(id, len, false);
    }

    private static Vint readSize(FileChannel ch, long pos, long limit, byte[] small) throws IOException {
        if (pos >= limit) return null;
        if (readExact(ch, pos, small, 1) < 1) return null;
        int b0 = small[0] & 0xFF;
        if (b0 == 0) return null;
        int len = Integer.numberOfLeadingZeros(b0) - 24 + 1;
        if (len < 1 || len > 8 || pos + len > limit) return null;
        if (len > 1 && readExact(ch, pos + 1, small, len - 1) < len - 1) return null;
        long mask = (len == 8) ? 0L : ((1L << (8 - len)) - 1L);
        long val = b0 & mask;
        long unk = mask;
        for (int i = 0; i < len - 1; i++) {
            val = (val << 8) | (small[i] & 0xFF);
            unk = (unk << 8) | 0xFFL;
        }
        return new Vint(val, len, val == unk);
    }

    private static long readUInt(FileChannel ch, long pos, int len, byte[] small) throws IOException {
        if (readExact(ch, pos, small, len) < len) return 0;
        long v = 0;
        for (int i = 0; i < len; i++) v = (v << 8) | (small[i] & 0xFFL);
        return v;
    }

    private static int readExact(FileChannel ch, long pos, byte[] dst, int len) throws IOException {
        ch.position(pos);
        ByteBuffer bb = ByteBuffer.wrap(dst, 0, len);
        int total = 0;
        while (total < len) {
            int r = ch.read(bb);
            if (r <= 0) break;
            total += r;
        }
        return total;
    }

    private static void copyRange(FileChannel ch, long start, long len, FileOutputStream fos) throws IOException {
        byte[] buf = new byte[65536];
        ByteBuffer bb = ByteBuffer.wrap(buf);
        long rem = len;
        ch.position(start);
        while (rem > 0) {
            int chunk = (int) Math.min(buf.length, rem);
            bb.clear();
            bb.limit(chunk);
            int r = ch.read(bb);
            if (r <= 0) break;
            fos.write(buf, 0, r);
            rem -= r;
        }
    }
}
