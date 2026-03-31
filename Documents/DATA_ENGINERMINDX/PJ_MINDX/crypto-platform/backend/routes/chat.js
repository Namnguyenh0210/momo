/**
 * Routes: /api/chat — AI Stock Assistant (Medallion Architecture Layer)
 * Mô hình: Chatbot AI + RAG (Dữ liệu thực tế bối cảnh hóa)
 */
const express = require("express");
const router  = express.Router();
const db      = require("../db"); // Kết nối Database từ module quản trị
const OpenAI  = require("openai"); // Thư viện kết nối với Trí tuệ nhân tạo (LLM)

// Khởi tạo thực thể OpenAI (Yêu cầu API Key từ biền môi trường)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// =========================================
// Context builder: Cỗ máy lấy bối cảnh thực tế cho AI (RAG)
// =========================================
async function buildStockMarketContext() {
  /**
   * Thay vì để AI trả lời bừa, hàm này sẽ đi vào tầng GOLD Layer 
   * để lấy dữ liệu giá, chỉ số kỹ thuật và TIN TỨC thực tế.
   */
  try {
    // 🟠 CHỨNG NĂNG GOM DỮ LIỆU TỔNG HỢP (Prices + Market Summary + News Sentiment)
    const [prices, news] = await Promise.all([
      db.query("SELECT * FROM gold.v_market_snapshot ORDER BY symbol"),
      db.query(`
        SELECT s.symbol, n.title, n.overall_sentiment_label 
        FROM gold.stock_news n
        JOIN silver.stocks s ON s.id = n.stock_id
        ORDER BY n.published_at DESC LIMIT 10
      `)
    ]);

    // Chuyển danh sách giá thành 1 chuỗi văn bản (Ticker Text) để AI đọc
    const tickerText = prices.rows.map(r =>
      `${r.symbol}: $${parseFloat(r.price).toFixed(2)} (${parseFloat(r.percent_change || 0).toFixed(2)}%), Tín hiệu: ${r.trend_signal}`
    ).join("\n");

    // Chuyển danh sách tin tức & sentiment thành văn bản (Sentiment Text)
    const newsText = news.rows.map(n => 
      `- ${n.symbol}: ${n.title} (Tâm lý: ${n.overall_sentiment_label})`
    ).join("\n");

    const totalStocks = prices.rows.length; // Tổng mã quan sát
    const gainers = prices.rows.filter(r => parseFloat(r.percent_change) > 0).length; // Số mã đang xanh (Tăng)
    const losers = totalStocks - gainers; // Số mã đang đỏ (Giảm)

    // Trả về một khối văn bản chứa TOÀN BỘ BỐI CẢNH thị trường (Context)
    return `
=== DỮ LIỆU THỊ TRƯỜNG GOLD LAYER (Cập nhật ${new Date().toLocaleDateString("vi-VN")}) ===

📊 TỔNG QUAN:
- Mã tăng: ${gainers} | Mã giảm: ${losers}

📈 DANH SÁCH GIÁ & TÍN HIỆU XU HƯỚNG:
${tickerText}

📰 TIN TỨC & SENTIMENT THỊ TRƯỜNG GẦN ĐÂY:
${newsText || "Hiện tại chưa có tin tức thị trường mới nhất."}

💡 Chú ý cho AI: Bullish (Tín hiệu mua), Bearish (Tín hiệu bán), Neutral (Chờ đợi).
`.trim();
  } catch (err) {
    console.error("❌ Lỗi khi xây dựng Context cho AI:", err.message);
    return "Hệ thống đang gặp trục trặc, không thể lấy bối cảnh thị trường Gold Layer.";
  }
}

// =========================================
// POST /api/chat: Endpoint nhận câu hỏi từ người dùng
// =========================================
router.post("/", async (req, res) => {
  const { message, history = [] } = req.body; // Tin nhắn mới + Lịch sử trò chuyện

  try {
    // 🟠 1. Thực hiện TRUY VẤN (RETRIEVE) dữ liệu thực từ GOLD Layer
    const context = await buildStockMarketContext();

    // 🟠 2. Thiết lập SYSTEM PROMPT (Quy định tính cách của AI)
    // Hệ thống ép AI phải sử dụng dữ liệu thị trường thực tế vừa lấy được (Context)
    const systemPrompt = `Bạn là "StockAI Assistant" - Chuyên gia phân tích dữ liệu thị trường Mỹ.
Bạn vận hành trên nền tảng Medallion Architecture (Bronze-Silver-Gold) đảm bảo dữ liệu cực kỳ chính xác.

Dưới đây là DỮ LIỆU THỊ TRƯỜNG THỰC TẾ (Gold Layer) mà bạn phải sử dụng để trả lời:
${context}

HƯỚNG DẪN TRẢ LỜI:
- Luôn trả lời bằng tiếng Việt, chuyên nghiệp, sử dụng biểu tượng cảm xúc (Emoji).
- Tuyệt đối dựa vào Giá và Tín hiệu (Bullish/Bearish) từ dữ liệu Gold Layer để phân tích.
- Phải nhắc đến các tin tức thị trường (News Sentiment) nếu có mã người dùng hỏi.
- Nếu không có dữ liệu về mã đó, hãy khéo léo thông báo bạn chỉ theo dõi 10 mã (AAPL, MSFT, ...).
- Khuyên người dùng thận trọng, bạn chỉ cung cấp công cụ phân tích dữ liệu, không chịu trách nhiệm đầu tư.`;

    // 🟠 3. Kết hợp Lịch sử + System Prompt + Câu hỏi mới để gửi lên AI
    const recentHistory = (history || []).slice(-10); // Chỉ lấy 10 câu trao đổi gần nhất để tiết kiệm Token
    const messages = [
      { role: "system", content: systemPrompt }, // Chỉ thị hệ thống
      ...recentHistory,                          // Lịch sử trao đổi
      { role: "user", content: message.trim() }  // Câu hỏi mới
    ];

    // 🟠 4. GỌI MÁY CHỦ OPENAI (GPT-4o-mini)
    const completion = await openai.chat.completions.create({
      model:       process.env.OPENAI_MODEL || "gpt-4o-mini", // Sử dụng Model mini để tốc độ nhanh & tiết kiệm chi phí
      messages,
      max_tokens:  800, // Giới hạn độ dài câu trả lời
      temperature: 0.7, // Độ sáng tạo vừa phải (Cần tính chính xác cao cho tài chính)
    });

    // Trả lời phản hồi văn bản của AI về cho Frontend
    res.json({ 
        success: true, 
        reply: completion.choices[0].message.content 
    });

  } catch (err) {
    console.error("❌ Lỗi API Chatbot:", err.message);
    res.status(500).json({ success: false, error: "Hệ thống AI Assistant đang bận. Vui lòng thử lại sau giây lát." });
  }
});

module.exports = router;
