# Website thi Tin học 10 – Cloudflare Pages + D1

## 1. Chuẩn bị
- Tài khoản Cloudflare; máy tính có Node.js và npm.
- Cài Wrangler: `npm install -g wrangler` rồi `wrangler login`.
- Dùng Cloudflare Pages **có Functions**, không tải riêng file HTML lên Pages Direct Upload (vì cần API và D1).

## 2. Tạo D1 và cấu hình
Tại thư mục dự án:

```bash
wrangler d1 create tin10-exam
```

Chép `database_id` trả về vào `wrangler.toml` thay cho `THAY_DATABASE_ID_TAI_DAY`.

```bash
wrangler d1 execute tin10-exam --remote --file=./schema.sql
```

## 3. Triển khai Pages
Cách dễ nhất là đẩy toàn bộ thư mục dự án lên GitHub, trong Cloudflare chọn Workers & Pages → Create → Pages → Connect to Git. Thiết lập:
- Framework preset: None
- Build command: để trống
- Build output directory: `public`
- Root directory: thư mục dự án (nếu repo chứa trực tiếp các file thì để trống)
- Trong Pages project → Settings → Functions → D1 database bindings: thêm binding tên chính xác **DB**, chọn `tin10-exam`.
- Trong Settings → Variables and Secrets: thêm 2 **secret**: `ADMIN_PASSWORD` (mật khẩu mạnh, không dùng lại mật khẩu khác), `SESSION_SECRET` (chuỗi bí mật ngẫu nhiên dài ít nhất 24 ký tự, khuyến nghị 48+).
- Redeploy sau khi cấu hình binding và secrets. Nếu có lựa chọn production/preview, đặt ở production và preview phù hợp.

**Lưu ý:** Pages Functions được nhận diện khi triển khai từ Git repository. Nếu dùng lệnh CLI, dùng `wrangler pages deploy public --project-name <ten-project>` và đảm bảo Functions + bindings được triển khai theo đúng cấu hình Pages của tài khoản. Khuyến nghị dùng Git integration để giảm lỗi.

## 4. Sử dụng
1. Truy cập website → Giáo viên → đăng nhập bằng `ADMIN_PASSWORD`.
2. Chọn thời gian mở ca và thời gian làm bài → Mở ca mới.
3. Học sinh nhập họ tên, lớp và mã học sinh duy nhất do giáo viên cấp (ví dụ 10A01).
4. Khi đang làm, câu trả lời tự động lưu lên D1; học sinh có thể tải lại trên cùng trình duyệt.
5. Giáo viên xem tiến độ, kết thúc ca, chấm 3 câu tự luận, xuất CSV UTF-8 mở bằng Excel.
6. **Xuất CSV trước khi mở ca mới**; dữ liệu ca cũ vẫn nằm trong D1 nhưng giao diện chỉ hiện ca hiện hành.

## 5. Quy ước điểm
- Trắc nghiệm: 20 câu × 0,2 = tối đa **4 điểm**.
- Tự luận: 3 câu × 2 = tối đa **6 điểm**.
- Tổng: 10 điểm. Đây là tỷ trọng mặc định của bản triển khai, cần điều chỉnh nếu ma trận đề của trường khác.

## 6. Giới hạn cần biết
- Mã học sinh là mã tự khai, không phải xác thực danh tính. Nên phát mã riêng, giám sát phòng thi. Nếu cần xác thực nghiêm ngặt, tích hợp danh sách học sinh/mã truy cập một lần.
- Mỗi mã chỉ được thi một lần trong một ca, nhưng người khác có thể nhập mã đó trước nếu biết mã.
- Việc làm bài được lưu theo nhịp nhập và yêu cầu kết nối Internet; **không phải chế độ thi offline**.
- Khi kết thúc thời gian, server chốt bài đã lưu gần nhất. Thao tác cuối cùng chưa đồng bộ có thể không được tính.
- Giáo viên nên sao lưu D1 định kỳ, kiểm thử 2–3 thiết bị trước khi thi thật.
- CSV mở được bằng Excel; đây không phải tệp XLSX.
- Chưa có giám sát chuyển tab, giám sát camera, ngân hàng đề nhập Excel, hoặc mã truy cập riêng cho từng học sinh.

## 7. Kiểm thử
- Chưa mở ca: học sinh không thể bắt đầu.
- Mở ca: 2 thiết bị có 2 mã khác nhau cùng làm.
- Tải lại trang giữa bài: đáp án đã lưu được khôi phục.
- Nộp bài: không thể làm lại cùng mã trong cùng ca.
- Giáo viên: theo dõi tiến độ, chấm điểm tự luận, xuất CSV.
- Đóng ca: bài chưa nộp được chốt theo dữ liệu đã lưu.

