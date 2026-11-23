<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Tách trình phát nhạc khỏi giao diện**: nhạc trong thư viện máy giờ do app phát bằng ExoPlayer, trang web chỉ ra lệnh. WebView bị đóng băng hay tải lại thì nhạc không ngắt; mở lại app sẽ hỏi lại trạng thái, vào đúng bài, đúng vị trí và đúng màn hình đang mở. Nút Phát/Tạm dừng/Tua trên thông báo hoạt động trực tiếp, Bài kế khi trang không phản hồi do app tự xử lý.
- **3 kiểu widget mới**: Vuông tối giản 2×2, Tự co giãn 4×2 (ảnh bìa, tên bài, tiến trình, 3 nút) và Đầy đủ điều khiển 4×2 (kèm trộn bài và lặp lại). Widget hiển thị xem trước thật trong danh sách chọn, vẫn đồng bộ màu theo accent.
- **Quay lại app không còn hiện "Trang không phản hồi" ngay**: Sau 4 giây không có phản hồi (hoặc thấy trang trắng), app tự tải lại trang tối đa 2 lần, chỉ hiện màn hình lỗi khi vẫn không được.
- **Hết tự tạm dừng khi sang bài mới & ảnh bìa cũ trên thanh điều khiển**: Chuyển bài không còn bị tính là tạm dừng (dịch vụ nền giữ trạng thái phát thêm 15 giây khi dừng ngắn), phát lại tự động nếu bị từ chối, và ảnh bìa trong thông báo/màn hình khóa được xóa ngay rồi cập nhật đúng ảnh bài mới.
- **Sửa lỗi app sập "Unable to start service MediaService"**: Lỗi khi cập nhật phiên phát nhạc (ví dụ hệ thống từ chối dịch vụ nền) không còn làm sập cả app.
- **Chạy nền ổn định hơn, mở app nhanh hơn**: Giữ CPU thức khi đang phát nhạc để tắt màn hình không làm nhạc giật; khi app ở nền thì ngừng vẽ thanh seek và quét ảnh bìa ngầm; nạp ít thành phần giao diện hơn và hoãn việc quét nền sau khi mở app.
- **Cải tiến bộ chọn bài trong New Playlist (Mobile)**:
  - Tự động đẩy các bài hát đã tick chọn lên đầu danh sách chọn và trả bài về đúng thứ tự `0–Z` khi bỏ tick.
  - Khi đang chọn bài, tiêu đề đổi thành `<số> file(s) selected` / `Đã chọn {n} tệp` (hỗ trợ đa ngôn ngữ `vi.lang` và `en.lang`).
- **Mini Player Play/Pause xoay vòng khi đang tải/đệm bài**, kèm mục **File Path** & nút **Open in Files** trong **Other Info**, cơ chế tự hủy/ghi nhận sự cố nền và quét thư viện **2 pha**.
