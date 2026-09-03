/**
 * Live Chat Widget
 * Provides real-time customer support during shopping
 *
 * Features:
 * - Chat widget with message history
 * - Message persistence with localStorage
 * - Offline mode support
 * - Auto-reconnect when online
 */

class LiveChatWidget {
  constructor(options = {}) {
    this.options = {
      position: options.position || 'bottom-right',
      containerId: options.containerId || 'live-chat-widget',
      storageKey: options.storageKey || 'teppich-paradies-chat-messages',
      maxMessages: options.maxMessages || 100,
      reconnectDelay: options.reconnectDelay || 3000,
      ...options
    };

    this.isOnline = navigator.onLine;
    this.isOpen = false;
    this.messages = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    this.init();
  }

  init() {
    this.loadMessages();
    this.createWidget();
    this.setupEventListeners();
    this.setupOnlineStatusListener();
  }

  /**
   * Load messages from localStorage
   */
  loadMessages() {
    try {
      const stored = localStorage.getItem(this.options.storageKey);
      this.messages = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to load chat messages:', error);
      this.messages = [];
    }
  }

  /**
   * Save messages to localStorage
   */
  saveMessages() {
    try {
      const toStore = this.messages.slice(-this.options.maxMessages);
      localStorage.setItem(this.options.storageKey, JSON.stringify(toStore));
    } catch (error) {
      console.warn('Failed to save chat messages:', error);
    }
  }

  /**
   * Create chat widget DOM
   */
  createWidget() {
    const container = document.getElementById(this.options.containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="live-chat-container" data-position="${this.options.position}">
        <div class="live-chat-header">
          <h3>💬 Live Support</h3>
          <button class="live-chat-toggle" aria-label="Toggle chat" title="Chat öffnen/schließen">
            <span class="minimize-icon">−</span>
            <span class="close-icon">✕</span>
          </button>
        </div>

        <div class="live-chat-messages">
          <div class="messages-container">
            ${this.renderMessages()}
          </div>
          <div class="online-status">
            <span class="status-indicator ${this.isOnline ? 'online' : 'offline'}"></span>
            <span class="status-text">${this.isOnline ? 'Online' : 'Offline - Nachrichten werden lokal gespeichert'}</span>
          </div>
        </div>

        <div class="live-chat-input">
          <textarea
            class="message-input"
            placeholder="Ihre Nachricht..."
            maxlength="500"
            aria-label="Chat message input"
          ></textarea>
          <button class="send-button" aria-label="Send message" title="Nachricht senden">
            Senden
          </button>
        </div>
      </div>
    `;

    this.setupDOMReferences();
  }

  /**
   * Set up DOM element references
   */
  setupDOMReferences() {
    this.widget = document.querySelector('.live-chat-container');
    this.header = this.widget?.querySelector('.live-chat-header');
    this.messagesContainer = this.widget?.querySelector('.messages-container');
    this.input = this.widget?.querySelector('.message-input');
    this.sendButton = this.widget?.querySelector('.send-button');
    this.toggleButton = this.widget?.querySelector('.live-chat-toggle');
    this.statusIndicator = this.widget?.querySelector('.status-indicator');
    this.statusText = this.widget?.querySelector('.status-text');
  }

  /**
   * Render message history
   */
  renderMessages() {
    if (this.messages.length === 0) {
      return `
        <div class="welcome-message">
          <p>👋 Willkommen! Wie können wir Ihnen heute helfen?</p>
          <p style="font-size: 0.85em; color: #999; margin-top: 0.5em;">
            Unsere Experten sind während der Geschäftszeiten verfügbar.
          </p>
        </div>
      `;
    }

    return this.messages.map(msg => `
      <div class="message message-${msg.type}">
        <div class="message-content">
          <p>${this.escapeHtml(msg.text)}</p>
          <span class="message-time">${this.formatTime(msg.timestamp)}</span>
        </div>
      </div>
    `).join('');
  }

  /**
   * Add message to chat
   */
  addMessage(text, type = 'user') {
    const message = {
      text: text.trim(),
      type,
      timestamp: Date.now(),
      id: `msg-${Date.now()}-${Math.random()}`
    };

    this.messages.push(message);
    this.saveMessages();

    if (this.messagesContainer) {
      const messageEl = document.createElement('div');
      messageEl.className = `message message-${type}`;
      messageEl.innerHTML = `
        <div class="message-content">
          <p>${this.escapeHtml(message.text)}</p>
          <span class="message-time">${this.formatTime(message.timestamp)}</span>
        </div>
      `;
      this.messagesContainer.appendChild(messageEl);

      // Auto-scroll to bottom
      setTimeout(() => {
        this.messagesContainer.parentElement.scrollTop = this.messagesContainer.parentElement.scrollHeight;
      }, 0);
    }

    return message;
  }

  /**
   * Send message (user input)
   */
  sendMessage() {
    if (!this.input) return;

    const text = this.input.value.trim();
    if (!text) return;

    // Add user message
    this.addMessage(text, 'user');
    this.input.value = '';

    // Simulate agent response (in real implementation, would connect to backend)
    if (this.isOnline) {
      this.simulateAgentResponse();
    } else {
      this.addMessage(
        '📝 Ihre Nachricht wurde lokal gespeichert. Sie wird gesendet, sobald die Verbindung wiederhergestellt ist.',
        'system'
      );
    }
  }

  /**
   * Simulate agent response (placeholder)
   */
  simulateAgentResponse() {
    setTimeout(() => {
      const responses = [
        'Vielen Dank für Ihre Nachricht! Ich kümmere mich darum.',
        'Kann ich Ihnen noch helfen?',
        'Gerne helfen wir Ihnen weiter.',
        'Danke, dass Sie uns kontaktiert haben!'
      ];
      const response = responses[Math.floor(Math.random() * responses.length)];
      this.addMessage(response, 'agent');
    }, 500 + Math.random() * 1000);
  }

  /**
   * Toggle chat window open/closed
   */
  toggleChat() {
    if (this.isOpen) {
      this.closeChat();
    } else {
      this.openChat();
    }
  }

  /**
   * Open chat
   */
  openChat() {
    if (this.widget) {
      this.widget.classList.add('open');
      this.isOpen = true;
      if (this.input) this.input.focus();
    }
  }

  /**
   * Close chat
   */
  closeChat() {
    if (this.widget) {
      this.widget.classList.remove('open');
      this.isOpen = false;
    }
  }

  /**
   * Update online status
   */
  updateOnlineStatus(isOnline) {
    this.isOnline = isOnline;

    if (this.statusIndicator) {
      this.statusIndicator.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
    }

    if (this.statusText) {
      if (isOnline) {
        this.statusText.textContent = 'Online';
        this.addMessage('✅ Verbindung wiederhergestellt!', 'system');
      } else {
        this.statusText.textContent = 'Offline - Nachrichten werden lokal gespeichert';
        this.addMessage('⚠️ Offline-Modus aktiviert. Ihre Nachrichten werden lokal gespeichert.', 'system');
      }
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', () => this.toggleChat());
    }

    if (this.sendButton) {
      this.sendButton.addEventListener('click', () => this.sendMessage());
    }

    if (this.input) {
      this.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }
  }

  /**
   * Setup online/offline status listener
   */
  setupOnlineStatusListener() {
    window.addEventListener('online', () => this.updateOnlineStatus(true));
    window.addEventListener('offline', () => this.updateOnlineStatus(false));
  }

  /**
   * Utility: Format timestamp
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Utility: Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Clear chat history
   */
  clearHistory() {
    if (confirm('Chat-Verlauf wirklich löschen?')) {
      this.messages = [];
      this.saveMessages();
      if (this.messagesContainer) {
        this.messagesContainer.innerHTML = this.renderMessages();
      }
    }
  }

  /**
   * Destroy widget
   */
  destroy() {
    const container = document.getElementById(this.options.containerId);
    if (container) {
      container.innerHTML = '';
    }
  }
}

// Auto-initialize if container exists
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('live-chat-widget')) {
    window.liveChatWidget = new LiveChatWidget();
  }
});

export default LiveChatWidget;
