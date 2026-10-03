# Xuất bản ImPrint lên tài khoản Cloudflare của bạn

Database đã tạo: `imprint-db`, ID `a8cad2d0-fb18-43ff-bbb3-b6fa6d92bb10`. Cấu hình dùng binding `DB`, vì backend truy cập `env.DB`.

## Cài bản cập nhật

Lưu `ImPrint-Cloudflare-Patch.zip` vào Downloads. Mở PowerShell tại `C:\Projects\ImPrint-VSCode`, dừng server cũ bằng Ctrl+C nếu đang chạy.

```powershell
cd C:\Projects\ImPrint-VSCode
$imprintBackup = ".cloud-backup\$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Force $imprintBackup | Out-Null
Copy-Item src, scripts, tests, package.json, package-lock.json, .gitignore -Destination $imprintBackup -Recurse -Force
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\ImPrint-Cloudflare-Patch.zip" -DestinationPath . -Force
npm.cmd ci
npm.cmd test
```

Patch chỉ thay backend/kết nối API, thêm cách build và cấu hình Cloudflare. Không thay `src/index.html` hoặc ảnh/seed sản phẩm của bạn. Bản backup chứa source cũ, được loại khỏi Git. Kiểm tra kết quả test: cần 4 bài test đều pass.

## Tạo nơi lưu ảnh

Trong Cloudflare Dashboard, mở **R2 Object Storage**. Nếu chưa kích hoạt R2, hoàn thành bước đăng ký theo hướng dẫn Cloudflare. R2 có hạn mức miễn phí và có thể tính phí theo sử dụng vượt hạn mức; đọc điều kiện hiện trên màn hình trước khi kích hoạt. Thông tin thanh toán nhập trực tiếp tại Cloudflare.

Tạo bucket bằng terminal:

```powershell
npx.cmd wrangler r2 bucket create imprint-uploads
```

Nếu đã có bucket cùng tên, dùng bucket đó. Không bật public access hoặc r2.dev: backend kiểm tra quyền xem ảnh riêng của khách qua `/api/files/...`.

## Khởi tạo các bảng

```powershell
npm.cmd run db:migrate
```

Lệnh này áp dụng migration lên database Cloudflare (`--remote`). Nếu được hỏi xác nhận, kiểm tra đúng `imprint-db` rồi nhập `y`. Cấu hình đọc migration trong `drizzle`; không đổi tên hay sửa migration đã áp dụng.

## Xuất bản

Kiểm tra `wrangler.jsonc`: `ADMIN_EMAIL` đang là `kienchimto57@gmail.com`, được dùng cho tài khoản quản trị. Nếu muốn email khác, sửa giá trị này trước khi deploy.

```powershell
npm.cmd run deploy
```

Lệnh build tách 55 tài nguyên ảnh/font/video ra Static Assets và đóng gói backend riêng. Khi thành công, Wrangler trả URL dạng `https://imprint-store.<ten-tai-khoan>.workers.dev`. Nếu được hỏi khởi tạo subdomain workers.dev, chọn tên phù hợp và làm theo hướng dẫn terminal.

Sau lần deploy đầu tiên, trang khách hoạt động nhưng tài khoản quản trị chưa dùng được cho đến khi đặt secret.

## Đặt mật khẩu quản trị

```powershell
npx.cmd wrangler secret put ADMIN_PASSWORD
```

Tại prompt nhập secret, nhập hoặc dán mật khẩu **14–128 ký tự**, nên dùng mật khẩu riêng và khó đoán. Enter để lưu. Giá trị không ghi vào code/GitHub. Không gửi mật khẩu qua chat. Lệnh lưu secret đồng thời xuất bản một phiên bản Worker mới.

Mở `https://imprint-store.<ten-tai-khoan>.workers.dev/#admin`, bấm **Đăng nhập quản trị**, dùng email trong `wrangler.jsonc` và mật khẩu vừa đặt.

Backend không tin header `oai-authenticated-user-email` trên bản Cloudflare này. Quyền quản trị đến từ phiên đăng nhập server; đăng xuất hoặc thay secret làm phiên tương ứng hết hiệu lực. Không có tài khoản admin mặc định với mật khẩu có sẵn.

## Kiểm tra website live

- `/api/health`: có `"ok":true`, `"database":true`, `"files":true`.
- Khách có thể đăng ký, đăng nhập lại, chọn màu áo, thiết kế, lưu ảnh và gửi đơn thử COD.
- Quản trị thấy đơn thử, cập nhật trạng thái, sửa sản phẩm/nội dung và upload ảnh feedback/bộ sưu tập.
- Trình duyệt khách tải lại thấy nội dung đã cập nhật; đăng xuất quản trị không còn được sửa nội dung.

Database mới không có khách hàng, ảnh upload hoặc đơn hàng của website hosting trước. Nội dung mặc định được khởi tạo từ `seed.json`. COD chưa có kết nối thanh toán online hoặc hãng vận chuyển.

## Lưu cấu hình lên GitHub

```powershell
git add .
git status
git commit -m "Configure Cloudflare deployment and admin login"
git push
```

Không đưa `.env`, `.dev.vars`, `.local-data` hoặc `.cloud-backup` lên GitHub. `.gitignore` đã loại các mục này. Chỉ push mã không tự deploy; mỗi lần muốn cập nhật website, chạy `npm.cmd run deploy`. Có thể thiết lập tự triển khai từ GitHub sau khi bản này hoạt động ổn.

## Localhost

`npm.cmd run dev` vẫn chạy chế độ khách trên `http://localhost:3000`; `npm.cmd run dev:admin` vẫn chạy chế độ quản trị thử. Server Node localhost không dùng làm production. Build Cloudflare không thay dữ liệu SQLite thử trên máy.

## Tài liệu

- R2: https://developers.cloudflare.com/r2/get-started/
- Migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Static Assets: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
