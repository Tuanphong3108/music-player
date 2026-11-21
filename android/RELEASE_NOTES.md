<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Bộ Widget màn hình chính hoàn chỉnh**:
  - **Widget chính (tự biến hình khi kéo giãn)**: Ở kích thước gọn (`4×1`) hiển thị ảnh bìa, tên bài, ca sĩ, dòng lyric đang chạy và 3 nút điều khiển; khi kéo cao ra (`4×2` trở lên) tự mở rộng thêm ảnh bìa lớn, thanh tiến trình phát, thời gian hiện tại/tổng thời gian cùng 2 nút **Shuffle** và **Repeat**.
  - **Widget Hàng đợi (`Media Player - Hàng đợi`)**: Hiển thị bài đang phát và danh sách các bài tiếp theo (tự đồng bộ theo thứ tự Shuffle); chạm trực tiếp vào bài bất kỳ để phát ngay mà không cần mở app.
  - **Widget Lời bài hát (`Media Player - Lời bài hát`)**: Hiển thị lời bài hát đang phát, có nút chuyển nhanh giữa chế độ **Synced** (chạy từng câu) và **Static** (đoạn lời tĩnh), chạm để mở thẳng trang Lyrics trong app.
- **Công tắc Tắt tối ưu hóa pin (Android)**: Thêm tùy chọn trong *Cài đặt → Chung* tự kiểm tra trạng thái tối ưu hóa pin và mở hộp thoại hệ thống để cấp quyền chạy nền không giới hạn.
- **Ghi đè Metadata & Thumbnail trực tiếp vào tệp gốc**: Lưu thẳng thẻ bài hát và ảnh bìa mới vào file nhạc gốc trên thiết bị qua cầu nối native.
- **Tối ưu luồng Release Notes & đồng bộ Service Worker**: Chuẩn hóa xử lý xuống dòng ghi chú phát hành APK và cập nhật cache version mới.
