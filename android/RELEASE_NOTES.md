# Ghi chú phát hành bản Android
# (Quy trình GitHub Actions tự động dùng nội dung tệp này làm release notes; để trống thì lấy 20 commit gần nhất.)
- **Hiệu ứng mở trình phát đầy đủ từ Sheet phát nhanh (`QuickPlayActivity`)**: khi bấm *Mở trình phát đầy đủ*, nội dung trong sheet mờ dần ẩn đi để giữ lại khối màu nền, sau đó phóng to mượt phủ kín toàn màn hình rồi chuyển thẳng vào ứng dụng chính.
- **Tối ưu bảng Thông tin trên Sheet phát nhanh**: ẩn mục *File Path* khỏi thẻ thông tin trong sheet xem trước tệp cho gọn gàng (ứng dụng chính vẫn giữ nguyên).
- **Cập nhật WebView & điều hướng Back**: tự động đổi màu chủ đạo theo ảnh bìa ngay khi quét xong giữa chừng, chặn xóa bài đang phát kèm toast thông báo, và hỗ trợ nút/cử chỉ Back cùng Predictive Back cho Bottom Sheet bài hát và Metadata Editor (nhắc xác nhận nếu có thay đổi chưa lưu).
