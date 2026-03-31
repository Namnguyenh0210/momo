/**
 * Binance Direct Fallback — khi DB chưa có dữ liệu
 * Gọi thẳng Binance public API để hiển thị realtime data
 */
const https = require('https');

const TRACKED_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
];

const COIN_NAMES = {
  BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', BNBUSDT: 'BNB',
  SOLUSDT: 'Solana',  XRPUSDT: 'XRP',      ADAUSDT: 'Cardano',
  DOGEUSDT:'Dogecoin',AVAXUSDT:'Avalanche', DOTUSDT: 'Polkadot',
  LINKUSDT:'Chainlink',
};

function binanceFetch(path) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://api.binance.com${path}`, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getBinanceTicker() {
  const all = await binanceFetch('/api/v3/ticker/24hr');
  const filtered = all.filter(t => TRACKED_SYMBOLS.includes(t.symbol));
  return filtered.map(t => ({
    coin_id:         null,
    symbol:          t.symbol,
    name:            COIN_NAMES[t.symbol] || t.symbol,
    price:           parseFloat(t.lastPrice),
    price_change:    parseFloat(t.priceChange),
    price_change_pct:parseFloat(t.priceChangePercent),
    volume_24h:      parseFloat(t.volume),
    high_24h:        parseFloat(t.highPrice),
    low_24h:         parseFloat(t.lowPrice),
    timestamp:       new Date().toISOString(),
  }));
}

async function getBinanceKlines(symbol, interval = '5m', limit = 60) {
  const data = await binanceFetch(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  return data.map(d => ({
    symbol,
    open_time:   d[0],
    open_price:  parseFloat(d[1]),
    high_price:  parseFloat(d[2]),
    low_price:   parseFloat(d[3]),
    close_price: parseFloat(d[4]),
    volume:      parseFloat(d[5]),
    timestamp:   new Date(d[0]).toISOString(),
  }));
}

module.exports = { getBinanceTicker, getBinanceKlines, TRACKED_SYMBOLS };
