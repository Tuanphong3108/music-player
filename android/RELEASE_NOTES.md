<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Sửa triệt để lỗi khôi phục khi mở lại sau đóng/sập app**: tách bạch hoàn toàn giữa phiên **live** trên ExoPlayer và bản lưu dự phòng `SharedPreferences` (`fromBackup=true`), lưu thêm đường dẫn tệp gốc (`curLoc`) để khớp đúng bài không bị lệch ID giữa các lần chạy, tự nạp lại hàng đợi tạm (kèm thứ tự Shuffle), nạp tệp thật vào ExoPlayer, tua đúng vị trí cũ và luôn giữ trạng thái **Pause**.
