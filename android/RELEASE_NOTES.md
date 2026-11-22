<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Widget tự reset khi app sập**: Ngay khi app gặp lỗi và đóng, các widget về trạng thái chưa mở bài nào; nếu app bị hệ thống tắt mà không báo được thì một báo thức nền sẽ đánh thức app để kiểm tra và đưa widget về đúng trạng thái.
- **Hết trang trắng khi vào lại app**: App tự phát hiện trang trắng xóa sau khi quay lại hoặc sau khi tải xong và tự làm mới trang.
- **Widget đồng bộ màu và trạng thái**: Widget màn hình chính ăn theo màu accent đang chọn trong app (nền, màu nhấn, nút phát), và khi app khởi động lại sau khi bị sập thì tất cả widget tự về trạng thái chưa mở bài nào với album art trống.
- **Hộp thoại tiến trình chia sẻ tệp**: Khi bấm Chia sẻ trên giao diện điện thoại, ứng dụng hiển thị bottom sheet với vòng xoay tải và cập nhật trạng thái trực tiếp từ hệ thống Android (`Đang xác định vị trí tệp...` -> `Đang chuẩn bị tệp...` -> `Đang chia sẻ...`), tự trượt xuống ngay khi mở bảng chia sẻ hệ thống.
- **Widget Android gọn sạch hơn**: Loại bỏ dòng chú thích nguồn `"Lyric by ... • Lyric powered by LRCLIB"` trên cả **Lyrics Widget** lẫn **Media Widget** (chế độ mở rộng).
