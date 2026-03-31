/**
 * Routes: /api/prices, /api/coins, /api/top-gainers, /api/volume, /api/metrics
 * Có Binance direct fallback khi DB chưa sẵn sàng
 */
const express  = require("express");
const router   = express.Router();
const db       = require("../db");
const { getBinanceTicker, getBinanceKlines } = require("../binanceFallback");

// =========================================
// GET /api/coins — Danh sách coins
// =========================================
router.get("/coins", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, symbol, name, base_asset, quote_asset, created_at FROM coins WHERE is_active = TRUE ORDER BY symbol"
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ /coins:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================
// GET /api/prices?symbol=BTCUSDT&limit=100
// Lịch sử giá theo klines (OHLCV)
// =========================================
router.get("/prices", async (req, res) => {
  const { symbol = "BTCUSDT", limit = 100 } = req.query;
  const maxLimit = Math.min(parseInt(limit), 500);

  try {
    const result = await db.query(
      `SELECT p.id, c.symbol, c.name,
              p.open_price, p.high_price, p.low_price, p.close_price,
              p.volume, p.quote_volume, p.num_trades, p.timestamp
       FROM prices p
       JOIN coins c ON c.id = p.coin_id
       WHERE c.symbol = $1
       ORDER BY p.timestamp DESC
       LIMIT $2`,
      [symbol.toUpperCase(), maxLimit]
    );
    if (result.rows.length > 0) {
      return res.json({
        success: true,
        symbol: symbol.toUpperCase(),
        count: result.rows.length,
        data: result.rows.reverse(),
      });
    }
  } catch (err) {
    console.warn("⚠️  DB prices unavailable, Binance fallback for", symbol);
  }

  // Fallback: kỹ thuật từ Binance trực tiếp
  try {
    const klines = await getBinanceKlines(symbol.toUpperCase(), "5m", maxLimit);
    res.json({ success: true, symbol: symbol.toUpperCase(), count: klines.length, data: klines, source: "binance_direct" });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================
// GET /api/ticker — Giá realtime mới nhất
// =========================================
router.get("/ticker", async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM v_latest_prices ORDER BY symbol`);
    if (result.rows.length > 0) {
      return res.json({ success: true, count: result.rows.length, data: result.rows });
    }
  } catch (err) {
    console.warn("⚠️  DB ticker unavailable, using Binance fallback");
  }
  try {
    const data = await getBinanceTicker();
    res.json({ success: true, count: data.length, data, source: "binance_direct" });
  } catch (e) {
    console.error("❌ /ticker binance fallback:", e.message);
    res.status(500).json({ success: false, error: "Không lấy được giá từ DB và Binance" });
  }
});

// =========================================
// GET /api/top-gainers — Top 5 tăng mạnh
// =========================================
router.get("/top-gainers", async (req, res) => {
  const { limit = 5 } = req.query;
  try {
    const result = await db.query(`SELECT * FROM v_top_gainers LIMIT $1`, [Math.min(parseInt(limit), 20)]);
    if (result.rows.length > 0) {
      return res.json({ success: true, data: result.rows });
    }
  } catch (err) {
    console.warn("⚠️  DB top-gainers unavailable, using Binance fallback");
  }
  try {
    const data = await getBinanceTicker();
    const sorted = data.sort((a, b) => b.price_change_pct - a.price_change_pct).slice(0, parseInt(limit));
    res.json({ success: true, data: sorted, source: "binance_direct" });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================
// GET /api/top-losers — Top 5 giảm mạnh
// =========================================
router.get("/top-losers", async (req, res) => {
  const { limit = 5 } = req.query;
  try {
    const result = await db.query(`SELECT * FROM v_top_losers LIMIT $1`, [Math.min(parseInt(limit), 20)]);
    if (result.rows.length > 0) {
      return res.json({ success: true, data: result.rows });
    }
  } catch (err) {
    console.warn("⚠️  DB top-losers unavailable, using Binance fallback");
  }
  try {
    const data = await getBinanceTicker();
    const sorted = data.sort((a, b) => a.price_change_pct - b.price_change_pct).slice(0, parseInt(limit));
    res.json({ success: true, data: sorted, source: "binance_direct" });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================
// GET /api/volume — Volume tổng hợp
// =========================================
router.get("/volume", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT symbol, name, volume_24h,
              ROUND(volume_24h::NUMERIC) AS volume_formatted,
              price_change_pct
       FROM v_latest_prices
       ORDER BY volume_24h DESC`
    );
    if (result.rows.length > 0) {
      return res.json({ success: true, data: result.rows });
    }
  } catch (err) {
    console.warn("⚠️  DB volume unavailable, using Binance fallback");
  }
  try {
    const data = await getBinanceTicker();
    const sorted = data.sort((a, b) => b.volume_24h - a.volume_24h);
    res.json({ success: true, data: sorted, source: "binance_direct" });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// =========================================
// GET /api/metrics?symbol=BTCUSDT
// Chỉ số kỹ thuật: MA5, MA10, MA20, RSI
// =========================================
router.get("/metrics", async (req, res) => {
  const { symbol } = req.query;

  try {
    let result;
    if (symbol) {
      result = await db.query(
        `SELECT * FROM v_latest_metrics WHERE symbol = $1`,
        [symbol.toUpperCase()]
      );
    } else {
      result = await db.query(`SELECT * FROM v_latest_metrics ORDER BY symbol`);
    }
    res.json({ success: true, data: result.rows });
  } catch (err) {
    // Metrics chỉ có từ DB — trả về empty khi chưa có data
    res.json({ success: true, data: [], message: "Chạy ETL pipeline để có dữ liệu chỉ số kỹ thuật" });
  }
});

// =========================================
// GET /api/market-summary — Tổng quan thị trường
// =========================================
router.get("/market-summary", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM get_market_summary()");
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    // Fallback từ Binance
    try {
      const data = await getBinanceTicker();
      const gainers = data.filter(d => d.price_change_pct > 0).length;
      const losers  = data.filter(d => d.price_change_pct < 0).length;
      const totalVol = data.reduce((s, d) => s + d.volume_24h, 0);
      const avgChg   = data.reduce((s, d) => s + d.price_change_pct, 0) / (data.length || 1);
      res.json({
        success: true,
        data: { total_coins: data.length, gainers_count: gainers, losers_count: losers, total_volume: totalVol, avg_change_pct: avgChg },
        source: "binance_direct"
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
});

module.exports = router;
