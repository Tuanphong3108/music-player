<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Cơ chế "Tự hủy & Ghi nhận sự cố" khi bị đóng ở nền**:
  - Khi phát hiện ứng dụng bị hệ thống thu hồi tiến trình WebView (`onRenderProcessGone`), ép giải phóng bộ nhớ mức tối đa ở nền (`TRIM_MEMORY_COMPLETE`), bị vuốt/đóng tác vụ nền (`onTaskRemoved`) hoặc gặp lỗi đột ngột (`UncaughtException`), ứng dụng sẽ lập tức:
    1. Đặt lại toàn bộ Widget về trạng thái chờ (idle).
    2. Khôi phục màu chủ đạo (Accent Color) mặc định/hệ thống cho Widget và giao diện.
    3. Hủy hoàn toàn tiến trình WebView cũ để lần mở sau tải mới sạch sẽ từ đầu.
    4. Lưu lại mã lỗi + nguyên nhân + thời gian rồi thoát hẳn ở nền.
  - Hỗ trợ kiểm tra lịch sử tiến trình (`ApplicationExitInfo` trên Android 11+) để bắt cả các trường hợp bị hệ thống kill cứng bằng `SIGKILL`/LMK/Freezer ở nền.
  - Khi mở lại ứng dụng, khung app tự động truyền mã lỗi vào giao diện để hiển thị hộp thoại cho biết lý do ứng dụng vừa bị đóng/sập.
- **Sửa nhận diện Chế độ Sáng/Tối (DayNight) & Tăng tốc nạp danh sách nhạc 2 pha**.
