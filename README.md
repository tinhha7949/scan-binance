# Khung MT5 trên VPS Ubuntu

Repo chỉ chứa phần cài đặt, chạy MT5 và lớp gửi lệnh tới broker.
**Chưa có chiến lược, tín hiệu hay logic tự động vào/thoát lệnh.**
Khi chạy, EA chỉ ghi trạng thái kết nối mỗi 30 giây. Không có lệnh giao dịch thử.

## Các file chính

| File | Chức năng |
| --- | --- |
| `MT5Core.mq5` | Khởi tạo EA, kiểm tra kết nối, chỗ để nối chiến lược sau này |
| `TradeExecution.mqh` | Hàm gửi lệnh thị trường BUY/SELL và kiểm tra yêu cầu theo broker |
| `bot.ini.example` | Cấu hình khởi chạy terminal |
| `prepare.sh` | Cài tiện ích Ubuntu và tải trình cài MT5 chính thức |
| `desktop.sh` | Màn hình ảo và VNC chỉ truy cập qua SSH tunnel |
| `mt5.sh` | Cài MT5, biên dịch, đăng nhập, chạy và tìm nhật ký |

`TradeExecution.mqh` không quyết định mua/bán lúc nào. Hàm `SubmitMarket` chỉ được
dùng khi bổ sung chiến lược; hiện không có nơi nào gọi hàm này. Người gọi sau này
phải cung cấp chiều lệnh, lot, SL/TP theo giá tuyệt đối. SL/TP bằng 0 nghĩa là
không gửi mức dừng/chốt lời. Hàm trả true khi broker chấp nhận yêu cầu;
chiến lược sau này phải theo dõi deal/vị thế và trường hợp khớp một phần.

Không có ràng buộc chỉ demo trong lớp gửi lệnh. Tài khoản thực/demo phụ thuộc
đăng nhập terminal. Mặc định `EnableOrders=false` trong EA và `AllowLiveTrading=0`
trong cấu hình. Bật các cờ này cũng không phát sinh lệnh vì chưa có chiến lược.

## Yêu cầu

VPS Ubuntu x86_64, tài khoản thường có sudo, SSH và VNC Viewer trên máy cá nhân.
MT5 dùng Wine và màn hình ảo; cần mở VNC để hoàn tất cài đặt và đăng nhập lần đầu.
Không chạy Wine bằng root. Không mở cổng VNC ra Internet.

## 1. Tải repo

Trên VPS, bằng tài khoản thường có sudo:

```sh
sudo apt-get update
sudo apt-get install -y git
cd ~
git clone https://github.com/tinhha7949/scan-binance.git mt5-core
cd ~/mt5-core
bash prepare.sh
```

Nếu đã có bản clone cũ trong thư mục khác, cập nhật hoặc clone mới vào một thư mục
chưa tồn tại. Không dùng lại EA EMA đã cài vào MT5 trước đây: thoát terminal cũ
và gỡ EA cũ khỏi chart trước khi chạy bộ này.

## 2. Màn hình ảo

Trong SSH trên VPS:

```sh
cd ~/mt5-core
tmux new -s mt5-desktop
bash desktop.sh
```

Đặt mật khẩu VNC khi được hỏi. Ctrl+B rồi D để tách tmux.
Trên máy cá nhân, giữ cửa sổ terminal này chạy, thay user/IP thật:

```sh
ssh -N -L 15901:127.0.0.1:5901 user@IP_VPS
```

VNC Viewer kết nối `127.0.0.1:15901` (một số viewer dùng `127.0.0.1::15901`).

## 3. Cài MT5

Trên VPS:

```sh
cd ~/mt5-core
bash mt5.sh install
```

Hoàn tất trình cài chính thức qua VNC; chấp nhận Mono/Gecko nếu được yêu cầu.
Thoát MT5 sau khi cài. Nếu phải reboot, khởi động lại bước 2.

Đường dẫn mặc định là `~/.mt5/drive_c/Program Files/MetaTrader 5`.
Nếu cài nơi khác, đặt đúng biến trong mỗi phiên SSH/tmux trước khi gọi mt5.sh:

```sh
export WINEPREFIX="$HOME/.mt5"
export MT5_DIR="$WINEPREFIX/drive_c/Program Files/MetaTrader 5"
```

## 4. Biên dịch và đăng nhập

Đảm bảo terminal đã thoát, sau đó chạy:

```sh
cd ~/mt5-core
bash mt5.sh compile
bash mt5.sh login
```

Trong VNC, đăng nhập broker, đợi terminal có giá rồi File → Exit.
Không gửi mật khẩu vào chat hoặc commit vào repo. Bộ lệnh dùng `/portable`
để EA và tài khoản dùng cùng thư mục dữ liệu.

## 5. Chạy khung MT5

```sh
cd ~/mt5-core
cp -n bot.ini.example bot.ini
```

Sửa `Symbol=EURUSD` trong bot.ini thành tên mã broker thực sự cung cấp nếu cần.
`Period=M15` chỉ là khung chart, chưa có quy tắc giao dịch gắn với khung này.

```sh
tmux new -s mt5-core
bash mt5.sh run
```

Trong VNC, tab Experts cần hiện `MT5 core started`, sau đó `MT5 CORE` mỗi 30 giây.
`connected=yes`, login/server đúng, `quote=available` xác nhận terminal đã nhận
giá; đây không phải xác nhận lệnh giao dịch đã được thử thành công.
`algo=off` và `orders_enabled=no` là trạng thái mặc định.

Ctrl+B rồi D để tiếp tục chạy khi ngắt SSH. Bộ này chưa tự khởi động sau reboot.
Không mở thêm terminal dùng chung thư mục hoặc gắn EA vào nhiều chart.

```sh
bash mt5.sh logs
```

Nhật ký nằm trong `MQL5/Logs` và `Logs` dưới thư mục MT5. Có thể đọc bằng VNC
hoặc `iconv -f UTF-16LE -t UTF-8 DUONG_DAN_FILE_LOG`.
Để dừng, dùng File → Exit trong VNC; dừng terminal không đóng vị thế ở broker.

## Bổ sung chiến lược sau này

Tạo file chiến lược riêng khi có yêu cầu cụ thể. Chiến lược gọi lớp
`CTradeExecution`; giữ code gửi lệnh trong `TradeExecution.mqh`.
Hiện không có EMA, RSI, DCA, martingale, điều kiện vào lệnh hoặc lệnh mẫu tự chạy.

## Kiểm thử

Chưa biên dịch MQL5, kiểm thử Wine hoặc gửi lệnh trên VPS của bạn.
Workflow GitHub kiểm tra cú pháp Bash; không thay thế kiểm thử với MT5/broker.

## Tài liệu

- [Cài MT5 trên Linux](https://www.metatrader5.com/en/terminal/help/start_advanced/install_linux)
- [Tham số khởi chạy terminal](https://www.metatrader5.com/en/terminal/help/start_advanced/start)
- [Lớp giao dịch CTrade](https://www.mql5.com/en/docs/standardlibrary/tradeclasses/ctrade)
