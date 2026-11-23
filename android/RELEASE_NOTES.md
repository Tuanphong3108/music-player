<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Chỉ hỗ trợ Google Gemini & tải mô hình động theo API Key**: bỏ các nhà cung cấp khác, giữ mục chọn mô hình trống cho tới khi nhập Gemini API Key để gọi trực tiếp danh sách mô hình hỗ trợ `generateContent` cho người dùng chọn qua bottom sheet.
- **Đồng bộ luồng điều khiển MediaSession & trạng thái khôi phục**: chuẩn hóa luồng nhận lại bài từ trình phát native để không kẹt vòng tròn xoay khi mở lại app sau khi bấm Next/Previous ở nền.
