<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Loại trừ các thao tác người dùng chủ động đóng khỏi báo cáo sập ứng dụng**:
  - Bấm nút **Thoát hẳn** hoặc **vuốt lên đóng ứng dụng trong đa nhiệm (Recents)** sẽ được đánh dấu là thoát chủ động (`clean_exit`), vẫn tự dọn sạch Widget và khôi phục màu chủ đạo, nhưng **không ghi mã lỗi** và **không hiện thông báo sự cố** khi mở lại.
  - Bỏ qua các mã thoát do người dùng chủ động từ hệ thống (`REASON_USER_REQUESTED`, `REASON_USER_STOPPED`, `REASON_EXIT_SELF`) trong `ApplicationExitInfo`; chỉ báo cáo khi ứng dụng thật sự bị sập/kill bất thường ở nền (LMK/OOM, WebView crash, Freezer, ANR, UncaughtException).
- **Sửa nhận diện Chế độ Sáng/Tối (DayNight) & Tăng tốc nạp danh sách nhạc 2 pha**.
