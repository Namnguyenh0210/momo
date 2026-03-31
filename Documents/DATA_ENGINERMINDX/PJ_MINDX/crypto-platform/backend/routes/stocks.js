/**
 * Routes: /api/stocks — Lấy dữ liệu từ Medallion Architecture (Tầng Silver & Gold)
 * Quản lý các cổng lấy giá, biểu đồ và chỉ số.
 */
const express = require("express");
const router  = express.Router();
const db      = require("../db"); // Kết nối Database từ module quản trị Pooling

// =========================================
// GET /api/market-data: Toàn bộ danh sách snapshot thị trường (Từ Gold View)
// =========================================
router.get("/market-data", async (req, res) => {
  try {
    // 🟠 Truy vấn trực tiếp từ View Snaphot (Dữ liệu đã được gộp từ Silver và Gold)
    // View này cung cấp giá mới nhất + % biến động + tín hiệu xu hướng (Trend Signal)
    const query = "SELECT * FROM gold.v_market_snapshot ORDER BY symbol";
    const result = await db.query(query);

    // Trả lời phản hồi JSON về cho Browser (Frontend)
    res.json({
        success: true,
        data: result.rows,
        timestamp: new Date().toISOString()
    });
  } catch (err) {
    // 🟠 Log lỗi máy chủ nếu truy vấn database thất bại
    console.error("❌ Lỗi tại /market-data:", err.message);
    res.status(500).json({ success: false, error: "Lỗi kết nối Kho Dữ liệu (Gold Layer)" });
  }
});

// =========================================
// GET /api/stock-charts/:symbol: Lịch sử giá phục vụ vẽ biểu đồ (Chart.js)
// =========================================
router.get("/stock-charts/:symbol", async (req, res) => {
  const { symbol } = req.params; // Lấy mã từ URL (Ví dụ: AAPL)
  const { limit = 30 } = req.query; // Số lượng ngày muốn lấy (Mặc định 30 phiên)

  try {
    // 🟠 1. LẤY DỮ LIỆU GIÁ & CHỈ SỐ KỸ THUẬT (Price & Features)
    // Kết hợp (JOIN) tầng Silver (Giá) và Gold (Chỉ số MA) để vẽ biểu đồ đa lớp
    const priceQuery = `
      SELECT p.date, p.open_price, p.high_price, p.low_price, p.close_price, p.volume,
             m.ma5, m.ma10, m.percent_change, m.trend_signal
      FROM silver.prices p
      JOIN silver.stocks s ON s.id = p.stock_id
      LEFT JOIN gold.stock_metrics m ON m.stock_id = s.id AND m.date = p.date
      WHERE s.symbol = $1
      ORDER BY p.date DESC
      LIMIT $2
    `;
    const priceRes = await db.query(priceQuery, [symbol.toUpperCase(), limit]);

    // 🟠 2. LẤY TIN TỨC ĐỂ ĐÁNH DẤU TRÊN BIỂU ĐỒ (Marker News)
    // Hệ thống lấy các tin tức có Sentiment để hiển thị icon tờ báo (📰) lên Chart
    const newsQuery = `
      SELECT published_at::date as date, title, url, overall_sentiment_label
      FROM gold.stock_news n
      JOIN silver.stocks s ON s.id = n.stock_id
      WHERE s.symbol = $1
      ORDER BY published_at DESC LIMIT 50
    `;
    const newsRes = await db.query(newsQuery, [symbol.toUpperCase()]);

    // 🟠 PHẢN HỒI JSON TỔNG HỢP: Gồm mảng Giá và mảng Tin tức
    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      data: priceRes.rows.reverse(), // Đảo ngược để vẽ từ Quá khứ sang Hiện tại (Trái -> Phải)
      news_markers: newsRes.rows
    });
  } catch (err) {
    console.error(`❌ Lỗi tại /stock-charts/${symbol}:`, err.message);
    res.status(500).json({ success: false, error: "Lỗi truy vấn Dữ liệu lịch sử & Tin tức" });
  }
});

module.exports = router;
