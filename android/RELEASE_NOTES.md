<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Sửa nút Previous / chuyển bài trên MediaSession khi tắt Shuffle**: khi `shuffled` đang tắt, `stepQ()` giờ luôn bước theo đúng thứ tự danh sách gốc `0..n-1` thay vì đọc mảng `order` đã xáo trộn từ trước, giúp bấm Previous từ thông báo/màn hình khóa/tai nghe lùi đúng bài liền trước.
