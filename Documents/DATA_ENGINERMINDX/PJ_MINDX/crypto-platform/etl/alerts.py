"""
ETL - Alerting Module (Telegram Alerts - Stock Assistant)
Gửi thông báo ngay lập tức nếu phát hiện biến động mạnh (Anomalies) hoặc tin tức xấu.
"""

import requests
import os
import logging

# Cấu hình logging để kiểm tra trạng thái thông báo
logger = logging.getLogger(__name__)

# Lấy cấu hình Token và ID từ .env (Ẩn danh tính/Bảo mật)
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "") # Demo: your_telegram_bot_token
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")     # Demo: your_chat_id

def send_telegram_alert(message: str):
    """
    Hàm gửi tin nhắn cảnh báo đơn lẻ đến Bot Telegram.
    Sử dụng Webhook REST API API của Telegram Bot.
    """
    # 🔴 Kiểm tra nếu cấu hình Token/ID bị thiếu (Bỏ qua nếu chưa cài đặt)
    if not BOT_TOKEN or not CHAT_ID:
        logger.warning("⚠️ Bỏ qua Telegram Alert: Do Token hoặc ChatID chưa được cấu hình trong .env.")
        return False

    # URL theo chuẩn của API Telegram Bot để gửi tin nhắn
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    
    # Dữ liệu truyền lên Telegram (Định dạng HTML để trình bày đẹp)
    payload = {
        "chat_id": CHAT_ID,
        "text": f"🚀 [AI Stock Assistant] 🔥 <b>CẢNH BÁO THỊ TRƯỜNG</b>: \n\n{message}",
        "parse_mode": "HTML"
    }

    try:
        # Gửi request POST tới server Telegram kèm toàn bộ thông điệp cảnh báo
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status() # Nếu phản hồi 200 (Thành công) -> Thành công
        logger.info("✅ Cảnh báo Telegram đã được gửi đi thành công!")
        return True
    except Exception as e:
        # Xử lý khi không có mạng hoặc Token bị sai lệch
        logger.error(f"❌ Gửi cảnh báo Telegram thất bại: {e}")
        return False

def check_for_alerts(anomalies: list, raw_news: dict):
    """
    Hàm tổng hợp tin nhắn cảnh báo dựa trên Anomalies (Giá) và News Sentiment (Tin tức).
    Kích hoạt sau khi quy trình LOAD dữ liệu đã hoàn tất.
    """
    # Nếu không mã nào biến động và không có dữ liệu tin tức, dừng quy trình cảnh báo
    if not anomalies and not raw_news:
        return

    alert_msgs = [] # Chứa các đoạn tin nhắn thông báo lẻ
    
    # 📈 🔴 1. CẢNH BÁO BIẾN ĐỘNG GIÁ (Dựa trên Anomalies lọc từ Validation layer)
    # Nếu mã biến động > 5%, thêm vào danh sách cảnh báo tức thời
    for a in anomalies:
        if a['type'] == 'HIGH_VOLATILITY':
            alert_msgs.append(f"📈 <b>{a['symbol']}</b>: {a['message']}.")

    # 📰 🔴 2. CẢNH BÁO TÂM LÝ TIN TỨC (Dựa trên Sentiment từ Extract layer)
    # Hệ thống lọc những tin tức mang tính tiêu cực (Bearish - Downtrend)
    for symbol, news in raw_news.items():
        feed = news.get("feed", [])
        for item in feed[:2]: # Chỉ lấy 2 bản tin mới nhất của mỗi mã
            sentiment = item.get("overall_sentiment_label", "")
            
            # 🔥 QUY TẮC CẢNH BÁO TIN XẤU: Nếu nhãn là Bearish hoặc Very-Bearish
            if sentiment in ["Bearish", "Very-Bearish"]:
                alert_msgs.append(f"🔴 <b>{symbol} - TIN TỨC XẤU:</b> {item.get('title')[:60]}... (Tâm lý: {sentiment})")

    # Nếu có tin nhắn trong hàng đợi -> Ghép lại và gửi một lần duy nhất (Batch Message)
    if alert_msgs:
        full_msg = "\n\n".join(alert_msgs)
        send_telegram_alert(full_msg)
