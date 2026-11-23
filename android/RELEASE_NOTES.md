<!-- Chỉ ghi nội dung thay đổi của BẢN CẬP NHẬT HIỆN TẠI tại đây (xóa sạch ghi chú của các bản cũ trước khi push). -->
### Có gì mới trong bản cập nhật Android này
- **Bổ sung cờ `shuffle=true/false` xuyên suốt Native & WebView**: thêm `setShuffleEnabled()` / `isShuffleEnabled()` trong `NativeAudio` cùng cầu nối `nativeAudioSetShuffle(boolean)` / `nativeAudioGetShuffle()` trên `AndroidBridge`, đồng bộ tức thì mỗi khi bật/tắt hoặc đổi lại Shuffle.
