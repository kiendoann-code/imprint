# ImPrint — VS Code và GitHub

Bộ mã nguồn frontend và backend của ImPrint, kèm server phát triển cho Windows. Không cần khóa OpenAI, PostgreSQL hoặc pgAdmin để chạy bản này.

## 1. Chuẩn bị

Cần Node.js 24, Git và VS Code. Trong PowerShell, kiểm tra:

```powershell
node --version
npm.cmd --version
git --version
```

Node cần hiện `v24.x.x`. Nếu chưa có, tải Node.js 24 tại https://nodejs.org/en/download và Git tại https://git-scm.com/downloads/win. Cài xong đóng/mở lại VS Code.

## 2. Giải nén và mở thư mục

Giải nén `ImPrint-VSCode.zip` vào `C:\Projects`. Thư mục cần có dạng `C:\Projects\ImPrint-VSCode\package.json`.

Trong VS Code: **File → Open Folder → C:\Projects\ImPrint-VSCode → Select Folder**. Chọn **Terminal → New Terminal**, rồi chạy:

```powershell
cd C:\Projects\ImPrint-VSCode
npm.cmd ci
npm.cmd run dev
```

Chờ terminal hiện `ImPrint: http://localhost:3000`. Mở **http://localhost:3000** bằng Chrome hoặc Edge. Giữ terminal chạy trong lúc dùng website.

Không mở `src/index.html` trực tiếp hoặc bằng Live Server: đây là mã giao diện đầu vào, bản hoạt động cần build và backend. Build thay dữ liệu ảnh nhúng thành tài nguyên tĩnh và nối giao diện với API.

## 3. Kiểm tra tính năng

Ở chế độ khách: đăng ký tài khoản thử bằng email khác `admin@imprint.local`, chọn sản phẩm/màu/size, thiết kế, xác nhận, thêm giỏ và đặt hàng COD thử. Tải lại trang để kiểm tra dữ liệu được giữ.

Xem trạng thái backend tại **http://localhost:3000/api/health**. Kết quả cần có `"ok":true`, `"database":true`, `"files":true`.

Để thử quản trị:

1. Tại terminal đang chạy server, nhấn **Ctrl+C**.
2. Chạy:

```powershell
npm.cmd run dev:admin
```

3. Mở **http://localhost:3000/?admin=1**. Bạn có quyền quản trị để thử sửa sản phẩm, chương trình sale, mã giảm giá, feedback và bộ sưu tập.
4. Muốn trở lại tài khoản khách: **Ctrl+C → npm.cmd run dev**, tải lại trang.

Chế độ `dev:admin` chỉ dùng trên máy cá nhân. Server chỉ lắng nghe tại `127.0.0.1`; mọi yêu cầu trong chế độ này có quyền quản trị. Không dùng đường hầm internet, không triển khai server này làm production. Bản live hiện tại vẫn xác thực quản trị qua tài khoản chủ website.

Dữ liệu thử nằm trong `.local-data/imprint.sqlite`; ảnh upload nằm trong `.local-data/uploads`. Tắt/mở server không mất dữ liệu. Đây là dữ liệu riêng, không lấy hay thay đổi khách hàng/đơn hàng trên website live. Toàn bộ đơn hàng localhost là đơn thử, không gửi hãng vận chuyển hoặc thu tiền.

## 4. Tạo repository GitHub

Vào **https://github.com/new**, đăng nhập tài khoản của bạn.

- Repository name: `ImPrint`.
- Chọn **Private** nếu muốn giữ mã và ảnh thương hiệu riêng tư.
- Không khởi tạo README, `.gitignore` hoặc license; các file cần thiết đã có trong bộ mã.
- Bấm **Create repository**.
- Sao chép URL HTTPS của repository, ví dụ `https://github.com/TEN_TAI_KHOAN/ImPrint.git`.

Trong terminal VS Code tại thư mục dự án:

```powershell
git init
git branch -M main
git add .
git status
git commit -m "Initial ImPrint frontend and backend"
git remote add origin https://github.com/TEN_TAI_KHOAN/ImPrint.git
git push -u origin main
```

Thay `TEN_TAI_KHOAN` bằng tên GitHub thực tế hoặc dán nguyên URL đã sao chép. Nếu terminal chạy server, mở terminal thứ hai bằng dấu **+** trong bảng Terminal.

Nếu Git báo chưa có tên/email, chạy rồi thực hiện lại lệnh commit:

```powershell
git config user.name "Tên của bạn"
git config user.email "Email dùng trên GitHub"
```

Nếu Git yêu cầu đăng nhập, hoàn thành đăng nhập GitHub trong trình duyệt. Không dùng khóa OpenAI làm mật khẩu/token GitHub. Sau khi push thành công, tải lại trang repository: cần thấy `src`, `scripts`, `db`, `drizzle`, `tests`, `package.json` và README.

## 5. Chỉnh sửa và cập nhật

- `src/index.html`: bố cục, CSS và công cụ thiết kế.
- `src/client-api.js`: giao diện kết nối backend, đăng nhập, giỏ và trang quản trị.
- `src/backend.mjs`: API, xác thực khách, quyền truy cập, đơn hàng, sản phẩm và tệp upload.
- `src/seed.json`: sản phẩm và nội dung mặc định khi database mới được tạo.
- `db/schema.ts` và `drizzle/`: cấu trúc dữ liệu và migrations.
- `scripts/local-server.mjs`: bộ chạy thử Node.js + SQLite + tệp trên máy.
- `scripts/build.mjs`: đóng gói Worker và tài nguyên; không sửa trực tiếp `dist`.

Sau khi sửa code: dừng server bằng **Ctrl+C**, chạy lại `npm.cmd run dev` hoặc `npm.cmd run dev:admin`, rồi tải lại trình duyệt. Server chưa có tự động reload.

Đổi `seed.json` không ghi đè database đã khởi tạo. Sửa nội dung đang lưu bằng trang quản trị. Muốn bắt đầu thử hoàn toàn mới, hãy sao lưu `.local-data`, dừng server, rồi đổi tên thư mục đó; server lần sau sẽ tạo bộ dữ liệu mới.

Kiểm tra backend:

```powershell
npm.cmd test
```

Lưu thay đổi lên GitHub:

```powershell
git add .
git commit -m "Update ImPrint"
git push
```

`.gitignore` đã loại thư viện cài đặt, bản build, dữ liệu thử và các file môi trường chứa bí mật. Không thêm khóa API vào code. Không có khóa OpenAI trong bộ mã này.

## 6. GitHub và xuất bản website

GitHub lưu mã nguồn; push chưa tự cập nhật website. Xem `CLOUDFLARE.md` để tạo R2, áp dụng database migration, xuất bản bằng Wrangler và đặt mật khẩu quản trị cho hosting riêng.

Cấu hình `wrangler.jsonc` đã có database ID của bạn và các binding `DB`, `BUCKET`, `ASSETS`. Build Cloudflare dùng Static Assets cho ảnh/font/video, backend xử lý API và phiên đăng nhập email/mật khẩu. Bản hosting trước vẫn giữ nguyên.

## 7. Lỗi thường gặp

- PowerShell chặn `npm.ps1`: dùng các lệnh **npm.cmd** như hướng dẫn, không cần đổi Execution Policy.
- `ENOENT ... package.json`: terminal đang sai thư mục. Chạy `cd C:\Projects\ImPrint-VSCode` rồi thử lại.
- `EADDRINUSE`: cổng 3000 có server đang chạy. Dừng terminal cũ bằng Ctrl+C.
- `node:sqlite` không có: kiểm tra `node --version`, dùng Node.js 24.
- `ExperimentalWarning: SQLite`: thông báo của Node; nếu server vẫn mở và health OK, bạn có thể tiếp tục thử.
- Đăng nhập ChatGPT quản trị không hoạt động localhost: chạy `npm.cmd run dev:admin` như bước 3.
- Ảnh/đăng nhập không hoạt động khi mở file: dùng `http://localhost:3000`, không mở HTML riêng.

## Tài liệu chính thức

- Node.js SQLite: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- Đưa mã nguồn lên GitHub: https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github
