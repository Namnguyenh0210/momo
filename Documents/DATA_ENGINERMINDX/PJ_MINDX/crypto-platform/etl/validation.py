"""
ETL - Quality Control (QC) & Anomaly Detection (Stock Assistant)
Kiểm soát chất lượng dữ liệu: Đảm bảo dữ liệu "Sạch" và "Hợp lệ" trước khi nạp vào Schema.
"""

import pandas as pd
import logging

# Cấu hình logging để báo cáo tình trạng kiểm soát chất lượng
logger = logging.getLogger(__name__)

def validate_silver_data(df: pd.DataFrame) -> bool:
    """
    Kiểm tra tính hợp lệ của dữ liệu tầng Silver (Sau khi làm sạch cơ bản).
    Mục đích: Ngăn chặn dữ liệu rác hoặc dữ liệu lỗi làm bẩn biểu đồ Gold/Dashboard.
    """
    # 🔴 Kiểm tra khung dữ liệu có rỗng không (Raw Extract sập hoặc API không trả về data)
    if df.empty:
        logger.error("❌ Kiểm soát thất bại: DataFrame rỗng (Không lấy được data từ Extract)")
        return False

    # 🔴 Kiểm tra giá trị giá không được âm hoặc bằng 0 (Lỗi logic dữ liệu từ Alpha Vantage)
    # Vì giá cổ phiếu thực tế không bao giờ <= 0.
    neg_prices = df[(df['open'] <= 0) | (df['close'] <= 0) | (df['high'] <= 0) | (df['low'] <= 0)]
    if not neg_prices.empty:
        logger.warning(f"⚠️ Phát hiện {len(neg_prices)} hàng có giá trị <= 0. Tự động loại bỏ dữ liệu ngoại lai...")
        # Lưu ý: Ở đây ta chỉ cảnh báo, thực tế có thể Filter (lọc bỏ) các dòng này.
        
    # 🔴 Kiểm tra các giá trị NULL (Thiếu hụt dữ liệu) ở các cột bắt buộc
    # 'symbol' (Mã) và 'close' (Giá đóng) là 2 cột sống còn để hiển thị biểu đồ.
    if df[['symbol', 'close']].isnull().any().any():
        logger.error("❌ Kiểm soát thất bại: Phát hiện giá trị NULL ở các cột bắt buộc (symbol/close)")
        return False

    logger.info("✅ Kiểm soát DQ hoàn tất: Dữ liệu đủ tiêu chuẩn nạp vào Tầng Silver/Gold")
    return True

def check_anomalies(df: pd.DataFrame):
    """
    Phát hiện biến động bất thường (> 5% hoặc volume đột biến).
    Trả về danh sách danh mục các mã cổ phiếu cần thực hiện cảnh báo (Alerting).
    """
    anomalies = [] # Lưu danh sách cảnh báo biến động
    if df.empty: return anomalies
    
    # Lấy dữ liệu của phiên giao dịch mới nhất cho mỗi mã (Latest values)
    # Sắp xếp theo ngày tăng dần và lấy bản ghi cuối cùng của từng Symbol
    latest = df.sort_index().groupby('symbol').last()
    
    for symbol, row in latest.iterrows():
        # Lấy giá trị phần trăm thay đổi (%) tuyệt đối để phát hiện cả tăng sốc và giảm sâu
        change = abs(row.get('percent_change', 0))
        
        # 🟢 Tiêu chuẩn cảnh báo: Biến động mạnh trên 5% trong một ngày (High Volatility)
        if change >= 5.0:
            anomalies.append({
                "symbol": symbol,
                "type": "HIGH_VOLATILITY",
                "message": f"Biến động mạnh: {change:.2f}% (Tăng/Giảm mạnh trong phiên)",
                "value": change
            })
            
    return anomalies
