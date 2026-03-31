"""
ETL - Transform Module (Stock Assistant)
Kiến trúc Medallion: Silver (Làm sạch) & Gold (Chỉ số nghiệp vụ)
"""

import pandas as pd
import numpy as np
from datetime import datetime, timezone, timedelta
import logging

# Cấu hình logging để theo dõi quá trình biến đổi dữ liệu
logger = logging.getLogger(__name__)


def transform_silver(df: pd.DataFrame) -> pd.DataFrame:
    """
    Biến đổi Tầng Silver (Bạc): Làm sạch Dữ liệu (Cleaning & Validation).
    """
    if df.empty:
        logger.warning("⚠️ Không có dữ liệu để thực hiện biến đổi tầng Silver")
        return pd.DataFrame()
        
    logger.info("🔄 Đang chạy quy trình biến đổi tầng SILVER (Làm sạch)...")
    
    # Tạo bản sao DataFrame để tránh ảnh hưởng đến bản gốc
    df = df.copy()
    
    # Chuyển đổi toàn bộ các cột liên quan đến giá về định dạng số (Numeric)
    # Lỗi thường gặp: API trả về chuỗi văn bản thay vì số, gây lỗi khi tính toán.
    numeric_cols = ["open", "high", "low", "close", "volume"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce") # Ép kiểu, lỗi thành NaN
            
    # Sắp xếp lại Index (thời gian) theo đúng thứ tự tăng dần để tính toán chuỗi thời gian
    df = df.sort_index()
    
    # Loại bỏ các dòng bị thiếu thông tin quan trọng (Giá đóng cửa hoặc Tên mã)
    # Deduplication (Khử trùng lặp) cũng thực hiện tại đây nếu cần.
    df = df.dropna(subset=["close", "symbol"])
    
    logger.info(f"✅ Tầng SILVER hoàn tất: Đã làm sạch {len(df)} hàng dữ liệu")
    return df


def transform_gold(silver_df: pd.DataFrame) -> pd.DataFrame:
    """
    Biến đổi Tầng Gold (Vàng): Tính toán Chỉ số & Nghiệp vụ (Business Analytics).
    """
    if silver_df.empty:
        return pd.DataFrame()
        
    logger.info("⚡ Đang chạy quy trình biến đổi tầng GOLD (Phân tích/Chỉ số)...")
    
    result_dfs = []
    
    # Nhóm dữ liệu theo mã cổ phiếu (Group by Symbol) để tính toán riêng cho từng mã
    for symbol, grp in silver_df.groupby("symbol"):
        grp = grp.copy().sort_index()
        
        # 🟢 Tính toán Fast Moving Averages (Dựa trên giá đóng cửa - Close Price)
        # Sử dụng Rolling Window (Cửa sổ trượt) của Pandas
        # MA5: Trung bình cộng giá của 5 phiên giao dịch gần nhất
        grp["ma5"]  = grp["close"].rolling(window=5,  min_periods=1).mean()
        # MA10: Trung bình cộng giá của 10 phiên giao dịch gần nhất
        grp["ma10"] = grp["close"].rolling(window=10, min_periods=1).mean()
        
        # 🟢 Tính toán Percent Change & Volatility
        # pct_change: Tính % thay đổi so với phiên trước đó
        grp["percent_change"] = grp["close"].pct_change() * 100
        # volatility: Tín hữu độ biến động giá (Sử dụng độ lệch chuẩn trượt - Rolling Standard Deviation)
        grp["volatility"] = grp["percent_change"].rolling(window=10, min_periods=1).std()
        
        # 🟢 Logic Tín hiệu Xu hướng (Gợi ý cho AI Chatbot phân tích)
        # Bullish (Tăng trưởng): Nếu Giá > MA5 và MA5 > MA10 -> Xu hướng tăng mạnh (Tín hiệu mua nhanh)
        # Bearish (Suy thoái): Ngược lại
        def get_signal(row):
            if row['close'] > row['ma5'] > row['ma10']: return 'Bullish'
            if row['close'] < row['ma5'] < row['ma10']: return 'Bearish'
            return 'Neutral' # Không rõ xu hướng
            
        # Áp dụng hàm get_signal cho từng dòng dữ liệu (Axis=1)
        grp["trend_signal"] = grp.apply(get_signal, axis=1)
        
        result_dfs.append(grp)
        
    # Gộp lại các nhóm mã cổ phiếu
    gold_df = pd.concat(result_dfs)
    
    # Xử lý các giá trị NaN phát sinh sau khi tính toán (Lấp đầy giá trị mặc định)
    gold_df = gold_df.fillna({
        "percent_change": 0.0,
        "volatility": 0.0,
        "ma5": gold_df['close'], # Mặc định lấy giá hiện tại cho MA nếu chưa đủ dữ liệu phiên trước
        "ma10": gold_df['close']
    })
    
    logger.info(f"✅ Tầng GOLD hoàn tất: Đã tính toán xong {len(gold_df)} bản ghi phân tích")
    return gold_df


def transform(raw_parsed_data: dict) -> dict:
    """
    Hàm điều phối TRANSFORM chính của Pipeline Medallion.
    """
    logger.info("🚀 Bắt đầu giai đoạn TRANSFORM (Bronze -> Gold)...")
    
    if not raw_parsed_data or "prices" not in raw_parsed_data:
         logger.warning("⚠️ Không có dữ liệu đầu vào cho quy trình biến đổi.")
         return {}
         
    # 🟢 Bước 1: SILVER (Làm sạch thô thành sạch)
    silver_data = transform_silver(raw_parsed_data["prices"])
    
    # 🟡 Bước 2: GOLD (Dữ liệu sạch thành dữ liệu Business/Insight)
    gold_data = transform_gold(silver_data)
    
    return {
        "silver_prices": silver_data, # Trả về cho load_silver_prices nạp DB
        "gold_metrics":  gold_data,   # Trả về cho load_gold_metrics nạp DB
        "transformed_at": datetime.now(timezone.utc)
    }


if __name__ == "__main__":
    # Module này sẽ được gọi từ pipeline.py
    print("Script này được thiết kế để gọi từ pipeline.py")
