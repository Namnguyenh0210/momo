"""
ETL - Extract Module (Stock Assistant)
Module này chịu trách nhiệm lấy dữ liệu từ Alpha Vantage API.
"""

import requests
import pandas as pd
from datetime import datetime, timezone
import logging
import time
import os
import json
from dotenv import load_dotenv

# Load cấu hình từ file .env (nằm ở thư mục backend)
env_path = os.path.join(os.path.dirname(__file__), "../backend/.env")
load_dotenv(env_path)

import dotenv
env_vars = dotenv.dotenv_values(env_path)

# Cấu hình logging để theo dõi quá trình chạy
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)

# Lấy API Key từ biến môi trường (Environment Variable) hoặc file .env
ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY")
# Nếu biến môi trường rỗng (do Docker truyền vào ""), lấy trực tiếp từ file .env
if not ALPHA_VANTAGE_API_KEY:
    ALPHA_VANTAGE_API_KEY = env_vars.get("ALPHA_VANTAGE_API_KEY") or "demo"

BASE_URL = "https://www.alphavantage.co/query"
BINANCE_URL = "https://api.binance.com/api/v3"

# Danh sách các mã cổ phiếu mặc định (US Stocks)
DEFAULT_STOCKS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "V", "JPM", "WMT"]

# Danh sách các mã Crypto phổ biến (Binance - Dễ hiểu với người Việt)
DEFAULT_CRYPTO = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]


def get_daily_stock_data_raw(symbol: str) -> dict:
    """
    Hàm lấy dữ liệu giá cổ phiếu hàng ngày (TIME_SERIES_DAILY).
    Trả về định dạng JSON gốc cho tầng Bronze.
    """
    logger.info(f"📡 Đang lấy dữ liệu thô cho {symbol}...")
    
    # Các tham số gửi lên API Alpha Vantage
    params = {
        "function": "TIME_SERIES_DAILY",
        "symbol": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "outputsize": "compact" # Chỉ lấy 100 ngày gần nhất để tiết kiệm băng thông
    }
    
    try:
        # Gửi request GET tới Alpha Vantage
        resp = requests.get(BASE_URL, params=params, timeout=15)
        resp.raise_for_status() # Nếu lỗi HTTP 4xx hoặc 5xx sẽ báo lỗi
        data = resp.json() # Chuyển phản hồi về dạng Dictionary (JSON)
        
        # Kiểm tra nếu API trả về thông báo lỗi
        if "Error Message" in data:
            logger.error(f"❌ Lỗi API cho {symbol}: {data['Error Message']}")
            return {}
        
        # Xử lý khi bị vượt quá giới hạn request (Rate Limit) cho tài khoản Free
        if "Information" in data and "rate limit" in data["Information"].lower():
            logger.warning(f"⚠️ Đã chạm giới hạn API cho {symbol}. Đang chờ 60 giây...")
            time.sleep(60) # Ngủ 60s rồi thử lại
            return get_daily_stock_data_raw(symbol)
            
        return data

    except Exception as e:
        logger.error(f"❌ Lỗi khi trích xuất {symbol}: {e}")
        return {}


def get_binance_data_raw(symbol: str) -> dict:
    """
    Lấy dữ liệu nến (Klines) 1 ngày từ Binance.
    """
    logger.info(f"📡 Đang lấy dữ liệu Binance cho {symbol}...")
    url = f"{BINANCE_URL}/klines"
    params = {
        "symbol": symbol,
        "interval": "1d",
        "limit": 100
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        return {"Time Series (Daily)": resp.json(), "source": "binance"}
    except Exception as e:
        logger.error(f"❌ Lỗi Binance {symbol}: {e}")
        return {}


def get_stock_news_sentiment(symbol: str) -> dict:
    """
    Hàm lấy tin tức và phân tích tâm lý thị trường (Sentiment) cho mã cổ phiếu.
    """
    logger.info(f"📰 Đang lấy tin tức và sentiment cho {symbol}...")
    params = {
        "function": "NEWS_SENTIMENT",
        "tickers": symbol,
        "apikey": ALPHA_VANTAGE_API_KEY,
        "limit": 5 # Lấy 5 tin mới nhất mỗi mã
    }
    try:
        resp = requests.get(BASE_URL, params=params, timeout=15)
        return resp.json()
    except Exception as e:
        logger.error(f"❌ Lỗi khi lấy tin tức {symbol}: {e}")
        return {}


def parse_binance_data(symbol: str, raw_data: list | None) -> pd.DataFrame:
    """Parse dữ liệu klines từ Binance sang DataFrame."""
    if not raw_data or not isinstance(raw_data, list): return pd.DataFrame()
    # Binance format: [ [time, open, high, low, close, volume, ...] ]
    df = pd.DataFrame(raw_data, columns=[
        'date', 'open', 'high', 'low', 'close', 'volume',
        'close_time', 'quote_asset_volume', 'number_of_trades',
        'taker_buy_base_asset_volume', 'taker_buy_quote_asset_volume', 'ignore'
    ])
    df['date'] = pd.to_datetime(df['date'], unit='ms')
    df.set_index('date', inplace=True)
    df = df[['open', 'high', 'low', 'close', 'volume']]
    df = df.apply(pd.to_numeric)
    df['symbol'] = symbol
    return df


def parse_raw_data(symbol: str, raw_data: dict) -> pd.DataFrame:
    """
    Hàm chuyển mẩu JSON thô thành DataFrame của Pandas để dễ xử lý.
    """
    # Nếu là dữ liệu từ binance
    if raw_data.get("source") == "binance":
        return parse_binance_data(symbol, raw_data.get("Time Series (Daily)"))

    # Trích xuất phần chuỗi thời gian (Daily) từ JSON Alpha Vantage
    time_series = raw_data.get("Time Series (Daily)")
    if not time_series:
        return pd.DataFrame()
    
    # Chuyển Dictionary sang DataFrame, xoay ngang sang dọc (orient="index")
    df = pd.DataFrame.from_dict(time_series, orient="index")
    df.index = pd.to_datetime(df.index) # Đưa Index về dạng ngày tháng (DateTime)
    df.index.name = "date"
    
    # Đổi tên cột cho ngắn gọn và dễ hiểu
    df = df.rename(columns={
        "1. open":   "open",
        "2. high":   "high",
        "3. low":    "low",
        "4. close":  "close",
        "5. volume": "volume"
    })
    
    # Chuyển toàn bộ giá trị về dạng số (nguyên bản API trả về chuỗi văn bản)
    df = df.apply(pd.to_numeric, errors="coerce")
    df["symbol"] = symbol # Gắn nhãn mã cổ phiếu vào DataFrame
    return df.sort_index() # Sắp xếp theo ngày tăng dần


def extract(symbols: list | None = None, mode: str = "stock") -> dict:
    """
    Hàm điều phối Extract chính. Chạy vòng lặp qua danh sách các mã.
    """
    logger.info(f"🚀 Bắt đầu giai đoạn EXTRACT (Mode: {mode})...")
    if symbols is None:
        symbols = DEFAULT_STOCKS if mode == "stock" else DEFAULT_CRYPTO
    
    raw_results = {} # Lưu JSON giá thô
    raw_news = {}    # Lưu JSON tin tức thô
    parsed_dfs = []  # Lưu các DataFrame đã parse sơ bộ
    
    for i, sym in enumerate(symbols):
        # 1. Lấy dữ liệu giá
        if mode == "crypto":
            raw_json = get_binance_data_raw(sym)
        else:
            raw_json = get_daily_stock_data_raw(sym)
            
        if raw_json:
            raw_results[sym] = raw_json
            df = parse_raw_data(sym, raw_json)
            if not df.empty:
                parsed_dfs.append(df)
        
        # 2. Lấy dữ liệu tin tức (Chỉ lấy cho 3 mã đầu để tiết kiệm API Key)
        if i < 3:
            news_json = get_stock_news_sentiment(sym)
            if news_json: raw_news[sym] = news_json

        if i < len(symbols) - 1 and mode == "stock":
            logger.info(f"⏳ Đang chờ 18s để tuân thủ giới hạn API Alpha Vantage...")
            time.sleep(18)
            
    if not raw_results:
        logger.error("❌ Không lấy được dữ liệu nào.")
        return {}
        
    # Gộp tất cả DataFrame của các mã thành một bảng duy nhất
    combined_df = pd.concat(parsed_dfs) if parsed_dfs else pd.DataFrame()
    
    return {
        "raw": raw_results,       # Dữ liệu thô cho Bronze
        "raw_news": raw_news,     # Tin tức thô cho Bronze
        "prices": combined_df,    # Dữ liệu đã parse cho Silver
        "extracted_at": datetime.now(timezone.utc) # Thời điểm thu thập
    }


if __name__ == "__main__":
    # Test nhanh một mã Apple
    data = extract(["AAPL"])
    if data:
        print("\n=== MẪU DỮ LIỆU THÔ (Bronze) ===")
        print(list(data["raw"].keys()))
        print("\n=== MẪU DỮ LIỆU ĐÃ PARSE (Silver Foundation) ===")
        print(data["prices"].tail(2))
