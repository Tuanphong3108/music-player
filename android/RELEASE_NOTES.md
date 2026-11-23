<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Chốt thứ tự phát tuần tự khi tắt Shuffle trên MediaSession**: khóa chặt cờ `shuffled` và mảng chỉ số `order` trong `NativeAudio` (`stepQ`, `setQueue`, `setShuffleEnabled`) để khi tắt Shuffle, nút Previous/Next trên thanh thông báo và màn hình khóa luôn lùi/tới theo đúng danh sách gốc `0..n-1`.
