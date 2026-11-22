<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Sửa triệt để lỗi không phát được nhạc (`MEDIA_ERR_NETWORK`) & chống crash ứng dụng**:
  - Đồng bộ đa luồng an toàn (`ConcurrentHashMap` & `AtomicInteger`) cho toàn bộ cầu nối phát tệp và quét thư viện.
  - Đọc trực tiếp tệp nhạc từ bộ nhớ khi có quyền và sửa xung đột file tạm khi tua/phát Range; phía trình phát tự tải tệp theo yêu cầu (lazy blob) khi bấm phát và tự giải phóng bộ nhớ khi đổi bài.
- **Hiển thị đầy đủ Metadata & Album Art ngay lập tức**: Quét sẵn Tên bài hát, Nghệ sĩ, Album, Năm và cung cấp kênh tải Ảnh bìa (`/art/<id>`) trực tiếp từ hệ thống MediaStore/thẻ nhúng ngay khi mở ứng dụng.
- **Tab "Quản lý nhạc" (Music Management) trong Cài đặt & Giao diện Mobile mới**.
