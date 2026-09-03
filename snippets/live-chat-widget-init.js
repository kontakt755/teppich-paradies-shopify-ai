/**
 * Live Chat Widget Initialization
 *
 * Initializes the live chat widget with Shopify integration
 */

(function() {
  'use strict';

  // Load CSS
  function loadCSS(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  // Load JavaScript module
  async function loadChatWidget() {
    try {
      // Import widget class
      const module = await import('/cdn/shop/t/{{ shop.id }}/assets/live-chat-widget.js?v={{ 'live-chat-widget.js' | asset_url | split: '?v=' | last }}');
      const LiveChatWidget = module.default;

      // Initialize widget with configuration
      window.liveChatWidget = new LiveChatWidget({
        position: 'bottom-right',
        containerId: 'live-chat-widget',
        storageKey: 'teppich-paradies-chat-messages',
        maxMessages: 100,
        reconnectDelay: 3000
      });

      // Add custom event handlers
      setupEventHandlers();

      // Log initialization
      console.log('[LiveChat] Widget initialized successfully');
    } catch (error) {
      console.error('[LiveChat] Failed to initialize widget:', error);
    }
  }

  /**
   * Setup custom event handlers
   */
  function setupEventHandlers() {
    // Handle page navigation (preserve chat history)
    window.addEventListener('beforeunload', () => {
      if (window.liveChatWidget && window.liveChatWidget.messages.length > 0) {
        console.log('[LiveChat] Chat history preserved');
      }
    });

    // Handle visibility changes (pause/resume service)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('[LiveChat] Widget backgrounded');
      } else {
        console.log('[LiveChat] Widget resumed');
      }
    });
  }

  /**
   * Initialize on DOM ready
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadChatWidget);
  } else {
    loadChatWidget();
  }

  /**
   * Provide global API for developers
   */
  window.LiveChat = {
    // Open chat
    open() {
      if (window.liveChatWidget) {
        window.liveChatWidget.openChat();
      }
    },

    // Close chat
    close() {
      if (window.liveChatWidget) {
        window.liveChatWidget.closeChat();
      }
    },

    // Send message programmatically
    send(text) {
      if (window.liveChatWidget) {
        window.liveChatWidget.addMessage(text, 'user');
        window.liveChatWidget.simulateAgentResponse();
      }
    },

    // Get message history
    getMessages() {
      if (window.liveChatWidget) {
        return window.liveChatWidget.messages;
      }
      return [];
    },

    // Clear history
    clearHistory() {
      if (window.liveChatWidget) {
        window.liveChatWidget.clearHistory();
      }
    },

    // Destroy widget
    destroy() {
      if (window.liveChatWidget) {
        window.liveChatWidget.destroy();
      }
    }
  };
})();
