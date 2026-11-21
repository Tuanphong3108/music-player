<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Tự khôi phục khi app bị Android đóng băng**: Quay lại app sau thời gian chạy nền, nếu trang web không còn phản hồi thì app tự đánh thức và tải lại (tối đa 2 lần) trước khi báo lỗi; nếu tiến trình hiển thị của WebView bị hệ thống thu hồi thì app dựng lại thay vì treo ở màn hình "Trang không phản hồi".
- **Hộp thoại "Trang không phản hồi" gọn gàng hơn**: Hai nút **Chờ** / **Khởi động lại ứng dụng** dịch theo ngôn ngữ của app, bo tròn hoàn toàn và có hiệu ứng ripple.
- **Predictive Back (Android 13+)**: Cử chỉ vuốt Back có hiệu ứng xem trước cho hộp thoại, bảng chọn, Cài đặt, Lyric và cả màn hình chính (UI lùi dần, mờ đi rồi hiện hộp thoại thoát), kèm animation khi thoát.
- **Báo trạng thái phát chính xác từng giây**: Thông báo media và màn hình khóa cập nhật vị trí, trạng thái đệm và trạng thái phát/tạm dừng theo từng giây.
- **Phát nhạc mượt hơn**: Hỗ trợ tua (Range) khi phát tệp từ thiết bị.
