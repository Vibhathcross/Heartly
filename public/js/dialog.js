/**
 * Heartly Romantic Dialog, Alert & Prompt System
 * Replaces ugly browser alert/confirm/prompt popups with a beautiful, non-blocking romantic modal.
 * Keeps input focus intact and features the "Heartly" app branding.
 */
const HeartlyDialog = {
  lastFocusedElement: null,
  activeResolve: null,

  init() {
    if (document.getElementById('heartlyDialogContainer')) return;

    const modalHtml = `
      <div id="heartlyDialogOverlay" class="heartly-dialog-overlay" style="display: none;">
        <div class="heartly-dialog-card" role="dialog" aria-modal="true">
          <div class="heartly-dialog-header">
            <span class="heartly-dialog-icon">❤️</span>
            <span class="heartly-dialog-brand">Heartly</span>
          </div>
          <div class="heartly-dialog-body">
            <div id="heartlyDialogMessage" class="heartly-dialog-message"></div>
            <div id="heartlyDialogInputWrapper" style="display: none;">
              <input type="text" id="heartlyDialogInput" class="heartly-dialog-input" spellcheck="false" autocomplete="off" />
            </div>
          </div>
          <div class="heartly-dialog-footer" id="heartlyDialogFooter">
            <!-- Buttons injected dynamically -->
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Close on overlay click (if alert)
    const overlay = document.getElementById('heartlyDialogOverlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && overlay.dataset.dialogType === 'alert') {
        this.close(true);
      }
    });

    // Handle Escape key
    window.addEventListener('keydown', (e) => {
      if (overlay.style.display === 'flex' && e.key === 'Escape') {
        e.stopPropagation();
        this.close(overlay.dataset.dialogType === 'prompt' ? null : false);
      }
    });
  },

  show({ message, title = 'Heartly', type = 'alert', confirmText = '❤️ Got It', cancelText = 'Cancel', icon = '💌', defaultValue = '', html = null }) {
    this.init();

    // Remember what element was focused before dialog opened so we can restore it seamlessly
    this.lastFocusedElement = document.activeElement;

    return new Promise((resolve) => {
      this.activeResolve = resolve;

      const overlay = document.getElementById('heartlyDialogOverlay');
      const msgEl = document.getElementById('heartlyDialogMessage');
      const inputWrapper = document.getElementById('heartlyDialogInputWrapper');
      const inputEl = document.getElementById('heartlyDialogInput');
      const footerEl = document.getElementById('heartlyDialogFooter');
      const iconEl = overlay.querySelector('.heartly-dialog-icon');
      const brandEl = overlay.querySelector('.heartly-dialog-brand');

      overlay.dataset.dialogType = type;
      if (iconEl) iconEl.innerText = icon;
      if (brandEl) brandEl.innerText = title || 'Heartly';

      if (html) {
        msgEl.innerHTML = html;
      } else {
        msgEl.innerText = message || '';
      }

      if (type === 'prompt') {
        inputWrapper.style.display = 'block';
        inputEl.value = defaultValue || '';

        footerEl.innerHTML = `
          <button type="button" class="btn-dialog-secondary" id="heartlyDialogBtnCancel">${cancelText}</button>
          <button type="button" class="btn-dialog-primary" id="heartlyDialogBtnConfirm">${confirmText}</button>
        `;

        const btnCancel = document.getElementById('heartlyDialogBtnCancel');
        const btnConfirm = document.getElementById('heartlyDialogBtnConfirm');

        const submitPrompt = () => {
          const val = inputEl.value.trim();
          this.close(val);
        };

        btnCancel.onclick = () => {
          this.close(null);
        };

        btnConfirm.onclick = submitPrompt;

        inputEl.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitPrompt();
          }
        };

        overlay.style.display = 'flex';
        setTimeout(() => {
          inputEl.focus();
          inputEl.select();
        }, 50);

      } else if (type === 'confirm') {
        inputWrapper.style.display = 'none';

        footerEl.innerHTML = `
          <button type="button" class="btn-dialog-secondary" id="heartlyDialogBtnCancel">${cancelText}</button>
          <button type="button" class="btn-dialog-primary" id="heartlyDialogBtnConfirm">${confirmText}</button>
        `;

        const btnCancel = document.getElementById('heartlyDialogBtnCancel');
        const btnConfirm = document.getElementById('heartlyDialogBtnConfirm');

        btnCancel.onclick = () => {
          this.close(false);
        };

        btnConfirm.onclick = () => {
          this.close(true);
        };

        overlay.style.display = 'flex';
        btnConfirm.focus();
      } else {
        // Alert mode
        inputWrapper.style.display = 'none';

        footerEl.innerHTML = `
          <button type="button" class="btn-dialog-primary" id="heartlyDialogBtnConfirm">${confirmText}</button>
        `;

        const btnConfirm = document.getElementById('heartlyDialogBtnConfirm');
        btnConfirm.onclick = () => {
          this.close(true);
        };

        overlay.style.display = 'flex';
        btnConfirm.focus();
      }
    });
  },

  alert(message, title = 'Heartly') {
    return this.show({ message, title, type: 'alert', icon: '💌', confirmText: '❤️ Got It' });
  },

  confirm(message, title = 'Heartly', options = {}) {
    const isDelete = (title && title.toLowerCase().includes('delete')) || (message && message.toLowerCase().includes('delete'));
    const confirmText = options.confirmText || (isDelete ? '🗑️ Delete' : '❤️ Confirm');
    const cancelText = options.cancelText || 'Cancel';
    const icon = options.icon || (isDelete ? '🗑️' : '💖');
    return this.show({ message, title, type: 'confirm', icon, confirmText, cancelText });
  },

  prompt(message, defaultValue = '', title = 'Heartly') {
    return this.show({
      message,
      title,
      type: 'prompt',
      icon: '✏️',
      confirmText: '❤️ Save',
      cancelText: 'Cancel',
      defaultValue,
    });
  },

  toast(message, type = 'info') {
    let container = document.getElementById('heartlyToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'heartlyToastContainer';
      container.style.cssText = `
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    const toastEl = document.createElement('div');
    const isError = type === 'error';
    const isSuccess = type === 'success';
    const bg = isError ? 'linear-gradient(135deg, #c9184a 0%, #a4133c 100%)' :
               isSuccess ? 'linear-gradient(135deg, #2b9348 0%, #1b6330 100%)' :
               'linear-gradient(135deg, rgba(30,16,24,0.92) 0%, rgba(50,20,35,0.95) 100%)';
    const icon = isError ? '⚠️' : isSuccess ? '✨' : '💌';

    toastEl.style.cssText = `
      background: ${bg};
      color: #ffffff;
      padding: 10px 22px;
      border-radius: 24px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.25);
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: 0.2px;
      display: flex;
      align-items: center;
      gap: 8px;
      backdrop-filter: blur(12px);
      opacity: 0;
      transform: translateY(12px) scale(0.95);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: auto;
    `;
    toastEl.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toastEl);

    requestAnimationFrame(() => {
      toastEl.style.opacity = '1';
      toastEl.style.transform = 'translateY(0) scale(1)';
    });

    setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(-10px) scale(0.95)';
      setTimeout(() => {
        toastEl.remove();
      }, 250);
    }, 3200);
  },

  showPairingCode(pairingCode, spaceName = 'Your Space') {
    const html = `
      <div style="font-size: 15px; margin-bottom: 8px; color: var(--text-main); font-weight: 600;">
        Your private space <strong>"${spaceName}"</strong> is created! 🎉
      </div>
      <div style="font-size: 13.5px; color: var(--text-muted); margin-bottom: 14px;">
        Send this connection code to your love and let them connect to your space:
      </div>
      <div class="pairing-code-dialog-box">
        <div class="pairing-code-badge" id="dialogPairingCodeText">${pairingCode}</div>
        <button type="button" class="btn-copy-code" id="btnDialogCopyCode">
          📋 Copy Code
        </button>
      </div>
      <div class="pairing-code-hint">
        Tell your partner to choose <em>"Join Existing Space"</em>, enter this code along with your master space passcode, and your two worlds will be connected forever! 💕
      </div>
    `;

    return new Promise((resolve) => {
      this.show({
        html,
        title: 'Space Created! 💖',
        type: 'alert',
        icon: '💌',
        confirmText: 'Enter Our Space ❤️',
      }).then(resolve);

      // Bind copy button
      setTimeout(() => {
        const copyBtn = document.getElementById('btnDialogCopyCode');
        copyBtn?.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(pairingCode);
            copyBtn.innerHTML = '✨ Copied to Clipboard!';
            copyBtn.style.background = '#e8f5e9';
            copyBtn.style.color = '#2e7d32';
            copyBtn.style.borderColor = '#81c784';
            setTimeout(() => {
              copyBtn.innerHTML = '📋 Copy Code';
              copyBtn.style.background = '#ffffff';
              copyBtn.style.color = 'var(--primary)';
              copyBtn.style.borderColor = 'var(--primary)';
            }, 2500);
          } catch (err) {
            // Fallback copy
            const temp = document.createElement('textarea');
            temp.value = pairingCode;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
            copyBtn.innerHTML = '✨ Copied to Clipboard!';
            setTimeout(() => {
              copyBtn.innerHTML = '📋 Copy Code';
            }, 2500);
          }
        });
      }, 50);
    });
  },

  close(result = null) {
    const overlay = document.getElementById('heartlyDialogOverlay');
    if (overlay) {
      overlay.style.display = 'none';
      const inputWrapper = document.getElementById('heartlyDialogInputWrapper');
      if (inputWrapper) inputWrapper.style.display = 'none';
    }

    if (this.activeResolve) {
      const res = this.activeResolve;
      this.activeResolve = null;
      res(result);
    }

    // Immediately restore focus back to the text box / input without freezing
    if (this.lastFocusedElement && typeof this.lastFocusedElement.focus === 'function') {
      setTimeout(() => {
        try {
          this.lastFocusedElement.focus();
        } catch (e) {}
      }, 50);
    }
  },
};

// Auto-initialize on load
document.addEventListener('DOMContentLoaded', () => {
  HeartlyDialog.init();
});

// Provide globally
window.HeartlyDialog = HeartlyDialog;

// Override default browser alert & confirm to prevent Chromium/Electron input freezing
window.alert = (msg) => HeartlyDialog.alert(msg);
window.confirmAsync = (msg) => HeartlyDialog.confirm(msg);
