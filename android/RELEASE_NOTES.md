<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, xóa nội dung cũ và chỉ ghi các thay đổi của BẢN HIỆN TẠI trước khi push! -->
### Có gì mới trong bản cập nhật Android này
- **Chia sẻ tệp trực tiếp ở tầng native (`shareNativeFile`)**: khắc phục triệt để lỗi `TypeError: Failed to fetch` khi chia sẻ nhạc trên Android; sao chép trực tiếp từ tệp gốc trên máy vào bộ nhớ đệm chia sẻ trên luồng nền rồi mở Share Sheet qua `FileProvider`, nhanh tức thì và không tốn RAM encode Base64.
