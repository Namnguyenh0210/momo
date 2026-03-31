"""
ETL - Medallion Pipeline Orchestrator (Stock Assistant)
Bộ điều khiển trung tâm: Điều phối luồng Bronze -> Silver -> Gold
Kết hợp: Kiểm tra chất lượng (QC) và Cảnh báo (Alerts)
"""

import logging
import time
from extract import extract
from transform import transform
from load import load
from validation import validate_silver_data, check_anomalies
from alerts import check_for_alerts
from dotenv import load_dotenv
import os

# Load cấu hình từ file .env (nằm ở thư mục backend)
load_dotenv(os.path.join(os.path.dirname(__file__), "../backend/.env"))


# Cấu hình logging toàn cục để theo dõi tiến độ chạy của Pipeline
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)


def run_medallion_etl(symbols: list = None, mode: str = "stock"):
    """
    Hàm điều phối toàn bộ quy trình ETL Medallion (Dữ liệu từ API đến Dashboard).
    Gồm 3 tầng chính + Cơ chế kiểm soát DQ & Cảnh báo thị trường.
    """
    logger.info(f"🎬 Đang khởi tạo luồng dữ liệu {mode} Medallion (3 Tầng)...")
    start_time = time.time() # Ghi lại thời điểm bắt đầu để tính tổng thời gian chạy
    
    try:
        # 🟢 GIAI ĐOẠN 1: EXTRACT (Trích xuất)
        # Lấy dữ liệu thô (Raw) từ API phù hợp
        extracted_data = extract(symbols, mode=mode)
        if not extracted_data: 
            logger.error("❌ Giai đoạn Trích xuất (EXTRACT) thất bại. Dừng luồng.")
            return False
            
        # 🟡 GIAI ĐOẠN 2: TRANSFORM (Biến đổi)
        # Làm sạch (Silver) và tính toán chỉ số nghiệp vụ (Gold)
        transformed_data = transform(extracted_data)
        if not transformed_data: 
            logger.error("❌ Giai đoạn Biến đổi (TRANSFORM) thất bại. Dừng luồng.")
            return False
        
        # 🛡️ KIỂM SOÁT CHẤT LƯỢNG (DQ - Data Quality)
        # Trước khi nạp dữ liệu sạch vào Database (Silver layer), thực hiện kiểm tra kiểm soát.
        # Nếu dữ liệu lỗi (Giá âm, dữ liệu rỗng), dừng quy trình để tránh làm rác biểu đồ.
        if not validate_silver_data(transformed_data["silver_prices"]):
            logger.error("❌ DỮ LIỆU KHÔNG ĐẠT CHUẨN (QC Failed). Dừng quy trình nạp.")
            return False
            
        # 🔵 GIAI ĐOẠN 3: LOAD (Nạp dữ liệu)
        # Chèn dữ liệu thực tế vào cả 3 Schema (Bronze/Silver/Gold) trong PostgreSQL theo giao dịch (Transaction).
        load_result = load(extracted_data, transformed_data)
        
        # 🚀 CẢNH BÁO THỊ TRƯỜNG (Alerting)
        # Sau khi dữ liệu đã được nạp xong, quét các biến động bất thường (Anomalies).
        # Ví dụ: Một mã cổ phiếu giảm sốc > 5% trong ngày hôm nay.
        # Nếu có tin xấu (Negative Sentiment) đi kèm, gửi thông báo báo động qua Telegram.
        anomalies = check_anomalies(transformed_data["gold_metrics"])
        check_for_alerts(anomalies, extracted_data.get("raw_news", {}))
        
        elapsed = time.time() - start_time # Tính toán tổng thời gian xử lý
        logger.info(f"✅ LUỒNG MEDALLION ĐÃ HOÀN TẤT THÀNH CÔNG trong {elapsed:.2f} giây!")
        logger.info(f"📊 Thống kê lượt nạp: {load_result}")
        return True
        
    except Exception as e:
        # Xử lý lỗi hệ thống nghiêm trọng (Ví dụ: DB sập, API Key hết hạn)
        logger.error(f"💀 LỖI HỆ THỐNG CRITICAL TẠI MEDALLION PIPELINE: {e}")
        return False


if __name__ == "__main__":
    # Điểm chạy thử nghiệm (Dành cho nhà phát triển kiểm tra thủ công)
    # List các mã cổ phiếu mẫu để Test nhanh Pipeline
    TEST_STOCKS = ["AAPL", "MSFT"]
    run_medallion_etl(TEST_STOCKS)
