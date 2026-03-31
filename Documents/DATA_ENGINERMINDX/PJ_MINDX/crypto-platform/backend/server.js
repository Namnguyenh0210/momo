/**
 * Crypto Data Platform — Backend API Server
 * Node.js + Express
 */
require("dotenv").config();

const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const compression  = require("compression");
const morgan       = require("morgan");
const rateLimit    = require("express-rate-limit");
const path         = require("path");

const stocksRouter = require("./routes/stocks");
const chatRouter   = require("./routes/chat");

const app  = express();
const PORT = process.env.PORT || 3000;

// =============================================
// MIDDLEWARE
// =============================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan("combined"));
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting — tránh lạm dụng API
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 phút
  max: 100,                   // 100 requests / phút
  message: { success: false, error: "Quá nhiều request. Vui lòng thử lại sau." },
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,                    // 20 chat requests / phút
  message: { success: false, error: "Quá nhiều yêu cầu chat. Vui lòng thử lại sau 1 phút." },
});

// =============================================
// SERVE STATIC DASHBOARD
// =============================================
app.use(express.static(path.join(__dirname, "../dashboard")));

// =============================================
// API ROUTES
// =============================================
app.use("/api", apiLimiter);
app.use("/api", stocksRouter);
app.use("/api/chat", chatLimiter, chatRouter);

// =============================================
// HEALTH CHECK
// =============================================
app.get("/health", async (req, res) => {
  const db = require("./db");
  let dbStatus = "unknown";
  let dbLatency = 0;

  try {
    const start = Date.now();
    await db.query("SELECT 1");
    dbLatency = Date.now() - start;
    dbStatus = "connected";
  } catch {
    dbStatus = "disconnected";
  }

  res.json({
    status:    "ok",
    timestamp: new Date().toISOString(),
    uptime:    `${Math.floor(process.uptime())}s`,
    database:  { status: dbStatus, latency: `${dbLatency}ms` },
    version:   "1.0.0",
  });
});

// =============================================
// 404 và ERROR HANDLER
// =============================================
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ success: false, error: `Route ${req.path} không tồn tại` });
  }
  // Trả về dashboard cho mọi route khác (SPA style)
  res.sendFile(path.join(__dirname, "../dashboard/index.html"));
});

app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// =============================================
// START SERVER
// =============================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🚀 Crypto Data Platform Backend     ║
║   Port: ${PORT}                            ║
║   Mode: ${process.env.NODE_ENV || "development"}                  ║
╠════════════════════════════════════════╣
║  📡 API:     http://localhost:${PORT}/api  ║
║  💊 Health:  http://localhost:${PORT}/health║
║  🌐 Web:     http://localhost:${PORT}       ║
╚════════════════════════════════════════╝
  `);
});

module.exports = app;
