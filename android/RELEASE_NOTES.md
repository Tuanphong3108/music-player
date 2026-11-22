<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Chạy nền ổn định hơn, mở app nhanh hơn**: Giữ CPU thức khi đang phát nhạc để tắt màn hình không làm nhạc giật; khi app ở nền thì ngừng vẽ thanh seek và quét ảnh bìa ngầm; nạp ít thành phần giao diện hơn và hoãn việc quét nền sau khi mở app.
- **Cải tiến bộ chọn bài trong New Playlist (Mobile)**:
  - Tự động đẩy các bài hát đã tick chọn lên đầu danh sách chọn và trả bài về đúng thứ tự `0–Z` khi bỏ tick.
  - Khi đang chọn bài, tiêu đề đổi thành `<số> file(s) selected` / `Đã chọn {n} tệp` (hỗ trợ đa ngôn ngữ `vi.lang` và `en.lang`).
- **Mini Player Play/Pause xoay vòng khi đang tải/đệm bài**, kèm mục **File Path** & nút **Open in Files** trong **Other Info**, cơ chế tự hủy/ghi nhận sự cố nền và quét thư viện **2 pha**.
