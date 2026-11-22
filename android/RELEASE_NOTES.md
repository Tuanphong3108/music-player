<!-- Ghi nội dung cập nhật cho bản build APK tiếp theo tại đây (hỗ trợ Markdown). Mỗi lần cập nhật Android, nội dung mới sẽ được ghi vào file này trước khi push để GitHub Release hiển thị đúng changelog thật! -->
### Có gì mới trong bản cập nhật Android này
- **Quét đầy đủ 100% nhạc trên máy (MediaStore + Quét trực tiếp bộ nhớ)**: Không còn bị mất bài hay chỉ hiện 1–2 bài khi MediaStore của Android/ChromeOS chưa kịp lập chỉ mục tệp nhạc.
- **Hiển thị tức thì đầy đủ Metadata & Album Art ngay tại danh sách ngoài**: Tự động đọc trực tiếp thẻ nhúng (`MediaMetadataRetriever`) ngay trong lúc quét đối với các bài mà MediaStore trả về `UNKNOWN ARTIST` hoặc thiếu ảnh bìa, không cần bấm phát mới hiện.
- **Tăng thời gian chờ tự động tải lại lên 25 giây** và hỗ trợ **Android Photo Picker** khi chọn ảnh bìa Playlist / Thumbnail.
