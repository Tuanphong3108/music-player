<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Sửa triệt để lỗi nhận diện Chế độ Sáng/Tối khi để Giao diện = Hệ thống**:
  - Chuyển theme gốc của ứng dụng sang DayNight (`values/styles.xml` Sáng & `values-night/styles.xml` Tối) thay vì khóa cứng theme tối.
  - Kiểm tra trực tiếp trạng thái Sáng/Tối thực tế qua `UiModeManager` + `Resources.getSystem()` và tự đồng bộ lại mỗi khi quay lại ứng dụng (`onResume`).
- **Tăng tốc cực mạnh thời gian nạp/import danh sách nhạc**:
  - Tách quét thư viện thành 2 pha: gửi ngay lập tức toàn bộ bài từ `MediaStore` lên giao diện (không bị chặn bởi `MediaMetadataRetriever` hay duyệt toàn bộ bộ nhớ), sau đó mới quét bổ sung nhanh các thư mục nhạc bị sót ở nền.
- **Giảm thời gian kiểm tra phản hồi xuống 15 giây & khôi phục màn hình "Trang không phản hồi"**.
