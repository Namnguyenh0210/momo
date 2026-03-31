/**
 * CryptoAI Platform — Chatbot JS
 * Chat UI với OpenAI backend
 */

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

// ===========================
// STATE
// ===========================
let chatHistory = JSON.parse(localStorage.getItem('crypto_chat_history') || '[]');
let isTyping    = false;

// ===========================
// INIT
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('chat-input');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    input.addEventListener('input', () => {
      autoResize(input);
    });
  }

  // Restore lịch sử chat (tối đa 10 tin gần nhất)
  if (chatHistory.length > 0) {
    const recentHistory = chatHistory.slice(-10);
    const messagesEl = document.getElementById('chat-messages');
    // Clear welcome screen nếu có lịch sử
    if (messagesEl && recentHistory.length > 0) {
      messagesEl.innerHTML = '';
      recentHistory.forEach(msg => {
        appendMessage(msg.role, msg.content, false);
      });
      scrollToBottom();
    }
  }
});

// ===========================
// SEND SUGGESTION
// ===========================
function sendSuggestion(text) {
  const input = document.getElementById('chat-input');
  if (input) input.value = text;
  sendMessage();
}

// ===========================
// SEND MESSAGE
// ===========================
async function sendMessage() {
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  if (!input || isTyping) return;

  const message = input.value.trim();
  if (!message) return;

  // Clear welcome screen nếu có
  const messagesEl = document.getElementById('chat-messages');
  const welcome    = messagesEl?.querySelector('.suggestion-grid');
  if (welcome) messagesEl.innerHTML = '';  // xóa welcome UI

  // Hiển thị tin nhắn user
  appendMessage('user', message);
  input.value = '';
  autoResize(input);

  // Thêm vào history
  chatHistory.push({ role: 'user', content: message });
  if (chatHistory.length > 40) chatHistory = chatHistory.slice(-40);
  saveHistory();

  // Hiện typing indicator
  const typingId = showTyping();
  isTyping = true;
  if (sendBtn) sendBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: chatHistory.slice(-8).map(h => ({ role: h.role, content: h.content }))
      })
    });

    const json = await response.json();
    removeTyping(typingId);

    if (json.success && json.reply) {
      appendMessage('assistant', json.reply);
      chatHistory.push({ role: 'assistant', content: json.reply });
      saveHistory();
    } else {
      appendMessage('assistant', '❌ ' + (json.error || 'Có lỗi xảy ra, vui lòng thử lại.'));
    }
  } catch (e) {
    removeTyping(typingId);
    appendMessage('assistant', '❌ Không thể kết nối server. Đảm bảo backend đang chạy trên cổng 3000.');
  } finally {
    isTyping = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

// ===========================
// APPEND MESSAGE
// ===========================
function appendMessage(role, content, doScroll = true) {
  const messages = document.getElementById('chat-messages');
  if (!messages) return;

  const time = new Date().toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});

  const div = document.createElement('div');
  div.className = `message ${role}`;

  const avatarHTML = role === 'assistant'
    ? `<div class="message-avatar">🤖</div>`
    : `<div class="message-avatar" style="font-size:13px;font-weight:800">Bạn</div>`;

  const contentHTML = formatMessage(content);

  div.innerHTML = `
    ${avatarHTML}
    <div>
      <div class="message-bubble">${contentHTML}</div>
      <div class="message-time">${time}</div>
    </div>
  `;

  messages.appendChild(div);
  if (doScroll) scrollToBottom();
}

// ===========================
// FORMAT MESSAGE (markdown-lite)
// ===========================
function formatMessage(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-family:\'JetBrains Mono\',monospace;font-size:12px">$1</code>')
    .replace(/\n/g, '<br>');
}

// ===========================
// TYPING INDICATOR
// ===========================
function showTyping() {
  const messages = document.getElementById('chat-messages');
  if (!messages) return null;

  const id  = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = id;
  div.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div>
      <div class="message-bubble">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;
  messages.appendChild(div);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  if (id) document.getElementById(id)?.remove();
}

// ===========================
// SCROLL & HELPERS
// ===========================
function scrollToBottom() {
  const messages = document.getElementById('chat-messages');
  if (messages) {
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
    });
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 130) + 'px';
}

function saveHistory() {
  try {
    localStorage.setItem('crypto_chat_history', JSON.stringify(chatHistory.slice(-40)));
  } catch (e) { /* quota exceeded — ignore */ }
}

function clearChat() {
  chatHistory = [];
  localStorage.removeItem('crypto_chat_history');
  const messages = document.getElementById('chat-messages');
  if (messages) {
    messages.innerHTML = `
      <div style="text-align:center;padding:40px 20px;max-width:560px;margin:0 auto">
        <div style="font-size:52px;margin-bottom:16px">🤖</div>
        <h2 style="font-size:20px;font-weight:800;margin-bottom:8px">Đã xóa lịch sử chat</h2>
        <p style="color:var(--text-secondary);font-size:13.5px">Hãy bắt đầu cuộc trò chuyện mới!</p>
      </div>
    `;
  }
}
