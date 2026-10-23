# Bot MT5 mẫu trên VPS Ubuntu

Đây là mã nguồn EA và bộ lệnh triển khai, chưa phải bot đã được cài trên VPS.
Chưa có quyền truy cập VPS để kiểm thử Wine, biên dịch MQL5 hay backtest.

## Yêu cầu

- VPS Ubuntu x86_64, tài khoản thường có quyền sudo, truy cập SSH.
- Phần mềm VNC Viewer trên máy cá nhân để cài MT5 và đăng nhập lần đầu.
- Tài khoản MT5 **demo** tại broker. Không gửi mật khẩu vào chat.

MT5 chạy bằng Wine và vẫn cần màn hình ảo. Không có bản MT5 terminal Linux thuần
chạy giao dịch trực tiếp chỉ bằng dòng lệnh. Sau bước cài/đăng nhập qua VNC,
có thể khởi động EA qua SSH. Bộ này dùng tmux, tiếp tục chạy khi ngắt SSH;
chưa cấu hình tự khởi động sau khi reboot.

## 1. Tải repo trên VPS

Đăng nhập SSH bằng tài khoản thường có sudo. Trên VPS chạy:

```sh
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/tinhha7949/scan-binance.git mt5-bot
cd ~/mt5-bot
bash prepare.sh
```

Các bước dưới giả định repo ở `~/mt5-bot`.
Nếu chỉ có root, tạo tài khoản thường có sudo trước rồi đăng nhập tài khoản đó.
Không chạy Wine bằng root.

## 2. Mở màn hình ảo

Trong SSH:

```sh
tmux new -s mt5-desktop
bash desktop.sh
```

Đặt mật khẩu VNC khi được hỏi. Nhấn Ctrl+B rồi D để rời tmux.
Trên **máy cá nhân**, mở cửa sổ terminal khác, giữ lệnh này chạy:

```sh
ssh -N -L 15901:127.0.0.1:5901 user@IP_VPS
```

VNC Viewer kết nối `127.0.0.1:15901` (một số ứng dụng cần cú pháp
`127.0.0.1::15901`). Không mở cổng VNC trên firewall.

## 3. Cài MT5

Trở lại SSH trên VPS:

```sh
cd ~/mt5-bot
bash mt5.sh install
```

Đây là trình cài chính thức MetaQuotes được tải trong prepare.sh; có thể xem
`downloads/mt5linux.sh` trước khi chạy. Theo dõi VNC để hoàn tất trình cài Wine/MT5.
Chấp nhận Mono/Gecko nếu trình cài yêu cầu. Khi MT5 tự mở, thoát MT5 sau khi cài.

Đường dẫn mặc định của bộ lệnh:

```text
~/.mt5/drive_c/Program Files/MetaTrader 5
```

Nếu bộ cài dùng vị trí khác, đặt đúng hai biến trong **mỗi phiên SSH/tmux**:

```sh
export WINEPREFIX="$HOME/.mt5"
export MT5_DIR="$WINEPREFIX/drive_c/Program Files/MetaTrader 5"
```

Nếu cần reboot theo trình cài, kết nối SSH lại rồi thực hiện lại bước 2.

## 4. Biên dịch, đăng nhập demo và chạy tín hiệu

Đảm bảo MT5 đã thoát trước mỗi lần đổi chế độ hoặc biên dịch.

```sh
cd ~/mt5-bot
bash mt5.sh compile
bash mt5.sh login
```

Trong VNC, đăng nhập tài khoản demo, chọn đúng server của broker và đợi nhận giá.
Chế độ `/portable` dùng cùng thư mục dữ liệu cho mọi lần chạy của bộ này.
Sau khi đăng nhập, thoát MT5 bằng File → Exit. Sau đó:

```sh
cp -n bot.ini.example bot.ini
nano bot.ini
```

Sửa `Symbol=EURUSD` đúng tên broker (ví dụ EURUSDm); giữ `AllowLiveTrading=0`.
Mặc định khung M15. Khởi động:

```sh
tmux new -s mt5-bot
bash mt5.sh run
```

Trong VNC, kiểm tra tab Experts có `Demo EMA ready`, chart đúng mã/khung thời gian
và terminal có giá. Ctrl+B rồi D để tách tmux. Nhật ký tín hiệu ở:

```sh
bash mt5.sh logs
```

Lệnh `run` khởi chạy MT5; cần kiểm tra Experts để xác nhận EA thực sự được nạp.
Nếu EA không khởi động, kiểm tra tên symbol, tài khoản demo và nhật ký terminal.
Không chạy thủ công thêm terminal hoặc gắn thêm EA này vào chart khác.

## 5. Quy tắc bot mẫu

- EMA20 cắt lên EMA50: tín hiệu mua; cắt xuống: tín hiệu bán.
- Chỉ xét hai nến đã đóng; khi vừa gắn/restart, chờ nến tiếp theo.
- Mẫu mặc định **chỉ ghi tín hiệu**, không đặt lệnh.
- Khi bật đặt lệnh demo: lot cố định 0.01, SL 300 point, TP 600 point;
  bỏ qua tín hiệu nếu spread vượt 30 point hoặc lot/SL/TP không phù hợp broker.
- Không mở thêm nếu symbol đang có bất kỳ vị thế/lệnh chờ nào.
- Thoát bằng SL/TP; tín hiệu ngược không đóng vị thế. Không martingale/DCA.
- Point là đơn vị SYMBOL_POINT của broker, không mặc định bằng pip;
  các số mẫu không phù hợp cho mọi sản phẩm, đặc biệt vàng/chỉ số.

Để thử đặt lệnh **demo**, dừng MT5 bằng File → Exit trong VNC. Sửa:

```sh
nano bot.ini
nano "$HOME/.mt5/drive_c/Program Files/MetaTrader 5/MQL5/Presets/UbuntuDemoEMA.set"
```

Đặt `AllowLiveTrading=1` trong bot.ini và `EnableDemoOrders=true` trong file .set
**đã được cài vào thư mục MT5**. Nếu dùng đường dẫn tùy chỉnh, sửa đường dẫn tương ứng.
Khởi động lại bằng `bash mt5.sh run` trong tmux. Xác nhận nút Algo Trading và
quyền của EA trong VNC. EA từ chối tài khoản real/contest ngay cả khi bật hai cờ này.

Đây là ví dụ kỹ thuật chưa kiểm chứng lợi nhuận. Chạy Strategy Tester trong MT5
với dữ liệu và chi phí broker trước khi dùng kết quả cho quyết định giao dịch.

## Dừng và kiểm tra

```sh
tmux attach -t mt5-bot
```

Mở VNC, chọn File → Exit trong MT5 để thoát sạch. Tắt EA/terminal không đóng
vị thế đang mở; SL/TP đã được broker chấp nhận tiếp tục tồn tại ở server.
Để dừng desktop sau khi MT5 đã thoát: `tmux attach -t mt5-desktop`, rồi Ctrl+C.

Không chia sẻ thư mục Wine sau khi đăng nhập vì chứa thông tin tài khoản.

## Tài liệu chính thức

- https://www.metatrader5.com/en/terminal/help/start_advanced/install_linux
- https://www.metatrader5.com/en/terminal/help/start_advanced/start
- https://www.mql5.com/en/docs/standardlibrary/tradeclasses/ctrade

## Cấu trúc mã nguồn

| File | Vai trò |
| --- | --- |
| `UbuntuDemoEMA.mq5` | Điểm vào EA, khởi tạo và điều phối mỗi nến mới |
| `StrategyEMA.mqh` | Tính tín hiệu EMA, không chứa hàm gửi lệnh |
| `OrderExecution.mqh` | Kiểm tra giao dịch, SL/TP, lot, gửi lệnh và xử lý kết quả |
| `BotInputs.mqh` | Tham số đầu vào của bot |
| `UbuntuDemoEMA.set` | Bộ tham số mẫu; bản đang dùng nằm trong MQL5/Presets |
| `prepare.sh`, `desktop.sh`, `mt5.sh` | Cài đặt và vận hành Ubuntu/Wine |

Để đổi chiến lược, sửa `StrategyEMA.mqh`. Để đổi cách đặt lệnh/quản lý lệnh,
sửa `OrderExecution.mqh`. Sau mỗi lần sửa mã, thoát MT5, biên dịch lại và chạy lại.
Đây là bot MT5 mới thay thế toàn bộ nội dung bot quét Binance trước đây;
chiến lược EMA là ví dụ tạm thời, không chuyển đổi chiến lược Binance cũ.
