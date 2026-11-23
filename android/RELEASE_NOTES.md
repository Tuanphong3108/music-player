<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Thông báo hết giờ ngủ khi app chạy dưới nền**: kiểm tra trực tiếp trạng thái chạy nền/khóa màn hình ở tầng hệ thống (`Activity` + `PowerManager` + `KeyguardManager` + `RunningAppProcessInfo`) để luôn đẩy thông báo `"Đã tạm dừng theo hẹn giờ"` lên Notification dù WebView ngủ hay hoạt động, và chỉ tự đóng thông báo đó sau khi mở lại app và bật hộp thoại thông báo trên giao diện.
