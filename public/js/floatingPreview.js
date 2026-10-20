/**
 * Heartly - Floating Replyable Message Preview (Bottom Left)
 * Displays incoming partner whispers as an interactive circular floating bubble,
 * expanding on hover/click into a replyable romantic card.
 */
const FloatingChatPreview = {
  container: null,
  bubble: null,
  card: null,
  autoHideTimer: null,
  currentMessage: null,
  isEnabled: true,

  checkEnabled() {
    const saved = localStorage.getItem('heartly_floating_chat_enabled');
    return saved === null ? true : saved === 'true';
  },

  setEnabled(val) {
    this.isEnabled = !!val;
    localStorage.setItem('heartly_floating_chat_enabled', String(this.isEnabled));
    const toggle = document.getElementById('toggleFloatingChat');
    if (toggle) toggle.checked = this.isEnabled;
    if (!this.isEnabled) {
      this.dismiss();
    }
  },

  init() {
    this.container = document.getElementById('floatingChatPreview');
    this.bubble = document.getElementById('floatingChatBubble');
    this.card = document.getElementById('floatingChatCard');

    if (!this.container) return;

    // Initialize toggle state from localStorage
    this.isEnabled = this.checkEnabled();
    const toggle = document.getElementById('toggleFloatingChat');
    if (toggle) {
      toggle.checked = this.isEnabled;
      toggle.addEventListener('change', (e) => {
        this.setEnabled(e.target.checked);
        if (window.HeartlyDialog) {
          HeartlyDialog.alert(
            e.target.checked
              ? 'Floating whisper popup enabled 💬'
              : 'Floating whisper popup disabled 🔕',
            'Message Popup'
          );
        }
      });
    }

    // Hover interactions: expand smoothly on hover, keep open while hovering
    this.container.addEventListener('mouseenter', () => {
      this.clearAutoHideTimer();
      this.container.classList.add('expanded');
    });

    this.container.addEventListener('mouseleave', () => {
      // Don't collapse or auto-hide if user has typed something in the reply box
      const input = document.getElementById('floatingCardReplyInput');
      if (input && input.value.trim().length > 0) return;
      this.container.classList.remove('expanded');
      this.startAutoHideTimer(8000);
    });

    // Click on circle bubble toggles expansion on mobile or click
    this.bubble?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.container.classList.toggle('expanded');
      const input = document.getElementById('floatingCardReplyInput');
      if (this.container.classList.contains('expanded')) {
        setTimeout(() => input?.focus(), 150);
      }
    });

    // Close button
    document.getElementById('btnFloatingCardClose')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss();
    });

    // Reply Form submission
    const form = document.getElementById('floatingCardReplyForm');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.sendReply();
    });

    // Quick emoji click buttons
    document.querySelectorAll('.quick-emoji-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const emoji = btn.getAttribute('data-emoji');
        const input = document.getElementById('floatingCardReplyInput');
        if (input) {
          input.value += emoji;
          input.focus();
        }
      });
    });

    // Jump to Full Chat tab
    document.getElementById('btnFloatingOpenFullChat')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss();
      const tabChat = document.getElementById('tabChat');
      if (tabChat) {
        tabChat.click();
      }
    });
  },

  showIncomingMessage(msg) {
    if (!this.checkEnabled()) return;
    if (!this.container) return;

    // Do not show popup if user is currently looking at the Chat tab
    if (window.App?.activeSection === 'chat') return;

    // Do not show for self messages
    const myId = window.App?.currentUser?.id || window.App?.currentUser?._id;
    if (String(msg.senderId) === String(myId)) return;

    this.currentMessage = msg;
    const partner = window.App?.partner;
    const partnerName = msg.senderName || partner?.displayName || partner?.name || 'Partner';
    const partnerInitial = partnerName.trim().charAt(0).toUpperCase() || '👧';
    const avatarUrl = partner?.avatarUrl;

    // 1. Setup Circular Bubble Avatar
    const bubbleImg = document.getElementById('floatingBubbleAvatarImg');
    const bubbleFallback = document.getElementById('floatingBubbleAvatarFallback');
    if (avatarUrl) {
      if (bubbleImg) { bubbleImg.src = avatarUrl; bubbleImg.style.display = 'block'; }
      if (bubbleFallback) bubbleFallback.style.display = 'none';
    } else {
      if (bubbleImg) { bubbleImg.src = ''; bubbleImg.style.display = 'none'; }
      if (bubbleFallback) { bubbleFallback.innerText = partnerInitial; bubbleFallback.style.display = 'flex'; }
    }

    // 2. Setup Card Avatar & Sender Meta
    const cardImg = document.getElementById('floatingCardAvatarImg');
    const cardFallback = document.getElementById('floatingCardAvatarFallback');
    const nameEl = document.getElementById('floatingCardSenderName');
    if (nameEl) nameEl.innerText = partnerName;

    if (avatarUrl) {
      if (cardImg) { cardImg.src = avatarUrl; cardImg.style.display = 'block'; }
      if (cardFallback) cardFallback.style.display = 'none';
    } else {
      if (cardImg) { cardImg.src = ''; cardImg.style.display = 'none'; }
      if (cardFallback) { cardFallback.innerText = partnerInitial; cardFallback.style.display = 'flex'; }
    }

    // 3. Message Snippet
    const textEl = document.getElementById('floatingCardMessageText');
    let snippet = msg.text || '';
    if (msg.imageUrl) {
      snippet = `📷 Shared a photo: "${msg.text || 'Memory'}"`;
    } else if (msg.audioUrl) {
      snippet = `🎙️ Sent a voice whisper`;
    }
    if (textEl) {
      textEl.innerText = snippet || 'Whispered to you ❤️';
    }

    // 4. Reset input field
    const input = document.getElementById('floatingCardReplyInput');
    if (input) {
      input.value = '';
      input.placeholder = `Whisper back to ${partnerName}...`;
      input.disabled = false;
    }

    // 5. Play sweet romantic chime
    this.playChime();

    // 6. Display container with initial circular bubble
    this.container.classList.remove('expanded');
    this.container.style.display = 'flex';

    // 7. Auto-dismiss after 16 seconds if untouched
    this.startAutoHideTimer(16000);
  },

  async sendReply() {
    const input = document.getElementById('floatingCardReplyInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    try {
      input.disabled = true;

      // Send via ChatManager if available, or direct API
      if (window.ChatManager) {
        await window.ChatManager.sendQuickReply(text);
      } else if (window.API) {
        const res = await API.sendChatMessage({ text });
        if (res && res.message && window.SocketManager) {
          window.SocketManager.sendChatMessage(res.message);
        }
      }

      // Show success feedback
      input.value = 'Sent with love ❤️';
      input.style.color = '#00947a';
      input.style.fontWeight = 'bold';

      setTimeout(() => {
        this.dismiss();
        input.style.color = '';
        input.style.fontWeight = '';
      }, 1100);
    } catch (err) {
      console.error('[FloatingChatPreview] Send error:', err);
      input.disabled = false;
    }
  },

  dismiss() {
    this.clearAutoHideTimer();
    if (this.container) {
      this.container.classList.remove('expanded');
      this.container.style.display = 'none';
    }
    this.currentMessage = null;
  },

  startAutoHideTimer(duration = 16000) {
    this.clearAutoHideTimer();
    this.autoHideTimer = setTimeout(() => {
      this.dismiss();
    }, duration);
  },

  clearAutoHideTimer() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  },

  playChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      // Gentle two-tone romantic chime: E5 (659.25Hz) -> G#5 (830.61Hz)
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      osc1.frequency.exponentialRampToValueAtTime(830.61, now + 0.15);

      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.18, now + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.56);
    } catch (e) {
      // Audio autoplay may be muted by browser policy
    }
  },
};

window.FloatingChatPreview = FloatingChatPreview;
