<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Sửa lỗi chuyển bài trên màn hình khóa bị nhảy loạn & mất ảnh bìa**:
  - Khi ứng dụng đang ở nền hoặc khóa màn hình, `MediaService` chuyển thẳng bài qua `NativeAudio` (`advance` / `previous`) thay vì thăm dò WebView dễ gây chồng lệnh hoặc phát lặp 2 lần; đồng thời tắt `navigator.mediaSession.setActionHandler` phía WebView khi chạy trình phát native để không tranh quyền điều khiển hệ thống.
  - Thêm bộ nhớ đệm ảnh bìa (`LruCache`) theo `nativeId` và chặn WebView gửi ảnh rỗng (`""`) lúc chuyển bài đè mất ảnh bìa native vừa trích xuất.
