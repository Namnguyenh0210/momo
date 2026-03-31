# DBT - Data Build Tool Models (Simulated)
# Project: stock_dw

models:
  # =============================================
  # SILVER MODELS (Staging)
  # =============================================
  stg_stocks: |
    SELECT id, symbol, name, sector 
    FROM {{ source('alpha_vantage', 'raw_stock_data') }}
    WHERE symbol IS NOT NULL

  stg_prices: |
    SELECT 
        id, 
        stock_id, 
        (raw_json->>'date')::DATE as date,
        (raw_json->>'close')::NUMERIC as close_price
    FROM {{ source('alpha_vantage', 'raw_stock_data') }}

  # =============================================
  # GOLD MODELS (Marts)
  # =============================================
  fct_stock_metrics: |
    WITH daily_prices AS (
      SELECT * FROM {{ ref('stg_prices') }}
    )
    SELECT 
      stock_id,
      date,
      AVG(close_price) OVER (PARTITION BY stock_id ORDER BY date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) as ma5,
      (close_price - LAG(close_price) OVER (PARTITION BY stock_id ORDER BY date)) / LAG(close_price) OVER (PARTITION BY stock_id ORDER BY date) * 100 as pct_change
    FROM daily_prices
