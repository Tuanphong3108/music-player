# 🎵 Music Player (MD3 Expressive)

> Một trình phát nhạc cục bộ (Client-side) hiện đại, mượt mà và giàu tính năng được xây dựng trên nền tảng giao diện **Material Design 3 Expressive**. Trải nghiệm nghe nhạc đỉnh cao ngay trên trình duyệt mà không cần cài đặt phần mềm phức tạp hay lo lắng về quyền riêng tư.

---

## 📸 Trải nghiệm

* 🌐 **Live App:** [music-player](https://tuanphong3108.github.io/music-player/) *(Hoạt động 100% Offline sau khi tải xong)*

---

## 🌟 Tính năng nổi bật

### 🎧 Trình phát nhạc & Quản lý danh sách
* **Hoàn toàn Cục bộ (100% Offline & Client-side):** Tất cả dữ liệu bài hát, metadata và lyrics được xử lý trực tiếp trên thiết bị của bạn, bảo mật tuyệt đối.
* **Kéo & Thả (Drag & Drop):** Thêm bài hát hoặc cả thư mục nhạc nhanh chóng chỉ bằng thao tác kéo thả.
* **Hỗ trợ PWA (Progressive Web App):** Cài đặt trực tiếp lên Windows/Android/macOS như một ứng dụng độc lập, hỗ trợ mở file trực tiếp từ hệ thống.
* **Bộ lọc & Tìm kiếm thông minh:** Tìm kiếm bài hát, nghệ sĩ, album siêu tốc với khả năng tự động bỏ qua dấu tiếng Việt và ký tự đặc biệt.

### 📝 Trình chỉnh sửa Tag & Metadata MP3 mạnh mẽ
* **Chỉnh sửa trực tiếp:** Thay đổi Tên bài hát, Nghệ sĩ, Album, Thể loại, Năm phát hành và Lời bài hát (Lyric).
* **Quản lý Bìa đĩa (Cover Art):** Hỗ trợ xem, tải xuống, thay thế, cắt vuông (Crop) hoặc xoay ảnh bìa đĩa trực tiếp.
* **Ghi đè File thật:** Tích hợp *File System Access API* cho phép lưu trữ và ghi đè trực tiếp thông tin vừa sửa vào file `.mp3` trên ổ cứng của bạn mà không cần tải lại file mới.

### 🎤 Đồng bộ Lời bài hát (Lyrics) & Chế độ xem
* **Karaoke Sync (LRC Format):** Đồng bộ và cuộn lời bài hát theo thời gian thực với hiệu ứng mượt mà.
* **Picture-in-Picture (PiP):** Bật cửa sổ phát nhạc nổi để vừa làm việc khác vừa theo dõi bài hát/bìa đĩa.
* **Full Screen Mode:** Chế độ xem toàn màn hình tối giản, tập trung tối đa vào trải nghiệm âm nhạc và visualizer.

### 🎨 Giao diện & Hiệu năng đỉnh cao
* **Material Design 3 Expressive:** Thiết kế hiện đại, màu sắc tự động linh hoạt, hiệu ứng tương tác (Ripple Effect, Overshoot Animation) cực bắt mắt.
* **Chế độ Theme linh hoạt:** Hỗ trợ Tối (Dark), Sáng (Light) hoặc Tự động theo hệ thống.
* **Tối ưu máy cấu hình yếu:** Tùy chọn tắt/bật hiệu ứng chuyển động (*Reduce Motion*) và giảm độ mờ (*Blur Effect*) giúp ứng dụng mượt mà trên mọi thiết bị.

---

## ⌨️ Phím tắt điều khiển (Shortcuts)

| Phím tắt | Thao tác |
| :--- | :--- |
| **`Space`** | Tạm dừng / Tiếp tục phát nhạc |
| **`←` / `→`** | Tua lùi / Tua tiến 5 giây |
| **`Shift` + `←` / `→`** | Chuyển bài hát Trước / Tiếp theo |
| **`↑` / `↓`** | Tăng / Giảm 5% âm lượng |
| **`Ctrl` + `O`** | Mở hộp thoại chọn file nhạc từ máy tính |
| **`M`** | Tắt / Bật âm thanh (Mute / Unmute) |
| **`F`** | Bật / Tắt chế độ Toàn màn hình (Full Screen) |

---

## 🛠️ Công nghệ sử dụng

* **UI Framework & Core:** HTML5, Tailwind CSS, Google Sans Flex Font.
* **Design System:** Material Web Components (`@material/web` - MD3 Expressive).
* **Metadata Processor:** `jsmediatags` (đọc ID3 tags) & `browser-id3-writer` (ghi & sửa ID3 tags).
* **Audio Engine:** Web Audio API & HTML5 Audio.

---

## 🚀 Hướng dẫn cài đặt

Không cần Node.js hay Build tool phức tạp, bạn có thể chạy dự án chỉ trong vài giây:
- Hãy truy cập [Audio Player](https://tuanphong3108.github.io/music-player/)
- Tìm trên góc bên cạnh nút Settings để tìm nút Install
- Nhấn vào icon Install > Cài đặt
- Đã xong, bạn có thể trải nghiệm ngay lập tức

---



1. **Clone repository:**
   ```bash
   git clone [https://github.com/Tuanphong3108/music-player.git](https://github.com/Tuanphong3108/music-player.git)
