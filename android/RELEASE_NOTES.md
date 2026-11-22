<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Tăng thời gian chờ tự động tải lại lên 25 giây**: Nâng toàn bộ mốc chờ tải trang (`loadTimeoutRunnable`, `recoverPage`), chờ phản hồi khi quay lại từ nền (`pingTimeoutRunnable`) và kiểm tra trang trắng (`scheduleBlankCheck`) lên **25 giây** để thiết bị tải chậm/đang quét thư viện không bị tự reload sớm.
- **Trình chọn ảnh chuẩn của Android (Android Photo Picker)**: Mở trực tiếp trình chọn ảnh hệ thống khi chọn ảnh bìa Playlist hoặc sửa Thumbnail.
- **Cải thiện tốc độ phát nhạc, hàng đợi tạm và giao diện Playlist trên Mobile**.
