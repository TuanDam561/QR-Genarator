# QR Generator

Trang tạo và quét QR bằng tiếng Việt, chạy hoàn toàn trên trình duyệt.

Website: https://tuandam561.github.io/QR-Genarator/

## Sử dụng

- Nhập link hoặc văn bản, chọn **Tạo QR**, rồi **Tải QR xuống (PNG)**.
- Tab **Tạo nhiều QR**: dán các link bắt đầu bằng `http://`, `https://` hoặc `www.`, cách nhau bằng xuống dòng, khoảng trắng, dấu phẩy hoặc chấm phẩy. Trang tự bỏ link trùng và thêm `https://` cho link bắt đầu bằng `www.`. Tối đa 100 link mỗi lần.
- Mỗi mã có nút tải PNG riêng; **Tải tất cả (.zip)** tải các ảnh đã tạo thành công cùng `links.txt` để đối chiếu tên ảnh với đường link. Link quá dài bị lỗi sẽ được đánh dấu riêng.
- Đọc QR bằng cách chọn ảnh, kéo thả ảnh vào vùng quét hoặc dán ảnh bằng **Ctrl + V / ⌘ + V**.
- Nút **Dán ảnh từ bộ nhớ tạm** hoạt động khi trình duyệt hỗ trợ và cho phép đọc clipboard. Nếu không, dùng phím tắt hoặc chọn tệp.
- Kết quả có nút **Sao chép** và **Mở link** (chỉ hiện cho HTTP/HTTPS). Trang không tự mở link được quét.
- Ảnh được xử lý trên thiết bị, không gửi lên máy chủ. Mỗi lần đọc một mã QR; ảnh tối đa 20 MB và 40 triệu pixel. Nếu QR quá nhỏ trong ảnh lớn, hãy cắt vùng QR rồi thử lại.

## Đưa lên GitHub Pages

1. Đẩy `index.html`, `style.css`, `app.js`, `batch.js` và toàn bộ thư mục `vendor/` lên repository cùng lúc. Giữ mã phiên bản trong các đường dẫn CSS/JS để tránh dùng tài nguyên cũ từ cache.
2. Trong repository, vào **Settings → Pages → Deploy from a branch**.
3. Chọn nhánh chứa mã nguồn (ví dụ `main`) và thư mục **/ (root)**, rồi **Save**.
4. Mở địa chỉ GitHub Pages sau khi triển khai xong.

Không cần backend, API key, npm hay bước build. Đường dẫn tài nguyên tương đối nên dùng được cả Pages của project. Các thư viện được lưu trong repository, không cần CDN lúc sử dụng.

## Chạy thử tại máy

Chạy `python -m http.server 8080` trong thư mục dự án, rồi mở http://localhost:8080. Nút đọc clipboard cần HTTPS hoặc localhost và tùy quyền trình duyệt.

## Thư viện

- [QRCode.js 1.0.0](https://github.com/davidshimjs/qrcodejs) — MIT, giấy phép tại `vendor/qrcode-LICENSE.txt`.
- [jsQR 1.4.0](https://github.com/cozmo/jsQR) — Apache-2.0, giấy phép tại `vendor/jsQR-LICENSE.txt`.
- [JSZip 3.10.1](https://stuk.github.io/jszip/) — MIT hoặc GPLv3, dùng theo MIT; giấy phép tại `vendor/jszip-LICENSE.txt`.

Ghi chú: bản QRCode.js đi kèm đã sửa bộ mã hóa byte sang UTF-8 bằng `TextEncoder` để tạo QR đúng với tiếng Việt và emoji.

## Kiểm tra

Chạy `node tests/batch.test.cjs` để kiểm tra tách link, tạo/đọc QR, nội dung ZIP và thao tác tạo nhiều mã. Không cần cài thêm gói npm.
