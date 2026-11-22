<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Giảm thời gian kiểm tra phản hồi xuống 15 giây & khôi phục màn hình "Trang không phản hồi"**:
  - Đồng bộ mốc kiểm tra phản hồi (`watchdog`, `handshake ping`, kiểm tra trang trắng và nút **Chờ**) về **15 giây**.
  - Hiển thị trực tiếp màn hình **Trang không phản hồi** (với 2 tùy chọn *Chờ* và *Khởi động lại ứng dụng*) ngay khi quá 15 giây không nhận phản hồi, thay vì tự động tải lại ngầm nhiều lần như trước.
- **Quét đầy đủ 100% nhạc trên máy & đọc tức thì Metadata/Album Art** ngay từ danh sách ngoài.
