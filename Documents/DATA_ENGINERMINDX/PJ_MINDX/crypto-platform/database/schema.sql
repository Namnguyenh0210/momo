-- =============================================
-- AI STOCK ASSISTANT - Medallion Architecture
-- =============================================

-- Schemas
CREATE SCHEMA IF NOT EXISTS bronze;
CREATE SCHEMA IF NOT EXISTS silver;
CREATE SCHEMA IF NOT EXISTS gold;

-- Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- BRONZE LAYER: Raw Data
-- =============================================
CREATE TABLE IF NOT EXISTS bronze.raw_stock_data (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(20) NOT NULL,
    raw_json    JSONB       NOT NULL,
    extracted_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SILVER LAYER: Cleaned & Validated
-- =============================================
CREATE TABLE IF NOT EXISTS silver.stocks (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(20) NOT NULL UNIQUE,
    name        VARCHAR(100),
    sector      VARCHAR(100),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS silver.prices (
    id          BIGSERIAL PRIMARY KEY,
    stock_id    INT REFERENCES silver.stocks(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    open_price  NUMERIC(20,4),
    high_price  NUMERIC(20,4),
    low_price   NUMERIC(20,4),
    close_price NUMERIC(20,4) NOT NULL,
    volume      BIGINT,
    UNIQUE(stock_id, date)
);

-- =============================================
-- GOLD LAYER: Aggregated & Business Analytics
-- =============================================
CREATE TABLE IF NOT EXISTS gold.stock_metrics (
    id             BIGSERIAL PRIMARY KEY,
    stock_id       INT REFERENCES silver.stocks(id) ON DELETE CASCADE,
    date           DATE NOT NULL,
    ma5            NUMERIC(20,4),
    ma10           NUMERIC(20,4),
    percent_change NUMERIC(10,4),
    volatility     NUMERIC(10,4),
    trend_signal   VARCHAR(20), -- 'Bullish', 'Bearish', 'Neutral'
    UNIQUE(stock_id, date)
);

CREATE TABLE IF NOT EXISTS gold.stock_news (
    id             BIGSERIAL PRIMARY KEY,
    stock_id       INT REFERENCES silver.stocks(id) ON DELETE CASCADE,
    title          TEXT,
    url            TEXT,
    summary        TEXT,
    overall_sentiment_score NUMERIC(5,4),
    overall_sentiment_label VARCHAR(20),
    published_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_silver_prices_date ON silver.prices(date DESC);
CREATE INDEX IF NOT EXISTS idx_gold_metrics_date  ON gold.stock_metrics(date DESC);

-- Seed Data (Silver)
INSERT INTO silver.stocks (symbol, name, sector) VALUES
    ('AAPL', 'Apple Inc.', 'Technology'),
    ('MSFT', 'Microsoft Corp.', 'Technology'),
    ('GOOGL', 'Alphabet Inc.', 'Technology'),
    ('AMZN', 'Amazon.com Inc.', 'Consumer Cyclical'),
    ('TSLA', 'Tesla Inc.', 'Consumer Cyclical'),
    ('NVDA', 'NVIDIA Corp.', 'Technology'),
    ('META', 'Meta Platforms Inc.', 'Communication Services'),
    ('V', 'Visa Inc.', 'Financial Services'),
    ('JPM', 'JPMorgan Chase & Co.', 'Financial Services'),
    ('WMT', 'Walmart Inc.', 'Consumer Defensive')
ON CONFLICT (symbol) DO NOTHING;

-- =============================================
-- GOLD VIEWS (Reporting Layer)
-- =============================================

-- View phục vụ Dashboard & AI
CREATE OR REPLACE VIEW gold.v_market_snapshot AS
SELECT 
    s.id AS stock_id,
    s.symbol,
    s.name,
    p.close_price AS price,
    p.date,
    m.percent_change,
    m.ma5,
    m.ma10,
    m.volatility,
    m.trend_signal
FROM silver.stocks s
JOIN silver.prices p ON s.id = p.stock_id
LEFT JOIN gold.stock_metrics m ON s.id = m.stock_id AND p.date = m.date
WHERE p.date = (SELECT MAX(date) FROM silver.prices);
