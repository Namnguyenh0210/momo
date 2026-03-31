# 🚀 Crypto Data Platform + AI

> **End-to-end crypto data platform** — Thu thập, xử lý, lưu trữ và phân tích dữ liệu từ Binance với AI Chatbot.

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://postgresql.org)
[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.10+-yellow)](https://python.org)
[![Airflow](https://img.shields.io/badge/Apache%20Airflow-2.x-red)](https://airflow.apache.org)

---

## 🏗️ Kiến trúc hệ thống

```
Binance API  ──►  ETL Python  ──►  PostgreSQL (Data Warehouse)
                     ▲                    │                 │
              Apache Airflow         Node.js API      Web Dashboard
              (5 phút/lần)               │
                                    AI Chatbot
                                  (GPT-4o-mini)
```

## 🧩 Tech Stack

| Thành phần     | Công nghệ                    |
|----------------|------------------------------|
| Data Source    | Binance Public API           |
| ETL            | Python (Pandas, NumPy)       |
| Orchestration  | Apache Airflow               |
| Database       | PostgreSQL 15 (Data Warehouse)|
| Backend        | Node.js + Express            |
| AI             | OpenAI GPT-4o-mini           |
| Dashboard      | HTML/CSS/JS + Chart.js       |
| DevOps         | Docker, Docker Compose       |

---

## 📁 Cấu trúc Project

```
crypto-platform/
├── database/
│   └── schema.sql           # PostgreSQL schema (fact + dimension)
├── etl/
│   ├── extract.py           # Lấy data từ Binance API
│   ├── transform.py         # Tính MA5/MA10/MA20, RSI, volatility
│   ├── load.py              # Load vào PostgreSQL
│   ├── pipeline.py          # Full ETL in one command
│   └── requirements.txt
├── airflow/
│   └── dags/
│       └── crypto_etl_dag.py  # DAG schedule mỗi 5 phút
├── backend/
│   ├── server.js            # Express server
│   ├── db.js                # PostgreSQL pool
│   ├── routes/
│   │   ├── prices.js        # API endpoints
│   │   └── chat.js          # AI chatbot endpoint
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── dashboard/
│   ├── index.html           # Main dashboard
│   ├── chatbot.html         # AI chatbot UI
│   ├── css/style.css        # Dark glassmorphism design
│   └── js/
│       ├── main.js          # Charts + realtime data
│       └── chatbot.js       # Chat UI
├── docker-compose.yml
├── Makefile
└── README.md
```

---

## 🚀 Cách chạy

### Cách 1: Nhanh nhất (Docker — khuyến nghị)

```bash
# 1. Clone và vào thư mục
cd crypto-platform

# 2. Khởi động PostgreSQL + Backend
docker-compose up -d

# 3. Mở web
open http://localhost:3000
```

### Cách 2: Manual (development)

**Bước 1: Setup database**
```bash
# Đảm bảo PostgreSQL đang chạy
docker-compose up -d postgres pgadmin
```

**Bước 2: Cài và chạy backend**
```bash
cd backend
cp .env.example .env
# ⚠️  Thêm OPENAI_API_KEY vào .env
npm install
npm run dev
```

**Bước 3: Chạy ETL pipeline**
```bash
cd etl
pip install -r requirements.txt
python pipeline.py
```

**Bước 4: Airflow (tự động hoá)**
```bash
# Cài Airflow
pip install apache-airflow
airflow db init
airflow scheduler &
airflow webserver &
# UI: http://localhost:8080
```

### Dùng Makefile
```bash
make init        # Full setup lần đầu
make docker-up   # Khởi động services
make etl         # Chạy ETL một lần
make dev         # Start backend dev mode
make help        # Xem tất cả lệnh
```

---

## 📡 API Endpoints

| Endpoint               | Mô tả                                |
|------------------------|--------------------------------------|
| `GET /api/coins`       | Danh sách coins đang theo dõi       |
| `GET /api/ticker`      | Giá realtime mới nhất tất cả coins  |
| `GET /api/prices?symbol=BTCUSDT&limit=100` | Lịch sử giá OHLCV |
| `GET /api/top-gainers` | Top 5 coins tăng mạnh nhất 24h      |
| `GET /api/top-losers`  | Top 5 coins giảm mạnh nhất 24h      |
| `GET /api/volume`      | Volume xếp hạng                      |
| `GET /api/metrics?symbol=BTCUSDT` | MA5/MA10/MA20/RSI        |
| `GET /api/market-summary` | Tổng quan thị trường              |
| `POST /api/chat`       | AI Chatbot (cần OPENAI_API_KEY)     |
| `GET /health`          | Health check                          |

---

## 🗃️ Database Schema

```sql
-- DIMENSION
coins (id, symbol, name, base_asset, quote_asset)

-- FACT TABLES
prices (id, coin_id, open, high, low, close, volume, timestamp)
metrics (id, coin_id, ma5, ma10, ma20, percent_change, rsi, volatility, timestamp)
ticker_snapshots (id, coin_id, price, price_change_pct, volume_24h, timestamp)

-- VIEWS
v_latest_prices    -- Giá mới nhất mỗi coin
v_top_gainers      -- Top tăng
v_top_losers       -- Top giảm
v_latest_metrics   -- Chỉ số kỹ thuật mới nhất
```

---

## 🌐 Web Dashboard

| Tính năng | Mô tả |
|-----------|-------|
| 📊 Stat Cards | BTC/ETH price, total volume, top gainer |
| 📈 Biểu đồ giá | Line chart OHLCV + MA5/MA10 theo từng coin |
| 🍩 Volume Chart | Doughnut distribution top 5 coins |
| 🌍 Market Table | Toàn bộ thị trường với change badge |
| 💧 Volume Bars | Volume ranking với bar chart |
| 🧮 Metrics | MA5/MA10/MA20, RSI gauge, volatility |
| 🚀/📉 Gainers/Losers | Top 5 tăng/giảm |
| 🤖 AI Chatbot | Chat hỏi về thị trường bằng tiếng Việt |

---

## 🤖 AI Chatbot

```
User: "BTC hôm nay bao nhiêu?"
       ↓
Backend query DB → lấy giá, metrics
       ↓
Gửi context + câu hỏi → OpenAI GPT-4o-mini
       ↓
AI trả lời tự nhiên bằng tiếng Việt với số liệu thật
```

Ví dụ câu hỏi:
- "BTC đang ở mức giá bao nhiêu?"
- "Coin nào tăng mạnh nhất hôm nay?"
- "Phân tích kỹ thuật ETH — MA và RSI?"
- "Tổng volume thị trường hôm nay?"

---

## 🏆 Điểm mạnh khi phỏng vấn

> *"I built an end-to-end crypto data platform that ingests real-time data from Binance, processes it using ETL pipelines orchestrated by Airflow, stores it in a PostgreSQL data warehouse (fact/dimension design), and serves both a premium web dashboard and an AI-powered chatbot for querying financial data in Vietnamese."*

✅ **Data Engineering**: ETL pipeline, Data Warehouse design, scheduling  
✅ **Backend**: RESTful API, connection pooling, error handling  
✅ **AI Integration**: OpenAI với dynamic DB context  
✅ **DevOps**: Docker, environment configs, health checks  
✅ **Business Domain**: Finance / Crypto — dễ giải thích với PO

---

## 🔧 Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=crypto_db
DB_USER=postgres
DB_PASSWORD=postgres123

# Backend
PORT=3000
NODE_ENV=production

# AI (https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

---

## 📊 pgAdmin Access

- URL: `http://localhost:5050`
- Email: `admin@crypto.local`
- Password: `admin123`
- Add server: host=`postgres`, port=`5432`, user=`postgres`, pass=`postgres123`
