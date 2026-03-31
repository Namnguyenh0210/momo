/**
 * FinanceAI Dashboard — Main Operations
 * Upgraded: Hero Card, Buy/Hold/Sell, Risk, Sparkline, Suggestions
 */

// =============================================
// STATE & CONFIG
// =============================================
const API_BASE = '/api';
let priceChart = null;
let sparklineCharts = {};
let currentSymbol = 'BTCUSDT';
let currentSegment = 'crypto';
let currentLimit = 7;
let currentTfLabel = '7D';
let lastUpdatedAt = null;
let allMarketData = [];

// =============================================
// INITIALIZATION
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initTimeframeTabs();
    refreshAll();
    setInterval(refreshAll, 30000);
    setInterval(updateTimeAgo, 10000);
});

// =============================================
// TAB INITIALIZATION
// =============================================
function initTabs() {
    document.querySelectorAll('.coin-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            const parent = tab.parentElement;
            parent.querySelectorAll('.coin-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const newSymbol = tab.getAttribute('data-symbol');
            if (newSymbol === currentSymbol) return;

            currentSymbol = newSymbol;
            document.getElementById('metrics-stock-label').innerText = currentSymbol;
            document.getElementById('price-chart-subtitle').innerText = `Đang tải ${currentSymbol}...`;

            if (priceChart) { priceChart.destroy(); priceChart = null; }

            await updateChart(currentSymbol, currentLimit);
            renderStockMetrics(currentSymbol);
        });
    });
}

function initTimeframeTabs() {
    // Default timeframe = 7D
    currentLimit = 7;

    document.querySelectorAll('.tf-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('.tf-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            currentLimit = parseInt(tab.getAttribute('data-limit'));
            currentTfLabel = tab.innerText; // '1H', '4H', '1D', '7D', '1M'

            // Cập nhật subtitle với timeframe
            const subtitle = document.getElementById('price-chart-subtitle');
            if (subtitle) subtitle.innerText = `Đang tải ${currentSymbol} · ${currentTfLabel}...`;

            if (priceChart) { priceChart.destroy(); priceChart = null; }
            await updateChart(currentSymbol, currentLimit, currentTfLabel);
        });
    });
}

// =============================================
// SEGMENT SWITCH
// =============================================
function switchSegment(type) {
    currentSegment = type;
    document.querySelectorAll('.segment-item').forEach(item => item.classList.remove('active'));
    document.getElementById(`segment-${type}`).classList.add('active');

    document.getElementById('crypto-stats-grid').style.display = type === 'crypto' ? 'block' : 'none';
    document.getElementById('stock-stats-grid').style.display = type === 'stock' ? 'block' : 'none';
    document.getElementById('crypto-tabs').style.display = type === 'crypto' ? 'flex' : 'none';
    document.getElementById('stock-tabs').style.display = type === 'stock' ? 'flex' : 'none';
    document.getElementById('suggestion-section').style.display = type === 'crypto' ? 'block' : 'none';

    document.getElementById('chart-type-label').innerText = type === 'crypto' ? '(Crypto)' : '(Chứng khoán)';
    document.getElementById('table-type-label').innerText = type === 'crypto' ? 'Crypto' : 'Chứng khoán';

    const defaultSym = type === 'crypto' ? 'BTCUSDT' : 'AAPL';
    currentSymbol = defaultSym;

    const activeCont = document.getElementById(`${type}-tabs`);
    activeCont.querySelectorAll('.coin-tab').forEach(t => t.classList.remove('active'));
    const tabToActive = activeCont.querySelector(`[data-symbol="${defaultSym}"]`);
    if (tabToActive) tabToActive.classList.add('active');

    renderMarketTable(allMarketData);
    updateChart(currentSymbol, currentLimit);
    renderStockMetrics(currentSymbol);
}

// =============================================
// CORE REFRESH
// =============================================
async function refreshAll() {
    const btn = document.getElementById('refresh-btn');
    if (btn) btn.classList.add('spinning');

    try {
        const marketData = await fetchMarketData();
        if (marketData && marketData.success) {
            allMarketData = marketData.data;
            renderMarketTable(allMarketData);
            updateStatCards(allMarketData);
            renderStockMetrics(currentSymbol);
            renderSuggestions(allMarketData);

            const now = new Date();
            lastUpdatedAt = now;
            document.getElementById('last-updated-text').innerText = now.toLocaleTimeString();
            document.getElementById('table-updated').innerText = `Cập nhật: ${now.toLocaleTimeString()}`;
            const sidebarTime = document.getElementById('sidebar-last-run');
            if (sidebarTime) sidebarTime.innerText = now.toLocaleTimeString();
        }

        await updateChart(currentSymbol, currentLimit);

        // Draw sparklines for BTC/ETH
        await drawSparkline('BTCUSDT', 'sparkline-btc');

    } catch (err) {
        showToast('❌ Lỗi khi làm mới dữ liệu!');
        console.error(err);
    } finally {
        if (btn) btn.classList.remove('spinning');
    }
}

async function fetchMarketData() {
    const resp = await fetch(`${API_BASE}/market-data`);
    return await resp.json();
}

// =============================================
// UPDATE TIME AGO
// =============================================
function updateTimeAgo() {
    if (!lastUpdatedAt) return;
    const sec = Math.floor((Date.now() - lastUpdatedAt) / 1000);
    const elem = document.getElementById('time-ago');
    if (!elem) return;
    if (sec < 60) elem.innerText = `Cập nhật ${sec}s trước`;
    else elem.innerText = `Cập nhật ${Math.floor(sec/60)}p trước`;
}

// =============================================
// STAT CARDS UPDATE
// =============================================
function updateStatCards(data) {
    // Crypto hero & mini cards
    const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
    cryptoSymbols.forEach(sym => {
        const stock = data.find(s => s.symbol === sym);
        if (!stock) return;

        const price  = parseFloat(stock.price)  || 0;
        const change = parseFloat(stock.percent_change) || 0;
        const vol    = parseFloat(stock.volume) || 0;
        const ma5    = parseFloat(stock.ma5)    || 0;
        const lowSym = sym.toLowerCase().replace('usdt', '');

        // BTC → hero card
        if (sym === 'BTCUSDT') {
            setEl('hero-btc-price', `$${price.toLocaleString()}`);
            const hChange = document.getElementById('hero-btc-change');
            if (hChange) {
                hChange.innerText = `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%`;
                hChange.className = `hero-change ${change >= 0 ? 'badge-up' : 'badge-down'}`;
            }
            setEl('hero-btc-vol', formatNumber(vol));
            const trendEl = document.getElementById('hero-btc-trend');
            if (trendEl) {
                trendEl.innerHTML = price > ma5
                    ? `<span style="color:var(--accent-green)">▲ Bullish</span> so với MA5 ($${ma5.toFixed(2)})`
                    : `<span style="color:var(--accent-red)">▼ Bearish</span> so với MA5 ($${ma5.toFixed(2)})`;
            }
        } else {
            const cardPrice = document.getElementById(`card-${lowSym}-price`);
            const cardBadge = document.getElementById(`card-${lowSym}-change`);
            const cardVol   = document.getElementById(`card-${lowSym}-vol`);
            const cardTrend = document.getElementById(`card-${lowSym}-trend`);

            if (cardPrice) cardPrice.innerText = `$${price.toLocaleString()}`;
            if (cardBadge) {
                cardBadge.innerText  = `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%`;
                cardBadge.className = change >= 0 ? 'badge-up' : 'badge-down';
            }
            if (cardVol)   cardVol.innerText   = formatNumber(vol);
            if (cardTrend) cardTrend.innerHTML = price > ma5
                ? `<span style="color:var(--accent-green)">Bullish</span> vs MA5`
                : `<span style="color:var(--accent-red)">Bearish</span> vs MA5`;
        }
    });

    // Stock cards — 5 stocks
    ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA'].forEach(sym => {
        const s = data.find(d => d.symbol === sym);
        if (!s) return;
        const price  = parseFloat(s.price)  || 0;
        const change = parseFloat(s.percent_change) || 0;
        const lowSym = sym.toLowerCase();
        const cardPrice = document.getElementById(`card-${lowSym}-price`);
        const cardBadge = document.getElementById(`card-${lowSym}-change`);
        const cardVol   = document.getElementById(`card-${lowSym}-vol`);
        if (cardPrice) cardPrice.innerText = `$${price.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        if (cardBadge) {
            cardBadge.innerText = `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%`;
            cardBadge.className = change >= 0 ? 'badge-up' : 'badge-down';
        }
        if (cardVol) cardVol.innerText = formatNumber(parseFloat(s.volume));
    });

    // Top gainer (all assets)
    const topGainer = [...data].sort((a,b) => parseFloat(b.percent_change||0) - parseFloat(a.percent_change||0))[0];
    setEl('card-top-gainer',     topGainer?.symbol || '--');
    setEl('card-top-gainer-pct', topGainer ? `+${parseFloat(topGainer.percent_change).toFixed(2)}%` : '--');

    // Badge counts
    const cryptoCount = data.filter(s => s.symbol.includes('USDT')).length;
    const stockCount  = data.length - cryptoCount;
    setEl('crypto-count', cryptoCount);
    setEl('stock-count', stockCount);

    // Market status (Fear & Greed style)
    const gainers = data.filter(s => parseFloat(s.percent_change) > 0).length;
    const losers  = data.length - gainers;
    const ratio   = gainers / data.length;
    const statusEl = document.getElementById('crypto-market-status');
    const fgEl     = document.getElementById('market-fear-greed');
    if (statusEl) {
        if (ratio >= 0.65) { statusEl.innerHTML = '🟢 Thị trường tốt'; statusEl.style.color = 'var(--accent-green)'; }
        else if (ratio >= 0.45) { statusEl.innerHTML = '🟡 Trung lập'; statusEl.style.color = '#ff9f43'; }
        else { statusEl.innerHTML = '🔴 Rủi ro cao'; statusEl.style.color = 'var(--accent-red)'; }
    }
    if (fgEl) fgEl.innerText = `${gainers} mã tăng / ${losers} mã giảm`;
}

// =============================================
// SPARKLINE (mini chart inside hero card)
// =============================================
async function drawSparkline(symbol, canvasId) {
    try {
        const resp = await fetch(`${API_BASE}/stock-charts/${symbol}?limit=10&t=${Date.now()}`);
        const result = await resp.json();
        if (!result.success || !result.data?.length) return;

        const prices = result.data.map(d => parseFloat(d.close_price));
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (sparklineCharts[canvasId]) {
            sparklineCharts[canvasId].destroy();
            sparklineCharts[canvasId] = null;
        }

        const isUp = prices[prices.length - 1] >= prices[0];
        const color = isUp ? '#00f081' : '#ff4d4d';
        const ctx   = canvas.getContext('2d');
        const grad  = ctx.createLinearGradient(0, 0, 0, 50);
        grad.addColorStop(0, isUp ? 'rgba(0,240,129,0.3)' : 'rgba(255,77,77,0.3)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        sparklineCharts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: prices.map((_, i) => i),
                datasets: [{
                    data: prices,
                    borderColor: color,
                    backgroundColor: grad,
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: { x: { display: false }, y: { display: false } },
                animation: { duration: 600 }
            }
        });
    } catch (e) { /* silent fail */ }
}

// =============================================
// MARKET TABLE (CoinMarketCap Style)
// =============================================
function renderMarketTable(data) {
    const tbody = document.getElementById('market-tbody');
    if (!tbody) return;
    document.getElementById('table-loading').style.display = 'none';
    document.getElementById('market-table-wrap').style.display = 'block';

    const filteredData = (data || []).filter(s =>
        currentSegment === 'crypto' ? s.symbol.includes('USDT') : !s.symbol.includes('USDT')
    );

    if (!filteredData.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px">Không có dữ liệu</td></tr>`;
        return;
    }

    const COIN_COLORS = {
        BTCUSDT: '#f7931a', ETHUSDT: '#627eea', BNBUSDT: '#f3ba2f',
        SOLUSDT: '#9945ff', DOGEUSDT: '#c2a633', ADAUSDT: '#0033ad',
        XRPUSDT: '#00aae4', LINKUSDT: '#2a5ada', DOTUSDT: '#e6007a',
        AAPL: '#0088ff', MSFT: '#0078d4', GOOGL: '#34a853',
    };

    const getRisk = (sym, change) => {
        const absChange = Math.abs(parseFloat(change) || 0);
        if (['BTCUSDT','AAPL','MSFT'].includes(sym)) return '<span class="risk-pill risk-low">🟢 Thấp</span>';
        if (absChange > 5) return '<span class="risk-pill risk-high">🔴 Cao</span>';
        return '<span class="risk-pill risk-medium">🟡 TB</span>';
    };

    try {
        tbody.innerHTML = filteredData.map((s, i) => {
            const change  = parseFloat(s.percent_change) || 0;
            const price   = parseFloat(s.price) || 0;
            const ma5     = parseFloat(s.ma5)   || 0;
            const ma10    = parseFloat(s.ma10)  || 0;
            const vol     = parseInt(s.volume)  || 0;
            const dateStr = s.date ? new Date(s.date).toLocaleDateString('vi-VN') : '--';
            // Fix: dùng rgba thay vì hex+alpha để tránh invalid CSS
            const hex     = COIN_COLORS[s.symbol] || '#6b7fa3';
            const upDown  = change >= 0;
            const displayName = (s.name || s.symbol);
            const shortName = displayName.length > 18 ? displayName.substring(0, 18) + '...' : displayName;

            return `
              <tr onclick="selectCoinFromTable('${s.symbol}')">
                <td style="color:var(--text-muted);font-size:13px">${i + 1}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:10px">
                    <div class="asset-logo" style="background:${hex}22;color:${hex};border:1px solid ${hex}44">${s.symbol.charAt(0)}</div>
                    <div>
                      <div style="font-weight:700;color:#fff;font-size:13px">${s.symbol}</div>
                      <div style="font-size:11px;color:var(--text-muted)">${shortName}</div>
                    </div>
                  </div>
                </td>
                <td style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:13px">$${price.toLocaleString(undefined, {maximumFractionDigits:4})}</td>
                <td><span class="${upDown ? 'badge-up' : 'badge-down'}">${upDown ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%</span></td>
                <td style="color:#a9b1d6;font-family:'JetBrains Mono',monospace;font-size:12px">$${ma5 ? ma5.toFixed(2) : '--'}</td>
                <td style="color:#a9b1d6;font-family:'JetBrains Mono',monospace;font-size:12px">$${ma10 ? ma10.toFixed(2) : '--'}</td>
                <td style="color:var(--text-secondary);font-size:12px">${formatNumber(vol)}</td>
                <td>${getRisk(s.symbol, change)}</td>
                <td style="color:var(--text-muted);font-size:11px">${dateStr}</td>
              </tr>`;
        }).join('');
    } catch (err) {
        console.error('renderMarketTable error:', err);
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--accent-red);padding:24px">Lỗi hiển thị dữ liệu</td></tr>`;
    }
}

function selectCoinFromTable(symbol) {
    currentSymbol = symbol;
    const tabsId = symbol.includes('USDT') ? 'crypto-tabs' : 'stock-tabs';
    document.querySelectorAll(`#${tabsId} .coin-tab`).forEach(t => {
        t.classList.toggle('active', t.dataset.symbol === symbol);
    });
    updateChart(symbol, currentLimit, currentTfLabel);
    renderStockMetrics(symbol);
    document.getElementById('price-chart').scrollIntoView({ behavior: 'smooth' });
}

// =============================================
// MAIN CHART (TradingView-ish)
// =============================================
async function updateChart(symbol, limit = 7, tfLabel = '7D') {
    try {
        const resp = await fetch(`${API_BASE}/stock-charts/${symbol}?limit=${limit}&t=${Date.now()}`);
        const result = await resp.json();

        if (!result.success || !result.data?.length) {
            console.warn(`⚠️ Không có dữ liệu cho ${symbol}`);
            return;
        }

        const labels = result.data.map(d =>
            new Date(d.date).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' })
        );
        const prices = result.data.map(d => parseFloat(d.close_price));
        const ma5    = result.data.map(d => parseFloat(d.ma5)  || null);
        const ma10   = result.data.map(d => parseFloat(d.ma10) || null);
        const volumes = result.data.map(d => parseFloat(d.volume) || 0);
        const annotations = {};

        const latestPrice = prices[prices.length - 1];
        const subtitle = document.getElementById('price-chart-subtitle');
        if (subtitle) {
            subtitle.innerText = `${symbol} · ${tfLabel} · Giá: $${latestPrice.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
        }

        if (priceChart) { priceChart.destroy(); priceChart = null; }

        const canvas = document.getElementById('priceChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(46,144,255,0.22)');
        gradient.addColorStop(1, 'rgba(46,144,255,0)');

        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Giá Đóng Cửa',
                        data: prices,
                        borderColor: '#2e90ff',
                        backgroundColor: gradient,
                        borderWidth: 3,
                        pointRadius: 0,
                        pointHoverRadius: 7,
                        pointHoverBackgroundColor: '#2e90ff',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2,
                        tension: 0.4,
                        fill: true,
                        yAxisID: 'y',
                    },
                    {
                        label: 'MA5',
                        data: ma5,
                        borderColor: '#ff9f43',
                        borderWidth: 1.5,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        tension: 0.3,
                        yAxisID: 'y',
                    },
                    {
                        label: 'MA10',
                        data: ma10,
                        borderColor: '#8c52ff',
                        borderWidth: 1.5,
                        borderDash: [2, 3],
                        pointRadius: 0,
                        tension: 0.3,
                        yAxisID: 'y',
                    },
                    {
                        label: 'Khối lượng',
                        data: volumes,
                        type: 'bar',
                        backgroundColor: 'rgba(46,144,255,0.15)',
                        borderColor: 'rgba(46,144,255,0.3)',
                        borderWidth: 1,
                        yAxisID: 'y1',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#9ea7b8',
                            font: { size: 10 },
                            boxWidth: 12,
                            filter: item => item.text !== 'Khối lượng'
                        }
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(10,12,16,0.95)',
                        titleColor: '#fff',
                        bodyColor: '#9ea7b8',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 14,
                        displayColors: true,
                        callbacks: {
                            label(ctx) {
                                if (ctx.dataset.label === 'Khối lượng')
                                    return ` Vol: ${formatNumber(ctx.parsed.y)}`;
                                return ` ${ctx.dataset.label}: $${(ctx.parsed.y || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
                            }
                        }
                    },
                    annotation: { annotations }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#5a657d', font: { size: 10 }, maxRotation: 0 }
                    },
                    y: {
                        position: 'left',
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        ticks: {
                            color: '#5a657d', font: { size: 10 },
                            callback: v => `$${v.toLocaleString()}`
                        }
                    },
                    y1: {
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: {
                            color: '#3a4260', font: { size: 9 },
                            callback: v => formatNumber(v)
                        }
                    }
                }
            }
        });

        updateAIInsight(symbol, result.data[result.data.length - 1]);

    } catch (err) {
        console.error('Chart error:', err);
    }
}

// =============================================
// AI INSIGHT (UPGRADED)
// =============================================
function updateAIInsight(symbol, latestData) {
    const insightEl = document.getElementById('ai-insight-text');
    const signalBox  = document.getElementById('ai-signal-box');
    const signalIcon = document.getElementById('ai-signal-icon');
    const signalLbl  = document.getElementById('ai-signal-label');
    const signalSub  = document.getElementById('ai-signal-sublabel');
    const confBadge  = document.getElementById('ai-confidence-badge');
    const tagsEl     = document.getElementById('ai-tags');

    if (!latestData) return;

    const price = parseFloat(latestData.close_price) || 0;
    const ma5   = parseFloat(latestData.ma5)  || 0;
    const ma10  = parseFloat(latestData.ma10) || 0;
    const change = parseFloat(latestData.percent_change) || 0;
    const trend = latestData.trend_signal || '';

    let signal, signalClass, icon, sub, insight, tags, confidence;

    if (price > ma5 && ma5 > ma10) {
        signal = '📈 NÊN XEM XÉT MUA';
        signalClass = 'buy';
        icon = '🟢';
        sub = 'Xu hướng TĂNG MẠNH — Bullish Signal';
        confidence = 78;
        insight = `<strong>${symbol}</strong> đang trong xu hướng <span style="color:var(--accent-green)">TĂNG MẠNH</span>. Giá nằm trên cả MA5 và MA10, lực cầu áp đảo. Chiến thuật: <strong>Giữ lệnh</strong> hoặc gia tăng tại nhịp điều chỉnh nhẹ (-2 đến -4%).`;
        tags = [{ text: 'Bullish', cls: 'green' }, { text: 'Golden Cross', cls: 'green' }, { text: 'Uptrend', cls: 'blue' }];
    } else if (price < ma5 && ma5 < ma10) {
        signal = '⛔ NÊN CHỜ (Không mua ngay)';
        signalClass = 'sell';
        icon = '🔴';
        sub = 'Xu hướng GIẢM — Bearish Signal';
        confidence = 82;
        insight = `Cảnh báo: <strong>${symbol}</strong> đang dưới áp lực <span style="color:var(--accent-red)">GIẢM GIÁ</span>. MA5 cắt xuống MA10 tạo ra tín hiệu "Death Cross". Nên <strong>chờ đợi</strong> tín hiệu đảo chiều rõ ràng hơn trước khi tham gia.`;
        tags = [{ text: 'Bearish', cls: 'red' }, { text: 'Death Cross', cls: 'red' }, { text: 'Downtrend', cls: 'red' }];
    } else if (price > ma5 && price < ma10) {
        signal = '⏸ NÊN QUAN SÁT (Giữ nguyên)';
        signalClass = 'hold';
        icon = '🟡';
        sub = 'Giai đoạn TÍCH LŨY — Neutral';
        confidence = 65;
        insight = `<strong>${symbol}</strong> đang trong giai đoạn <span style="color:#ff9f43">TÍCH LŨY</span>. Giá vượt MA5 nhưng chưa đủ lực phá MA10. <strong>Quan sát thêm</strong> và chờ đột phá (Breakout) có xác nhận khối lượng.`;
        tags = [{ text: 'Tích lũy', cls: 'orange' }, { text: 'Sideway', cls: 'blue' }, { text: 'Watch', cls: 'blue' }];
    } else {
        signal = '⏸ NÊN CHỜ (Chưa rõ xu hướng)';
        signalClass = 'neutral';
        icon = '⚪';
        sub = 'Thị trường đi ngang — No Clear Signal';
        confidence = 50;
        insight = `<strong>${symbol}</strong> đang đi ngang (Sideway). Chưa có tín hiệu rõ từ MA. <strong>Không nên vào lệnh lúc này</strong>. Chờ volume tăng đột biến kèm breakout khỏi vùng tích lũy.`;
        tags = [{ text: 'Neutral', cls: 'blue' }, { text: 'No Signal', cls: 'orange' }];
    }

    // Update Signal Box
    if (signalBox)  { signalBox.className = `signal-box ${signalClass}`; }
    if (signalIcon) signalIcon.innerText = icon;
    if (signalLbl)  signalLbl.innerText  = signal;
    if (signalSub)  signalSub.innerText  = sub;
    if (confBadge)  confBadge.innerText  = `Độ tin cậy: ${confidence}%`;
    if (insightEl)  insightEl.innerHTML  = insight;

    // Render tags
    if (tagsEl) {
        tagsEl.innerHTML = (tags || []).map(tag =>
            `<span class="ai-tag ${tag.cls}">${tag.text}</span>`
        ).join('');
    }

    // Update Advanced Metrics panel
    setEl('adv-ma5',  ma5  ? `$${ma5.toLocaleString()}` : '--');
    setEl('adv-ma10', ma10 ? `$${ma10.toLocaleString()}` : '--');
}

// =============================================
// SUGGESTION CARDS (Top picks for newbies)
// =============================================
function renderSuggestions(data) {
    const container = document.getElementById('suggestion-grid');
    if (!container) return;

    const cryptoData = data.filter(s => s.symbol.includes('USDT'));
    if (!cryptoData.length) return;

    const suggestions = [
        { ...cryptoData.find(s => s.symbol === 'BTCUSDT'), label: 'An toàn nhất', action: 'safe', rank: 1 },
        { ...cryptoData.find(s => s.symbol === 'ETHUSDT'), label: 'Tiềm năng', action: 'potential', rank: 2 },
    ].filter(s => s.symbol);

    // Add top gainer if different
    const sorted = [...cryptoData].sort((a,b) => parseFloat(b.percent_change) - parseFloat(a.percent_change));
    const topGainer = sorted[0];
    if (topGainer && topGainer.symbol !== 'BTCUSDT' && topGainer.symbol !== 'ETHUSDT') {
        suggestions.push({ ...topGainer, label: 'Tăng mạnh nhất', action: 'risky', rank: 3 });
    } else {
        suggestions.push({ ...cryptoData.find(s => s.symbol === 'SOLUSDT'), label: 'Rủi ro cao hơn', action: 'risky', rank: 3 });
    }

    const actionLabel = { safe: '✅ An toàn', potential: '🚀 Tiềm năng', risky: '⚠️ Rủi ro cao' };

    container.innerHTML = suggestions.filter(s => s && s.symbol).map(s => {
        const change = parseFloat(s.percent_change) || 0;
        return `
          <div class="suggestion-card" onclick="selectCoinFromTable('${s.symbol}')">
            <div class="sug-rank">Gợi ý #${s.rank}</div>
            <div class="sug-symbol">${s.symbol.replace('USDT','')}</div>
            <div class="sug-name">${s.name || s.symbol}</div>
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span class="sug-action ${s.action}">${actionLabel[s.action]}</span>
              <span class="sug-change ${change >= 0 ? 'badge-up' : 'badge-down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%</span>
            </div>
          </div>`;
    }).join('');
}

// =============================================
// STOCK METRICS (Side panel)
// =============================================
function renderStockMetrics(symbol) {
    fetch(`${API_BASE}/market-data`)
        .then(r => r.json())
        .then(res => {
            const stock = (res.data || []).find(s => s.symbol === symbol);
            const container = document.getElementById('metrics-body');
            if (!stock) {
                if (container) container.innerHTML = '<p style="color:var(--text-muted);font-size:12px">Không tìm thấy dữ liệu.</p>';
                return;
            }

            const change = parseFloat(stock.percent_change) || 0;
            const trendClass = change >= 0 ? 'badge-up' : 'badge-down';
            const vol = parseFloat(stock.volume) || 0;

            if (container) {
                container.innerHTML = `
                  <div class="metrics-grid">
                    <div class="metric-item">
                      <div class="m-label">Thay đổi (Ngày)</div>
                      <div class="m-value ${trendClass}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%</div>
                    </div>
                    <div class="metric-item">
                      <div class="m-label">Khối lượng <span title="Lượng coin được giao dịch">ℹ</span></div>
                      <div class="m-value" style="color:var(--text-primary)">${formatNumber(vol) || '--'}</div>
                    </div>
                  </div>`;
            }
        })
        .catch(() => {});
}

// =============================================
// ADVANCED TOGGLE
// =============================================
function toggleAdvanced() {
    const panel = document.getElementById('advanced-metrics');
    const btn   = document.getElementById('advanced-toggle-btn');
    if (!panel) return;
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    if (btn) btn.innerText = isHidden ? 'Ẩn ▴' : 'Nâng cao ▾';
}

// =============================================
// UTILS
// =============================================
function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val ?? '--';
}

function formatNumber(num) {
    const n = parseFloat(num);
    if (!n || isNaN(n)) return '--';
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
    if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
}

function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.className = type ? `show ${type}` : 'show';
    setTimeout(() => t.className = '', 3000);
}

function openHealth() {
    window.open('/health', '_blank');
}
