<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Gỡ lời bài hát khỏi toàn bộ Widget & bỏ Lyrics Widget**: loại bỏ hoàn toàn widget Lời bài hát (`LyricsWidgetProvider`) và ẩn dòng lyric khỏi các widget trình phát để gọn gàng và tiết kiệm pin hơn.
- **Tự động đánh thức WebView khi thao tác trên Widget**: mỗi khi bấm nút điều khiển hoặc chọn bài trên Widget, khung app chủ động gọi `onResume` / `resumeTimers` để đánh thức WebView và ép đồng bộ ngay trạng thái giao diện lẫn widget (vẫn có dự phòng trình phát native nếu WebView bị đóng băng).
