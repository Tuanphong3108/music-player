<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Album art MediaSession tự đọc trực tiếp từ tệp nhạc**: bỏ hoàn toàn việc nhận ảnh bìa từ WebView (`setArtwork` / `ACTION_ART`), để `MediaService` tự trích xuất ảnh nhúng qua `MediaMetadataRetriever` từ tệp gốc cho `MediaSession` và thông báo phát nhạc, tránh lệch ảnh hoặc trễ khi chuyển bài.
