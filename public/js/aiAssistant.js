/**
 * Heartly - Ema: The Romantic AI Muse & Sidecar Chat
 * Small non-blocking floating side screen.
 * Context-aware: Knows user's name, partner's name, and space name.
 * Generates copyable heartfelt texts, love notes, date ideas, letters, and prompts.
 */

const HeartlyAiAssistant = {
  isGenerating: false,
  isButtonDragging: false,
  buttonDragMoved: false,
  startX: 0,
  startY: 0,
  initialLeft: 0,
  initialTop: 0,
  currentTab: 'chat',
  isOpen: false,
  messages: [],
  hasMounted: false,

  init() {
    if (this.hasMounted) return;
    this.hasMounted = true;

    this.mountWidget();
    this.bindEvents();
    this.restorePosition();
    this.renderInitialWelcome();
  },

  mountWidget() {
    if (document.getElementById('heartlyEmaWidgetContainer')) return;

    const html = `
      <div id="heartlyEmaWidgetContainer" class="heartly-ema-widget-container" style="display: none;">
        <!-- Small Non-Blocking Floating Chat Screen on the Side -->
        <div id="heartlyEmaSideScreen" class="heartly-ema-side-screen" style="display: none;">
          <!-- Panel Header -->
          <div class="ema-side-header" id="emaSideHeader">
            <div class="ema-header-left">
              <div class="ema-avatar-small">✨</div>
              <div class="ema-header-details">
                <div class="ema-title-badge-row">
                  <span class="ema-name-text">Ema</span>
                  <span class="ema-pill-badge">Romantic Muse</span>
                </div>
                <span class="ema-sub-text" id="emaSideSubtitle">Companion for Two</span>
              </div>
            </div>
            <div class="ema-header-actions">
              <button type="button" class="ema-btn-icon" id="btnEmaClearChat" title="Clear Chat History">🧹</button>
              <button type="button" class="ema-btn-icon ema-btn-close" id="btnEmaMinimize" title="Minimize Ema">✕</button>
            </div>
          </div>

          <!-- What Ema Can Do: Quick Action Chips (Scrollable Horizontal Row) -->
          <div class="ema-quick-chips-wrapper">
            <div class="ema-quick-chips-track">
              <button type="button" class="ema-chip" data-command="Write a sweet thinking-of-you surprise love note">
                💌 Love Note
              </button>
              <button type="button" class="ema-chip" data-command="Write a cozy and bright good morning message">
                ☀️ Good Morning
              </button>
              <button type="button" class="ema-chip" data-command="Write a soft, comforting sweet dreams goodnight note">
                🌙 Sweet Dreams
              </button>
              <button type="button" class="ema-chip" data-command="Suggest 3 romantic and unique date ideas for us">
                🎒 Date Ideas
              </button>
              <button type="button" class="ema-chip" data-command="Write a gentle and sincere apology from the heart">
                🤍 Apology
              </button>
              <button type="button" class="ema-chip" data-command="Turn my feelings into a beautiful rhyming love poem">
                🌹 Love Poem
              </button>
              <button type="button" class="ema-chip" data-command="Give us 4 deep intimacy questions to ask each other tonight">
                💭 Deep Questions
              </button>
            </div>
          </div>

          <!-- Messages Stream -->
          <div class="ema-side-chat-messages" id="emaChatStream">
            <!-- Messages rendered dynamically -->
          </div>

          <!-- Thinking / Loading Indicator -->
          <div class="ema-side-typing-indicator" id="emaTypingIndicator" style="display: none;">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-label">Ema is writing with love...</span>
          </div>

          <!-- Small Input Bar -->
          <div class="ema-side-input-bar">
            <textarea 
              id="inputEmaSideCommand" 
              class="ema-side-input" 
              rows="1" 
              placeholder="Ask Ema anything (e.g. say a sweet note...)"
            ></textarea>
            <button type="button" class="btn-ema-send" id="btnEmaSideSend" title="Send to Ema">
              <span>✨</span>
            </button>
          </div>
        </div>

        <!-- Draggable Floating Ema Button (Bottom Right) -->
        <div id="heartlyFloatingEmaBtn" class="heartly-floating-ema" title="Drag to move · Click to chat with Ema ✨">
          <div class="floating-ema-avatar">
            <span class="floating-ema-sparkle">✨</span>
            <span class="floating-ema-name">Ema</span>
          </div>
          <div class="floating-ema-pulse-ring"></div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  bindEvents() {
    const btn = document.getElementById('heartlyFloatingEmaBtn');
    const sideScreen = document.getElementById('heartlyEmaSideScreen');
    const btnMinimize = document.getElementById('btnEmaMinimize');
    const btnClear = document.getElementById('btnEmaClearChat');
    const btnSend = document.getElementById('btnEmaSideSend');
    const textarea = document.getElementById('inputEmaSideCommand');

    // 1. Draggable Floating Button
    btn?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.isButtonDragging = true;
      this.buttonDragMoved = false;
      this.startX = e.clientX;
      this.startY = e.clientY;

      const rect = btn.getBoundingClientRect();
      this.initialLeft = rect.left;
      this.initialTop = rect.top;

      btn.classList.add('is-dragging');
      btn.setPointerCapture(e.pointerId);
    });

    btn?.addEventListener('pointermove', (e) => {
      if (!this.isButtonDragging) return;
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.buttonDragMoved = true;
      }

      let newLeft = this.initialLeft + dx;
      let newTop = this.initialTop + dy;

      const btnW = btn.offsetWidth || 56;
      const btnH = btn.offsetHeight || 56;
      const maxLeft = window.innerWidth - btnW - 8;
      const maxTop = window.innerHeight - btnH - 8;

      newLeft = Math.max(8, Math.min(maxLeft, newLeft));
      newTop = Math.max(8, Math.min(maxTop, newTop));

      btn.style.left = `${newLeft}px`;
      btn.style.top = `${newTop}px`;
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';

      // Position the side screen near the button if screen is open
      this.positionSideScreenNearButton(newLeft, newTop);
    });

    const onPointerUp = (e) => {
      if (!this.isButtonDragging) return;
      this.isButtonDragging = false;
      btn?.classList.remove('is-dragging');
      try {
        btn?.releasePointerCapture(e.pointerId);
      } catch (err) {}

      if (btn) {
        const rect = btn.getBoundingClientRect();
        localStorage.setItem(
          'heartly_ema_position',
          JSON.stringify({ left: rect.left, top: rect.top })
        );
      }

      // If clicked without dragging, toggle small side screen
      if (!this.buttonDragMoved) {
        this.toggleSideScreen();
      }
    };

    btn?.addEventListener('pointerup', onPointerUp);
    btn?.addEventListener('pointercancel', onPointerUp);

    // 2. Minimize Button
    btnMinimize?.addEventListener('click', () => {
      this.closeSideScreen();
    });

    // 3. Clear Chat Button
    btnClear?.addEventListener('click', () => {
      this.messages = [];
      this.renderInitialWelcome();
      if (window.HeartlyDialog) {
        HeartlyDialog.toast('✨ Ema chat refreshed!', 'info');
      }
    });

    // 4. Send button & Enter key
    btnSend?.addEventListener('click', () => {
      this.sendUserMessage();
    });

    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendUserMessage();
      }
    });

    // Auto-expand textarea
    textarea?.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    });

    // 5. Quick Action Chips
    document.querySelectorAll('.ema-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const cmd = chip.getAttribute('data-command');
        if (cmd && textarea) {
          const partnerName = this.getPartnerName();
          const filled = cmd.replace(/\bthem\b|\byou\b/gi, (m) =>
            m.toLowerCase() === 'them' ? partnerName : m
          );
          textarea.value = filled;
          this.sendUserMessage();
        }
      });
    });
  },

  positionSideScreenNearButton(btnLeft, btnTop) {
    const sideScreen = document.getElementById('heartlyEmaSideScreen');
    if (!sideScreen) return;

    const screenW = sideScreen.offsetWidth || 340;
    const screenH = sideScreen.offsetHeight || 480;

    let targetLeft = btnLeft - screenW + 56;
    let targetTop = btnTop - screenH - 12;

    // Boundary checks
    if (targetLeft < 10) targetLeft = 10;
    if (targetLeft + screenW > window.innerWidth - 10) {
      targetLeft = window.innerWidth - screenW - 10;
    }
    if (targetTop < 10) {
      // If no room above, position below
      targetTop = btnTop + 68;
      if (targetTop + screenH > window.innerHeight - 10) {
        targetTop = window.innerHeight - screenH - 10;
      }
    }

    sideScreen.style.left = `${targetLeft}px`;
    sideScreen.style.top = `${targetTop}px`;
    sideScreen.style.right = 'auto';
    sideScreen.style.bottom = 'auto';
  },

  restorePosition() {
    const btn = document.getElementById('heartlyFloatingEmaBtn');
    if (!btn) return;

    try {
      const saved = localStorage.getItem('heartly_ema_position');
      if (saved) {
        const { left, top } = JSON.parse(saved);
        const btnW = 56;
        const btnH = 56;
        const maxLeft = window.innerWidth - btnW - 8;
        const maxTop = window.innerHeight - btnH - 8;

        if (left >= 0 && left <= maxLeft && top >= 0 && top <= maxTop) {
          btn.style.left = `${left}px`;
          btn.style.top = `${top}px`;
          btn.style.right = 'auto';
          btn.style.bottom = 'auto';
        }
      }
    } catch (e) {}
  },

  getUserName() {
    return window.App?.currentUser?.name || window.App?.currentUser?.displayName || 'You';
  },

  getPartnerName() {
    if (window.App?.partner) {
      return window.App.partner.displayName || window.App.partner.name || 'your partner';
    }
    const currentId = String(window.App?.currentUser?.id || window.App?.currentUser?._id || '');
    const members = window.App?.currentSpace?.members || [];
    const partner = members.find((m) => String(m.userId) !== currentId);
    if (partner) {
      return partner.displayName || partner.name || 'your partner';
    }
    return 'your partner';
  },

  getSpaceName() {
    return window.App?.currentSpace?.spaceName || 'Our Sanctuary';
  },

  renderInitialWelcome() {
    const stream = document.getElementById('emaChatStream');
    if (!stream) return;

    const userName = this.getUserName();
    const partnerName = this.getPartnerName();
    const spaceName = this.getSpaceName();

    const subtitleEl = document.getElementById('emaSideSubtitle');
    if (subtitleEl) {
      subtitleEl.innerText = `${spaceName} · For ${userName} & ${partnerName}`;
    }

    const welcomeHtml = `
      <div class="ema-message ema-bot-message">
        <div class="ema-msg-bubble">
          <p class="ema-welcome-p">
            🌸 <strong>Hello ${this.escapeHtml(userName)}!</strong> I'm Ema, your personal romantic muse in "${this.escapeHtml(spaceName)}".
          </p>
          <p class="ema-welcome-p">
            I'm here right beside you on the screen! Tell me what you'd like to write or say to <strong>${this.escapeHtml(partnerName)}</strong>, or tap any quick idea above. I'll create ready-to-copy heartfelt words for you! ♡
          </p>
        </div>
      </div>
    `;

    stream.innerHTML = welcomeHtml;
  },

  toggleSideScreen() {
    if (this.isOpen) {
      this.closeSideScreen();
    } else {
      this.openSideScreen();
    }
  },

  openSideScreen() {
    this.init();
    const sideScreen = document.getElementById('heartlyEmaSideScreen');
    const btn = document.getElementById('heartlyFloatingEmaBtn');
    if (!sideScreen) return;

    this.isOpen = true;
    sideScreen.style.display = 'flex';

    // Position near floating button
    if (btn) {
      const rect = btn.getBoundingClientRect();
      this.positionSideScreenNearButton(rect.left, rect.top);
    }

    const textarea = document.getElementById('inputEmaSideCommand');
    textarea?.focus();

    this.scrollToBottom();
  },

  closeSideScreen() {
    const sideScreen = document.getElementById('heartlyEmaSideScreen');
    if (!sideScreen) return;
    this.isOpen = false;
    sideScreen.style.display = 'none';
  },

  async sendUserMessage() {
    if (this.isGenerating) return;

    const textarea = document.getElementById('inputEmaSideCommand');
    const text = textarea?.value?.trim();
    if (!text) return;

    textarea.value = '';
    textarea.style.height = 'auto';

    // Append User Message to Chat Stream
    this.appendMessage('user', text);

    const typingEl = document.getElementById('emaTypingIndicator');
    const btnSend = document.getElementById('btnEmaSideSend');

    this.isGenerating = true;
    if (typingEl) typingEl.style.display = 'flex';
    if (btnSend) btnSend.disabled = true;
    this.scrollToBottom();

    const userName = this.getUserName();
    const partnerName = this.getPartnerName();
    const spaceName = this.getSpaceName();

    try {
      const res = await API.requestAiAssistance({
        command: text,
        prompt: text,
        userName,
        partnerName,
        spaceName,
      });

      if (res && res.success) {
        this.appendMessage('ema', res);
      } else {
        throw new Error(res?.error || res?.message || 'No response returned from Ema');
      }
    } catch (err) {
      console.error('[Ema] Error:', err);
      this.appendMessage(
        'ema',
        `⚠️ ${err.message || 'Could not connect to FreeLLMAPI at http://localhost:3001. Please make sure FreeLLMAPI is active.'}`,
        true
      );
    } finally {
      this.isGenerating = false;
      if (typingEl) typingEl.style.display = 'none';
      if (btnSend) btnSend.disabled = false;
      this.scrollToBottom();
    }
  },

  cleanTags(str) {
    if (!str) return '';
    return String(str)
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/\[\/?(CONVERSATION|COPYABLE|THINK|REASONING)\]/gi, '')
      .trim();
  },

  parseBotPayload(payload) {
    if (typeof payload === 'object' && payload !== null) {
      let intro = this.cleanTags(payload.intro || '');
      let copyable = this.cleanTags(payload.copyable || '');
      const rawResult = this.cleanTags(payload.result || payload.fullText || '');

      if (!intro && !copyable && rawResult) {
        return this.parseBotString(rawResult);
      }
      return {
        intro: intro || (copyable ? '' : rawResult),
        copyable,
        fullText: rawResult || intro,
      };
    }
    return this.parseBotString(String(payload || ''));
  },

  parseBotString(str) {
    const text = String(str || '').trim();
    // 1. Tagged format [CONVERSATION]... [COPYABLE]...
    const convMatch = text.match(/\[CONVERSATION\]([\s\S]*?)(?:\[\/CONVERSATION\]|$)/i);
    const copyMatch = text.match(/\[COPYABLE\]([\s\S]*?)(?:\[\/COPYABLE\]|$)/i);
    if (copyMatch) {
      return {
        intro: convMatch ? this.cleanTags(convMatch[1]) : '',
        copyable: this.cleanTags(copyMatch[1]),
        fullText: this.cleanTags(text),
      };
    }
    if (convMatch && !copyMatch) {
      return {
        intro: this.cleanTags(convMatch[1]),
        copyable: '',
        fullText: this.cleanTags(convMatch[1]),
      };
    }

    // 2. Colon separator heuristic (e.g. "Here is what was requested:\n\n...")
    const colonSplit = text.split(/:\s*\n+/);
    if (colonSplit.length > 1 && colonSplit[0].length < 120 && !colonSplit[0].includes('\n')) {
      return {
        intro: this.cleanTags(colonSplit[0]),
        copyable: this.cleanTags(colonSplit.slice(1).join('\n\n')),
        fullText: this.cleanTags(text),
      };
    }

    // 3. Quoted text heuristic
    const quoteMatch = text.match(/^([^\n"]+[:!])?\s*["“]([\s\S]+?)["”]\s*$/);
    if (quoteMatch && quoteMatch[2]) {
      return {
        intro: this.cleanTags(quoteMatch[1] || ''),
        copyable: this.cleanTags(quoteMatch[2]),
        fullText: this.cleanTags(text),
      };
    }

    // Default: conversational response with no copy box
    return { intro: this.cleanTags(text), copyable: '', fullText: this.cleanTags(text) };
  },

  appendMessage(sender, payload, isError = false) {
    const stream = document.getElementById('emaChatStream');
    if (!stream) return;

    const msgId = 'ema_msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const isUser = sender === 'user';

    const msgDiv = document.createElement('div');
    msgDiv.className = `ema-message ${isUser ? 'ema-user-message' : 'ema-bot-message'} ${isError ? 'is-error' : ''}`;
    msgDiv.id = msgId;

    if (isUser) {
      const userText = typeof payload === 'string' ? payload : (payload?.text || '');
      msgDiv.innerHTML = `
        <div class="ema-msg-bubble">
          <p>${this.escapeHtml(userText)}</p>
        </div>
      `;
    } else if (isError) {
      const errText = typeof payload === 'string' ? payload : (payload?.message || payload?.error || 'An error occurred.');
      msgDiv.innerHTML = `
        <div class="ema-msg-bubble">
          <div class="ema-msg-text">${this.formatEmaText(errText)}</div>
        </div>
      `;
    } else {
      // Ema response with strictly separated introductory words & copyable text
      const parsed = this.parseBotPayload(payload);

      const introHtml = parsed.intro
        ? `<div class="ema-msg-intro"><span class="ema-intro-sparkle">🌸</span><span>${this.formatEmaText(parsed.intro)}</span></div>`
        : '';

      const hasCopyable = !!parsed.copyable;
      const copyableHtml = hasCopyable
        ? `
        <div class="ema-copyable-card">
          <div class="ema-copyable-header">
            <span class="ema-copyable-tag">✨ Ready to copy</span>
            <button type="button" class="btn-ema-msg-copy" title="Copy ready-to-use expression">
              📋 Copy Text
            </button>
          </div>
          <div class="ema-copyable-content">${this.formatEmaText(parsed.copyable)}</div>
        </div>
      `
        : `
        <div class="ema-msg-text">${this.formatEmaText(parsed.intro || parsed.fullText)}</div>
      `;

      msgDiv.innerHTML = `
        <div class="ema-msg-bubble">
          ${introHtml}
          ${copyableHtml}
        </div>
      `;

      // Copy handler copies ONLY the copyable text without introductory words!
      if (hasCopyable) {
        const copyBtn = msgDiv.querySelector('.btn-ema-msg-copy');
        copyBtn?.addEventListener('click', () => {
          navigator.clipboard.writeText(parsed.copyable).then(() => {
            copyBtn.innerHTML = '✅ Copied!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
              copyBtn.innerHTML = '📋 Copy Text';
              copyBtn.classList.remove('copied');
            }, 2000);

            if (window.HeartlyDialog) {
              HeartlyDialog.toast('📋 Copied expression to clipboard!', 'success');
            }
          });
        });
      }
    }

    stream.appendChild(msgDiv);
    this.scrollToBottom();
  },

  formatEmaText(text) {
    if (!text) return '';
    // Preserve linebreaks and paragraphs
    return this.escapeHtml(text).replace(/\n/g, '<br>');
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  scrollToBottom() {
    const stream = document.getElementById('emaChatStream');
    if (stream) {
      stream.scrollTop = stream.scrollHeight;
    }
  },

  // Visibility Control:
  // "keep Ema as a floating button for all pages except personal space"
  updateTabVisibility(tabId) {
    this.currentTab = tabId;
    const container = document.getElementById('heartlyEmaWidgetContainer');
    if (!container) return;

    const isUnlocked = API.isSpaceUnlocked && API.isSpaceUnlocked();
    const hasToken = !!API.getToken();

    if (!hasToken || !isUnlocked) {
      container.style.display = 'none';
      this.closeSideScreen();
      return;
    }

    if (tabId === 'personal') {
      container.style.display = 'none';
      this.closeSideScreen();
    } else {
      container.style.display = 'block';
      const btn = document.getElementById('heartlyFloatingEmaBtn');
      if (btn) btn.style.display = 'flex';
    }
  },

  showFloatingButton() {
    if (this.currentTab !== 'personal') {
      const container = document.getElementById('heartlyEmaWidgetContainer');
      if (container) container.style.display = 'block';
      const btn = document.getElementById('heartlyFloatingEmaBtn');
      if (btn) btn.style.display = 'flex';
    }
  },

  hideFloatingButton() {
    const container = document.getElementById('heartlyEmaWidgetContainer');
    if (container) container.style.display = 'none';
    this.closeSideScreen();
  },
};

window.HeartlyAiAssistant = HeartlyAiAssistant;
