<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Khôi phục đúng trạng thái phát/tạm dừng thực tế & đặt tạm dừng khi thoát/crash**: chỉ tự tiếp tục phát khi `NativeAudio` đang thực sự phát (`pwr = true` và `ready`/`buffering`), còn khi đang tạm dừng hoặc sau khi người dùng đóng app ở nền / app gặp sự cố thì luôn đặt trạng thái về tạm dừng sạch sẽ.
