<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Thanh tiến độ Widget lấy trực tiếp từ MediaSession**: vị trí và thời lượng phát trên Widget giờ đọc thẳng từ `MediaSession` (tự nội suy chính xác theo tốc độ phát và tự đồng bộ mỗi khi `PlaybackState` cập nhật), không còn phụ thuộc WebView hay gửi tiến độ lặp lại từ JS mỗi giây.
- **Tối ưu cầu nối Widget**: gỡ bỏ hoàn toàn phần gửi lời bài hát và tiến độ thừa từ WebView, chỉ đồng bộ `shuffle`/`repeat` và hàng đợi khi có thay đổi.
