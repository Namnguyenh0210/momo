"""
ETL - Load Module (Stock Assistant)
Kiến trúc Medallion: Nạp dữ liệu vào các tầng Bronze, Silver, và Gold Schemas của PostgreSQL.
"""

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
import os
import logging
import json
from datetime import datetime

# Cấu hình logging để quản lý trạng thái nạp dữ liệu
logger = logging.getLogger(__name__)

# Cấu hình kết nối DB từ file .env (Để bảo mật thông tin)
DB_CONFIG = {
    "host":     os.getenv("DB_HOST",     "localhost"),
    "port":     int(os.getenv("DB_PORT", "5432")),
    "dbname":   os.getenv("DB_NAME",     "stock_db"),
    "user":     os.getenv("DB_USER",     "postgres"),
    "password": os.getenv("DB_PASSWORD", "postgres123"),
}


def get_connection():
    """Hàm khởi tạo kết nối vật lý đến PostgreSQL thông qua psycopg2."""
    return psycopg2.connect(**DB_CONFIG)


# =============================================
# BRONZE LAYER: Nạp Dữ liệu Thô (Ingestion)
# =============================================
def load_bronze_raw(raw_results: dict, conn) -> int:
    """
    Chèn (Insert) mẩu dữ liệu JSON gốc từ API vào bảng bronze.raw_stock_data.
    Mục đích: Giữ lại "nguyên mẫu" dữ liệu để đối soát (Audit).
    """
    if not raw_results:
        return 0

    rows = []
    # Chuyển đổi Dictionary sang danh sách (List) các hàng để Batch Insert (Nạp hàng loạt)
    for symbol, raw_json in raw_results.items():
        rows.append((
            symbol, # Mã cổ phiếu
            json.dumps(raw_json) # Toàn bộ mẩu tin JSON (Chuyển sang chuỗi để SQL hiểu)
        ))
    
    # Câu lệnh SQL nạp vào cột JSONB
    sql = "INSERT INTO bronze.raw_stock_data (symbol, raw_json) VALUES %s"
    with conn.cursor() as cur:
        # execute_values giúp nạp hàng ngàn hàng dữ liệu trong 1 lần giao dịch (Tránh quá tải)
        execute_values(cur, sql, rows)
    conn.commit() # Xác nhận lưu vào Database
    
    logger.info(f"✅ BRONZE: Đã nạp thành công {len(rows)} mẩu tin JSON thô")
    return len(rows)


def ensure_stocks_exist(symbols: list, conn):
    """
    Đảm bảo các mã (symbols) tồn tại trong bảng silver.stocks.
    Nếu chưa có, tự động tạo mới để tránh lỗi khóa ngoại (Foreign Key).
    """
    if not symbols:
        return
    
    with conn.cursor() as cur:
        # Lấy danh sách các mã đã tồn tại
        cur.execute("SELECT symbol FROM silver.stocks")
        existing_symbols = {row[0] for row in cur.fetchall()}
        
        new_symbols = [s for s in symbols if s not in existing_symbols]
        
        if new_symbols:
            logger.info(f"🆕 Phát hiện {len(new_symbols)} mã mới: {new_symbols}. Đang thêm vào danh mục...")
            # Chèn các mã mới vào bảng stocks
            sql = "INSERT INTO silver.stocks (symbol, name, is_active) VALUES (%s, %s, TRUE)"
            for symbol in new_symbols:
                # Tạm thời để tên trùng với mã, người dùng có thể cập nhật sau
                cur.execute(sql, (symbol, symbol))
            conn.commit()


# =============================================
# SILVER LAYER: Nạp Dữ liệu Đã Làm sạch
# =============================================
def load_silver_prices(df: pd.DataFrame, conn) -> int:
    """
    Nạp dữ liệu giá đã được làm sạch vào bảng silver.prices.
    """
    if df.empty:
        return 0

    # Lấy danh sách ánh xạ Mã cổ phiếu (Symbol) sang ID nội bộ trong Database
    # Mục đích: Đảm bảo tính nhất quán dữ liệu (Foreign Key - Khóa ngoại)
    with conn.cursor() as cur:
        cur.execute("SELECT id, symbol FROM silver.stocks WHERE is_active = TRUE")
        stock_map = {row[1]: row[0] for row in cur.fetchall()}
    
    rows = []
    # Lặp qua DataFrame của Pandas để bóc dữ liệu giá
    for _, row in df.iterrows():
        symbol = row.get("symbol")
        stock_id = stock_map.get(symbol)
        if not stock_id:
            continue # Bỏ qua nếu mã chưa tồn tại trong danh mục silver.stocks
        
        # Tạo hàng dữ liệu (Tuple) chuẩn cho SQL
        rows.append((
            stock_id,
            row.name.strftime('%Y-%m-%d'), # Chuyển đổi ngày tháng về định dạng ISO cho SQL
            row.get("open"),
            row.get("high"),
            row.get("low"),
            row.get("close"),
            int(row.get("volume", 0))
        ))
    
    if not rows:
        return 0
    
    # Kỹ thuật UPSERT: Nếu trùng (stock_id + date), thực hiện Lâu đè (Update) giá trị mới nhất.
    # Ngăn chặn việc dữ liệu bị lặp lại nếu chạy Pipeline nhiều lần trong ngày.
    sql = """
        INSERT INTO silver.prices
            (stock_id, date, open_price, high_price, low_price, close_price, volume)
        VALUES %s
        ON CONFLICT (stock_id, date) DO UPDATE 
        SET close_price = EXCLUDED.close_price, volume = EXCLUDED.volume;
    """
    with conn.cursor() as cur:
        execute_values(cur, sql, rows)
    conn.commit()
    
    logger.info(f"✅ SILVER: Đã nạp thành công {len(rows)} bản ghi giá lịch sử")
    return len(rows)


# =============================================
# GOLD LAYER: Nạp Dữ liệu Chỉ số Phân tích
# =============================================
def load_gold_metrics(df: pd.DataFrame, conn) -> int:
    """
    Nạp dữ liệu tính toán MA, Volatility... vào bảng gold.stock_metrics.
    Đây là nguồn dữ liệu chính cho AI và Biểu đồ.
    """
    if df.empty:
        return 0

    # Lấy bản đồ ID cổ phiếu
    with conn.cursor() as cur:
        cur.execute("SELECT id, symbol FROM silver.stocks WHERE is_active = TRUE")
        stock_map = {row[1]: row[0] for row in cur.fetchall()}
    
    rows = []
    for _, row in df.iterrows():
        symbol = row.get("symbol")
        stock_id = stock_map.get(symbol)
        if not stock_id:
            continue
        
        rows.append((
            stock_id,
            row.name.strftime('%Y-%m-%d'),
            row.get("ma5"),
            row.get("ma10"),
            row.get("percent_change"),
            row.get("volatility"),
            row.get("trend_signal") # Tín hiệu xu hướng (Bullish/Bearish...)
        ))
    
    if not rows:
        return 0
    
    # Áp dụng UPSERT cho tầng Gold (Dọc theo chuỗi sự kiện thời gian)
    sql = """
        INSERT INTO gold.stock_metrics
            (stock_id, date, ma5, ma10, percent_change, volatility, trend_signal)
        VALUES %s
        ON CONFLICT (stock_id, date) DO UPDATE
        SET ma5 = EXCLUDED.ma5, ma10 = EXCLUDED.ma10, 
            percent_change = EXCLUDED.percent_change, trend_signal = EXCLUDED.trend_signal;
    """
    with conn.cursor() as cur:
        execute_values(cur, sql, rows)
    conn.commit()
    
    logger.info(f"✅ GOLD: Đã nạp thành công {len(rows)} chỉ số phân tích kỹ thuật")
    return len(rows)


def load_gold_news(raw_news: dict, conn) -> int:
    """
    Nạp tin tức thị trường (News Sentiment) vào bảng gold.stock_news.
    Chỉ lấy các mẩu tin quan trọng và tâm lý thị trường.
    """
    if not raw_news:
        return 0

    with conn.cursor() as cur:
        cur.execute("SELECT id, symbol FROM silver.stocks WHERE is_active = TRUE")
        stock_map = {row[1]: row[0] for row in cur.fetchall()}
    
    rows = []
    for symbol, news_data in raw_news.items():
        stock_id = stock_map.get(symbol)
        if not stock_id: continue
        
        # Chỉ lấy 3 tin tức mới nhất của mỗi mã cổ phiếu
        feed = news_data.get("feed", [])[:3]
        for item in feed:
            # Xử lý chuỗi thời gian của Alpha Vantage: 20240321T120000 -> Định dạng DB chuẩn
            raw_time = item.get("time_published", "")
            pub_at = datetime.strptime(raw_time, '%Y%m%dT%H%M%S') if raw_time else datetime.now()
            
            rows.append((
                stock_id,
                item.get("title"), # Tiền bản tin
                item.get("url"),   # Link bài báo
                item.get("summary"), # Tóm tắt nội dung
                item.get("overall_sentiment_score"), # Điểm số tích cực/tiêu cực (0 -> 1)
                item.get("overall_sentiment_label"), # Nhãn (Bullish/Bearish)
                pub_at
            ))
    
    if not rows: return 0
    # Nạp tin tức vào Gold Schema phục vụ AI Chatbot phân tích context
    sql = """
        INSERT INTO gold.stock_news (stock_id, title, url, summary, overall_sentiment_score, overall_sentiment_label, published_at)
        VALUES %s
    """
    with conn.cursor() as cur:
        execute_values(cur, sql, rows)
    conn.commit()
    logger.info(f"✅ GOLD: Đã nạp thành công {len(rows)} bản tin sentiment thị trường")
    return len(rows)


def load(extracted_data: dict, transformed_data: dict) -> dict:
    """
    Hàm điều phối LOAD trung tâm cho toàn bộ Medallion Architecture.
    Trình tự: Bronze (Thô) -> Silver (Sạch) -> Gold (Phân tích).
    """
    logger.info("🚀 Bắt đầu giai đoạn LOAD (Nạp dữ liệu vào DW PostgreSQL)...")
    
    stats = {"bronze": 0, "silver": 0, "gold": 0, "news": 0} # Lưu trữ thống kê lượt nạp
    
    try:
        # 🟢 Khởi tạo kết nối vật lý một lần duy nhất cho toàn bộ quy trình
        conn = get_connection()
        logger.info(f"✅ Đã kết nối thành công tới Kho Dữ liệu: {DB_CONFIG['dbname']}")
        
        # 🟢 GIAI ĐOẠN 0: Đảm bảo danh mục mã (Stocks) đầy đủ
        all_symbols = list(extracted_data.get("raw", {}).keys())
        ensure_stocks_exist(all_symbols, conn)

        # 🟢 GIAI ĐOẠN 1: BRONZE (Nạp dữ liệu mộc ngay sau khi Extract)
        stats["bronze"] = load_bronze_raw(extracted_data.get("raw"), conn)
        
        # 🟡 GIAI ĐOẠN 2: SILVER (Nạp dữ liệu đã xử lý sạch sẽ)
        stats["silver"] = load_silver_prices(transformed_data.get("silver_prices"), conn)
        
        # 🔵 GIAI ĐOẠN 3: GOLD (Nạp dữ liệu Insight & Tin tức phân tích)
        stats["gold"]   = load_gold_metrics(transformed_data.get("gold_metrics"), conn)
        stats["news"]   = load_gold_news(extracted_data.get("raw_news"), conn)
        
        # Đóng kết nối để giải phóng tài nguyên hệ thống
        conn.close()
        logger.info("✅ Toàn bộ chu kỳ LOAD (Nạp dữ liệu) đã hoàn tất thành công!")
        
    except Exception as e:
        logger.error(f"❌ Lỗi nghiêm trọng tại giai đoạn LOAD: {e}")
        raise # Đẩy lỗi ra ngoài để Airflow có thể bắt và báo đỏ DAG
    
    return stats


if __name__ == "__main__":
    # Module phục vụ gọi nội bộ từ Pipeline
    print("Script phục vụ làm một phần của Pipeline (pipeline.py)")
