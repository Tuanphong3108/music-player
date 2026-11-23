<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Tải ảnh bìa tức thì khi chuyển bài từ màn hình khóa / khi thoát app**: `MediaService` tự trích xuất ảnh bìa nhúng trực tiếp từ tệp nhạc gốc trên luồng nền Android ngay khi đổi bài (`loadNativeArtworkForId`) và cập nhật thẳng lên `MediaSession`, thông báo và Widget — không còn phải chờ WebView tỉnh dậy hay nạp lại giao diện mới có ảnh bìa.
