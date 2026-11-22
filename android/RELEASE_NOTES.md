<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Tự động quét & phát toàn bộ nhạc trên thiết bị**: Cấp quyền truy cập âm thanh (`READ_MEDIA_AUDIO`) để ứng dụng tự động quét toàn bộ thư viện nhạc nội bộ (hỗ trợ phát stream trực tiếp tiết kiệm RAM, tự ghép file lời `.lrc` cùng tên và lọc thư mục loại trừ).
- **Màn hình Getting Started mới cho Android (Material 3 Expressive)**: Hướng dẫn thiết lập từng bước trực quan lấy cảm hứng từ PixelPlayer (cấp quyền nhạc, thông báo, chọn thư mục loại trừ, chọn giao diện Sáng/Tối/Hệ thống, tối ưu hóa pin) với nút điều hướng morphing & xoay mượt mà.
- **Hộp thoại tiến trình chia sẻ tệp**: Hiển thị bottom sheet với vòng xoay tải và cập nhật trạng thái trực tiếp từ Android (`Đang xác định vị trí tệp...` -> `Đang chuẩn bị tệp...` -> `Đang chia sẻ...`).
- **Widget Android gọn sạch hơn**: Loại bỏ dòng chú thích nguồn `"Lyric by ... • Lyric powered by LRCLIB"` trên cả **Lyrics Widget** lẫn **Media Widget**.
