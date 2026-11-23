package com.tuanphong.mediaplayer;

import android.content.Context;
import android.net.Uri;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Đọc trực tiếp Lyric Embed (USLT, SYLT, TXXX:LYRICS trong ID3v2.2/2.3/2.4;
 * ©lyr trong MP4/M4A; Vorbis Comment LYRICS/UNSYNCEDLYRICS trong FLAC/OGG/OPUS)
 * ở tầng native Android — không phụ thuộc MediaMetadataRetriever hay jsmediatags.
 */
final class EmbeddedLyricsReader {
    private EmbeddedLyricsReader() {}

    static String read(Context ctx, String directPath, Uri uri) {
        if (directPath != null && !directPath.isEmpty()) {
            File f = new File(directPath);
            if (f.isFile() && f.canRead() && f.length() > 16) {
                try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
                    String ly = readFromRaf(raf);
                    if (ly != null && !ly.trim().isEmpty()) return normalizeLyrics(ly);
                } catch (Throwable ignored) {}
            }
        }
        if (ctx != null && uri != null) {
            try (InputStream in = ctx.getContentResolver().openInputStream(uri)) {
                if (in != null) {
                    byte[] head = readUpTo(in, 4 * 1024 * 1024);
                    if (head != null && head.length > 16) {
                        String ly = readFromBytes(head);
                        if (ly != null && !ly.trim().isEmpty()) return normalizeLyrics(ly);
                    }
                }
            } catch (Throwable ignored) {}
        }
        return "";
    }

    private static String normalizeLyrics(String s) {
        if (s == null) return "";
        String out = s.replace("\r\n", "\n").replace('\r', '\n').replace("\u0000", "").trim();
        return out;
    }

    private static byte[] readUpTo(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int total = 0;
        int r;
        while (total < maxBytes && (r = in.read(buf, 0, Math.min(buf.length, maxBytes - total))) != -1) {
            bos.write(buf, 0, r);
            total += r;
        }
        return bos.toByteArray();
    }

    private static String readFromRaf(RandomAccessFile raf) throws IOException {
        long fileLen = raf.length();
        byte[] probe = new byte[(int) Math.min(16, fileLen)];
        raf.seek(0);
        raf.readFully(probe);

        long contentOffset = 0;
        if (probe.length >= 10 && probe[0] == 'I' && probe[1] == 'D' && probe[2] == '3') {
            int tagSize = synchsafe(probe, 6);
            int totalId3 = 10 + tagSize;
            if (tagSize > 0 && totalId3 <= fileLen && totalId3 <= 16 * 1024 * 1024) {
                byte[] id3 = new byte[totalId3];
                raf.seek(0);
                raf.readFully(id3);
                String ly = parseId3v2(id3);
                if (ly != null && !ly.trim().isEmpty()) return ly;
                contentOffset = totalId3;
            }
        }

        if (contentOffset + 12 <= fileLen) {
            byte[] magic = new byte[12];
            raf.seek(contentOffset);
            raf.readFully(magic);
            if (magic[0] == 'f' && magic[1] == 'L' && magic[2] == 'a' && magic[3] == 'C') {
                String ly = parseFlacRaf(raf, contentOffset + 4, fileLen);
                if (ly != null && !ly.trim().isEmpty()) return ly;
            }
            if (magic[4] == 'f' && magic[5] == 't' && magic[6] == 'y' && magic[7] == 'p') {
                String ly = parseMp4Raf(raf, contentOffset, fileLen);
                if (ly != null && !ly.trim().isEmpty()) return ly;
            }
            if (magic[0] == 'O' && magic[1] == 'g' && magic[2] == 'g' && magic[3] == 'S') {
                int toRead = (int) Math.min(256 * 1024, fileLen - contentOffset);
                byte[] buf = new byte[toRead];
                raf.seek(contentOffset);
                raf.readFully(buf);
                String ly = parseOggVorbisBytes(buf);
                if (ly != null && !ly.trim().isEmpty()) return ly;
            }
        }
        return "";
    }

    private static String readFromBytes(byte[] data) {
        int offset = 0;
        if (data.length >= 10 && data[0] == 'I' && data[1] == 'D' && data[2] == '3') {
            int tagSize = synchsafe(data, 6);
            String ly = parseId3v2(data);
            if (ly != null && !ly.trim().isEmpty()) return ly;
            if (tagSize > 0 && 10 + tagSize < data.length) offset = 10 + tagSize;
        }
        if (offset + 12 <= data.length) {
            if (data[offset] == 'f' && data[offset + 1] == 'L' && data[offset + 2] == 'a' && data[offset + 3] == 'C') {
                String ly = parseFlacBytes(data, offset + 4);
                if (ly != null && !ly.trim().isEmpty()) return ly;
            }
            if (data[offset + 4] == 'f' && data[offset + 5] == 't' && data[offset + 6] == 'y' && data[offset + 7] == 'p') {
                String ly = parseMp4Bytes(data, offset, data.length);
                if (ly != null && !ly.trim().isEmpty()) return ly;
            }
            if (data[offset] == 'O' && data[offset + 1] == 'g' && data[offset + 2] == 'g' && data[offset + 3] == 'S') {
                String ly = parseOggVorbisBytes(data);
                if (ly != null && !ly.trim().isEmpty()) return ly;
            }
        }
        return "";
    }

    // ======================== ID3v2 (v2.2 / v2.3 / v2.4) ========================

    private static String parseId3v2(byte[] data) {
        if (data == null || data.length < 10) return "";
        if (data[0] != 'I' || data[1] != 'D' || data[2] != '3') return "";
        int ver = data[3] & 0xFF;
        int flags = data[5] & 0xFF;
        int tagSize = synchsafe(data, 6);
        int end = Math.min(data.length, 10 + tagSize);
        if (end <= 10) return "";

        byte[] body;
        int pos = 0;
        int bodyLen = end - 10;
        if ((flags & 0x80) != 0 && ver < 4) {
            body = deunsync(data, 10, bodyLen);
            bodyLen = body.length;
        } else {
            body = new byte[bodyLen];
            System.arraycopy(data, 10, body, 0, bodyLen);
        }

        // Bỏ qua Extended Header nếu có
        if ((flags & 0x40) != 0 && bodyLen >= 4) {
            int extSize = (ver == 4) ? synchsafe(body, 0) : be32(body, 0);
            if (ver == 3) pos += 4 + extSize;
            else pos += extSize;
            if (pos < 0 || pos >= bodyLen) return "";
        }

        String usltFound = "";
        String syltFound = "";
        String txxxFound = "";

        int hdrSize = (ver == 2) ? 6 : 10;
        while (pos + hdrSize <= bodyLen) {
            if (body[pos] == 0) break; // padding
            String fid;
            int fSize;
            int fFlags2 = 0;
            if (ver == 2) {
                fid = new String(body, pos, 3, StandardCharsets.ISO_8859_1);
                fSize = ((body[pos + 3] & 0xFF) << 16) | ((body[pos + 4] & 0xFF) << 8) | (body[pos + 5] & 0xFF);
            } else {
                fid = new String(body, pos, 4, StandardCharsets.ISO_8859_1);
                fSize = (ver == 4) ? synchsafe(body, pos + 4) : be32(body, pos + 4);
                fFlags2 = body[pos + 9] & 0xFF;
            }
            pos += hdrSize;
            if (fSize <= 0 || pos + fSize > bodyLen) break;

            if ("USLT".equals(fid) || "ULT".equals(fid)) {
                byte[] payload = extractFramePayload(body, pos, fSize, ver, fFlags2);
                String ly = decodeUslt(payload);
                if (!ly.isEmpty() && ly.length() > usltFound.length()) usltFound = ly;
            } else if ("SYLT".equals(fid) || "SLT".equals(fid)) {
                byte[] payload = extractFramePayload(body, pos, fSize, ver, fFlags2);
                String ly = decodeSylt(payload);
                if (!ly.isEmpty() && ly.length() > syltFound.length()) syltFound = ly;
            } else if ("TXXX".equals(fid)) {
                byte[] payload = extractFramePayload(body, pos, fSize, ver, fFlags2);
                String ly = decodeTxxxLyrics(payload);
                if (!ly.isEmpty() && ly.length() > txxxFound.length()) txxxFound = ly;
            }
            pos += fSize;
        }

        if (!usltFound.isEmpty()) return usltFound;
        if (!syltFound.isEmpty()) return syltFound;
        return txxxFound;
    }

    private static byte[] extractFramePayload(byte[] body, int off, int len, int ver, int fFlags2) {
        int start = off;
        int actualLen = len;
        if (ver == 4) {
            if ((fFlags2 & 0x01) != 0 && actualLen >= 4) { // Data Length Indicator
                start += 4;
                actualLen -= 4;
            }
            if ((fFlags2 & 0x02) != 0) { // Frame-level Unsynchronisation
                return deunsync(body, start, actualLen);
            }
        }
        byte[] out = new byte[Math.max(0, actualLen)];
        if (actualLen > 0) System.arraycopy(body, start, out, 0, actualLen);
        return out;
    }

    private static String decodeUslt(byte[] p) {
        if (p == null || p.length < 5) return "";
        int enc = p[0] & 0xFF;
        int idx = 4; // 1 byte encoding + 3 byte language
        idx = skipNullTerminated(p, idx, enc);
        if (idx >= p.length) return "";
        return decodeText(enc, p, idx, p.length - idx).trim();
    }

    private static String decodeSylt(byte[] p) {
        if (p == null || p.length < 8) return "";
        int enc = p[0] & 0xFF;
        int tsFmt = p[4] & 0xFF; // 2 = milliseconds
        int idx = 6; // enc(1) + lang(3) + tsFmt(1) + contentType(1)
        idx = skipNullTerminated(p, idx, enc);
        StringBuilder sb = new StringBuilder();
        boolean isWide = (enc == 1 || enc == 2);
        while (idx < p.length) {
            int textEnd = findNull(p, idx, isWide);
            if (textEnd < 0) break;
            String line = decodeText(enc, p, idx, textEnd - idx).replace("\n", " ").trim();
            idx = textEnd + (isWide ? 2 : 1);
            if (idx + 4 > p.length) break;
            long ts = ((long) (p[idx] & 0xFF) << 24) | ((p[idx + 1] & 0xFF) << 16)
                    | ((p[idx + 2] & 0xFF) << 8) | (p[idx + 3] & 0xFF);
            idx += 4;
            if (tsFmt == 2) {
                long mins = ts / 60000L;
                long secs = (ts % 60000L) / 1000L;
                long cs = (ts % 1000L) / 10L;
                sb.append(String.format(Locale.US, "[%02d:%02d.%02d]", mins, secs, cs)).append(line).append('\n');
            } else {
                sb.append(line).append('\n');
            }
        }
        return sb.toString().trim();
    }

    private static String decodeTxxxLyrics(byte[] p) {
        if (p == null || p.length < 3) return "";
        int enc = p[0] & 0xFF;
        boolean isWide = (enc == 1 || enc == 2);
        int nullPos = findNull(p, 1, isWide);
        if (nullPos < 0) return "";
        String desc = decodeText(enc, p, 1, nullPos - 1).trim().toUpperCase(Locale.US);
        if (!"LYRICS".equals(desc) && !"UNSYNCEDLYRICS".equals(desc) && !"UNSYNCED LYRICS".equals(desc) && !"SYNCEDLYRICS".equals(desc)) {
            return "";
        }
        int valStart = nullPos + (isWide ? 2 : 1);
        if (valStart >= p.length) return "";
        return decodeText(enc, p, valStart, p.length - valStart).trim();
    }

    private static int skipNullTerminated(byte[] p, int start, int enc) {
        boolean isWide = (enc == 1 || enc == 2);
        int n = findNull(p, start, isWide);
        if (n < 0) return p.length;
        return n + (isWide ? 2 : 1);
    }

    private static int findNull(byte[] p, int start, boolean isWide) {
        if (isWide) {
            for (int i = start; i + 1 < p.length; i += 2) {
                if (p[i] == 0 && p[i + 1] == 0) return i;
            }
            return -1;
        }
        for (int i = start; i < p.length; i++) {
            if (p[i] == 0) return i;
        }
        return -1;
    }

    private static String decodeText(int enc, byte[] buf, int off, int len) {
        if (len <= 0 || off < 0 || off + len > buf.length) return "";
        try {
            switch (enc) {
                case 0:
                    return new String(buf, off, len, StandardCharsets.ISO_8859_1);
                case 1:
                    if (len >= 2 && (buf[off] & 0xFF) == 0xFF && (buf[off + 1] & 0xFF) == 0xFE) {
                        return new String(buf, off + 2, len - 2, StandardCharsets.UTF_16LE);
                    }
                    if (len >= 2 && (buf[off] & 0xFF) == 0xFE && (buf[off + 1] & 0xFF) == 0xFF) {
                        return new String(buf, off + 2, len - 2, StandardCharsets.UTF_16BE);
                    }
                    return new String(buf, off, len, StandardCharsets.UTF_16);
                case 2:
                    return new String(buf, off, len, StandardCharsets.UTF_16BE);
                case 3:
                default:
                    return new String(buf, off, len, StandardCharsets.UTF_8);
            }
        } catch (Throwable ignored) {
            return new String(buf, off, len, Charset.defaultCharset());
        }
    }

    private static byte[] deunsync(byte[] src, int off, int len) {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(len);
        int end = Math.min(src.length, off + len);
        for (int i = off; i < end; i++) {
            bos.write(src[i]);
            if ((src[i] & 0xFF) == 0xFF && i + 1 < end && src[i + 1] == 0x00) {
                i++;
            }
        }
        return bos.toByteArray();
    }

    // ======================== FLAC (Vorbis Comment) ========================

    private static String parseFlacRaf(RandomAccessFile raf, long pos, long fileLen) throws IOException {
        byte[] hdr = new byte[4];
        while (pos + 4 <= fileLen) {
            raf.seek(pos);
            raf.readFully(hdr);
            boolean isLast = (hdr[0] & 0x80) != 0;
            int type = hdr[0] & 0x7F;
            int len = ((hdr[1] & 0xFF) << 16) | ((hdr[2] & 0xFF) << 8) | (hdr[3] & 0xFF);
            pos += 4;
            if (len < 0 || pos + len > fileLen) break;
            if (type == 4 && len <= 4 * 1024 * 1024) {
                byte[] vc = new byte[len];
                raf.readFully(vc);
                String ly = parseVorbisCommentBlock(vc, 0, vc.length);
                if (!ly.isEmpty()) return ly;
            }
            pos += len;
            if (isLast) break;
        }
        return "";
    }

    private static String parseFlacBytes(byte[] data, int pos) {
        while (pos + 4 <= data.length) {
            boolean isLast = (data[pos] & 0x80) != 0;
            int type = data[pos] & 0x7F;
            int len = ((data[pos + 1] & 0xFF) << 16) | ((data[pos + 2] & 0xFF) << 8) | (data[pos + 3] & 0xFF);
            pos += 4;
            if (len < 0 || pos + len > data.length) break;
            if (type == 4) {
                String ly = parseVorbisCommentBlock(data, pos, len);
                if (!ly.isEmpty()) return ly;
            }
            pos += len;
            if (isLast) break;
        }
        return "";
    }

    private static String parseVorbisCommentBlock(byte[] buf, int off, int len) {
        int end = Math.min(buf.length, off + len);
        int p = off;
        if (p + 4 > end) return "";
        int vendorLen = le32(buf, p);
        p += 4;
        if (vendorLen < 0 || p + vendorLen + 4 > end) return "";
        p += vendorLen;
        int count = le32(buf, p);
        p += 4;
        if (count <= 0 || count > 10000) return "";
        String best = "";
        for (int i = 0; i < count && p + 4 <= end; i++) {
            int cLen = le32(buf, p);
            p += 4;
            if (cLen < 0 || p + cLen > end) break;
            String entry = new String(buf, p, cLen, StandardCharsets.UTF_8);
            p += cLen;
            int eq = entry.indexOf('=');
            if (eq > 0) {
                String k = entry.substring(0, eq).trim().toUpperCase(Locale.US);
                if ("LYRICS".equals(k) || "UNSYNCEDLYRICS".equals(k) || "SYNCEDLYRICS".equals(k) || "UNSYNCED LYRICS".equals(k)) {
                    String v = entry.substring(eq + 1).trim();
                    if (v.length() > best.length()) best = v;
                }
            }
        }
        return best;
    }

    // ======================== OGG / OPUS ========================

    private static String parseOggVorbisBytes(byte[] buf) {
        // Tìm "OpusTags" hoặc "\x03vorbis"
        for (int i = 0; i + 8 < buf.length; i++) {
            if (buf[i] == 'O' && buf[i + 1] == 'p' && buf[i + 2] == 'u' && buf[i + 3] == 's'
                    && buf[i + 4] == 'T' && buf[i + 5] == 'a' && buf[i + 6] == 'g' && buf[i + 7] == 's') {
                String ly = parseVorbisCommentBlock(buf, i + 8, buf.length - (i + 8));
                if (!ly.isEmpty()) return ly;
            }
            if (buf[i] == 0x03 && buf[i + 1] == 'v' && buf[i + 2] == 'o' && buf[i + 3] == 'r'
                    && buf[i + 4] == 'b' && buf[i + 5] == 'i' && buf[i + 6] == 's') {
                String ly = parseVorbisCommentBlock(buf, i + 7, buf.length - (i + 7));
                if (!ly.isEmpty()) return ly;
            }
        }
        return "";
    }

    // ======================== MP4 / M4A (©lyr) ========================

    private static String parseMp4Raf(RandomAccessFile raf, long start, long end) throws IOException {
        return findMp4LyricsRaf(raf, start, end, 0);
    }

    private static String findMp4LyricsRaf(RandomAccessFile raf, long start, long end, int depth) throws IOException {
        if (depth > 6) return "";
        long pos = start;
        byte[] hdr = new byte[16];
        while (pos + 8 <= end) {
            raf.seek(pos);
            raf.readFully(hdr, 0, 8);
            long size = u32(hdr, 0);
            int headerLen = 8;
            if (size == 1) {
                if (pos + 16 > end) break;
                raf.readFully(hdr, 8, 8);
                size = be64(hdr, 8);
                headerLen = 16;
            } else if (size == 0) {
                size = end - pos;
            }
            if (size < headerLen || pos + size > end) break;
            long boxEnd = pos + size;
            long childStart = pos + headerLen;

            int t0 = hdr[4] & 0xFF, t1 = hdr[5] & 0xFF, t2 = hdr[6] & 0xFF, t3 = hdr[7] & 0xFF;
            boolean isMoov = (t0 == 'm' && t1 == 'o' && t2 == 'o' && t3 == 'v');
            boolean isUdta = (t0 == 'u' && t1 == 'd' && t2 == 't' && t3 == 'a');
            boolean isMeta = (t0 == 'm' && t1 == 'e' && t2 == 't' && t3 == 'a');
            boolean isIlst = (t0 == 'i' && t1 == 'l' && t2 == 's' && t3 == 't');
            boolean isLyr = (t0 == 0xA9 && t1 == 'l' && t2 == 'y' && t3 == 'r');
            boolean isData = (t0 == 'd' && t1 == 'a' && t2 == 't' && t3 == 'a');

            if (isData && depth >= 4) {
                long payloadStart = childStart + 8; // 4 byte type + 4 byte locale
                long payloadLen = boxEnd - payloadStart;
                if (payloadLen > 0 && payloadLen <= 2 * 1024 * 1024) {
                    byte[] txt = new byte[(int) payloadLen];
                    raf.seek(payloadStart);
                    raf.readFully(txt);
                    String ly = new String(txt, StandardCharsets.UTF_8).trim();
                    if (!ly.isEmpty()) return ly;
                }
            } else if (isMoov || isUdta || isIlst || isLyr) {
                String ly = findMp4LyricsRaf(raf, childStart, boxEnd, depth + 1);
                if (!ly.isEmpty()) return ly;
            } else if (isMeta) {
                // FullBox 'meta' có 4 byte version/flags trước các box con
                if (childStart + 4 <= boxEnd) {
                    String ly = findMp4LyricsRaf(raf, childStart + 4, boxEnd, depth + 1);
                    if (!ly.isEmpty()) return ly;
                }
            }
            pos = boxEnd;
        }
        return "";
    }

    private static String parseMp4Bytes(byte[] data, int start, int end) {
        return findMp4LyricsBytes(data, start, end, 0);
    }

    private static String findMp4LyricsBytes(byte[] data, int start, int end, int depth) {
        if (depth > 6) return "";
        int pos = start;
        while (pos + 8 <= end) {
            long size = u32(data, pos);
            int headerLen = 8;
            if (size == 1 && pos + 16 <= end) {
                size = be64(data, pos + 8);
                headerLen = 16;
            } else if (size == 0) {
                size = end - pos;
            }
            if (size < headerLen || pos + size > end) break;
            int boxEnd = (int) (pos + size);
            int childStart = pos + headerLen;

            int t0 = data[pos + 4] & 0xFF, t1 = data[pos + 5] & 0xFF, t2 = data[pos + 6] & 0xFF, t3 = data[pos + 7] & 0xFF;
            boolean isMoov = (t0 == 'm' && t1 == 'o' && t2 == 'o' && t3 == 'v');
            boolean isUdta = (t0 == 'u' && t1 == 'd' && t2 == 't' && t3 == 'a');
            boolean isMeta = (t0 == 'm' && t1 == 'e' && t2 == 't' && t3 == 'a');
            boolean isIlst = (t0 == 'i' && t1 == 'l' && t2 == 's' && t3 == 't');
            boolean isLyr = (t0 == 0xA9 && t1 == 'l' && t2 == 'y' && t3 == 'r');
            boolean isData = (t0 == 'd' && t1 == 'a' && t2 == 't' && t3 == 'a');

            if (isData && depth >= 4) {
                int payloadStart = childStart + 8;
                int payloadLen = boxEnd - payloadStart;
                if (payloadLen > 0) {
                    String ly = new String(data, payloadStart, payloadLen, StandardCharsets.UTF_8).trim();
                    if (!ly.isEmpty()) return ly;
                }
            } else if (isMoov || isUdta || isIlst || isLyr) {
                String ly = findMp4LyricsBytes(data, childStart, boxEnd, depth + 1);
                if (!ly.isEmpty()) return ly;
            } else if (isMeta && childStart + 4 <= boxEnd) {
                String ly = findMp4LyricsBytes(data, childStart + 4, boxEnd, depth + 1);
                if (!ly.isEmpty()) return ly;
            }
            pos = boxEnd;
        }
        return "";
    }

    // ======================== Helpers ========================

    private static int synchsafe(byte[] b, int o) {
        return ((b[o] & 0x7F) << 21) | ((b[o + 1] & 0x7F) << 14) | ((b[o + 2] & 0x7F) << 7) | (b[o + 3] & 0x7F);
    }

    private static int be32(byte[] b, int o) {
        return ((b[o] & 0xFF) << 24) | ((b[o + 1] & 0xFF) << 16) | ((b[o + 2] & 0xFF) << 8) | (b[o + 3] & 0xFF);
    }

    private static long u32(byte[] b, int o) {
        return ((long) (b[o] & 0xFF) << 24) | ((long) (b[o + 1] & 0xFF) << 16)
                | ((long) (b[o + 2] & 0xFF) << 8) | (long) (b[o + 3] & 0xFF);
    }

    private static long be64(byte[] b, int o) {
        return ((long) (b[o] & 0xFF) << 56) | ((long) (b[o + 1] & 0xFF) << 48)
                | ((long) (b[o + 2] & 0xFF) << 40) | ((long) (b[o + 3] & 0xFF) << 32)
                | ((long) (b[o + 4] & 0xFF) << 24) | ((long) (b[o + 5] & 0xFF) << 16)
                | ((long) (b[o + 6] & 0xFF) << 8) | (long) (b[o + 7] & 0xFF);
    }

    private static int le32(byte[] b, int o) {
        return (b[o] & 0xFF) | ((b[o + 1] & 0xFF) << 8) | ((b[o + 2] & 0xFF) << 16) | ((b[o + 3] & 0xFF) << 24);
    }
}
