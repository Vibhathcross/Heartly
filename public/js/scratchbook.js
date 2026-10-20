const ScratchbookManager = {
  canvas: null,
  ctx: null,
  isDrawing: false,
  currentBrushType: 'pen', // 'pen' | 'highlighter' | 'calligraphy' | 'eraser'
  currentColor: '#ff4d6d',
  currentSize: 4,
  currentStroke: [],
  elements: [],
  version: 1,

  // Multi-Scrapbook & Customization state
  currentBookId: null,
  currentBookTitle: 'Our Shared Scratchbook',
  currentBgColor: '#ffffff',
  initialized: false,

  // Voice recording state
  mediaRecorder: null,
  audioChunks: [],
  isRecordingVoice: false,
  isVoiceTransitioning: false,

  // Active Context Menu State
  activeStickyId: null,
  liveSyncInterval: null,

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.canvas = document.getElementById('scratchCanvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.setupDrawingEvents();
    this.setupToolbarEvents();
    this.setupStickerPicker();
    this.setupStickyContextMenu();
    this.setupBackgroundColorPicker();
    this.setupBookManagement();
    this.startLiveSync();
  },

  startLiveSync() {
    if (this.liveSyncInterval) return;
    this.liveSyncInterval = setInterval(() => {
      this.syncScratchbook();
    }, 3500);
  },

  stopLiveSync() {
    if (this.liveSyncInterval) {
      clearInterval(this.liveSyncInterval);
      this.liveSyncInterval = null;
    }
  },

  async syncScratchbook() {
    if (!API.getToken() || !API.isSpaceUnlocked() || this.isDrawing) return;
    const sbSection = document.getElementById('scratchbookSection');
    if (!sbSection || sbSection.style.display === 'none') return;

    try {
      const targetId = this.currentBookId || localStorage.getItem('heartly_active_scratchbook_id');
      if (!targetId) return;
      const data = await API.getScratchbook(targetId);
      const sb = data?.scratchbook;
      if (!sb) return;

      if (sb.version && sb.version !== this.version) {
        this.loadScratchbook(sb._id);
      }
    } catch (e) {}
  },

  resizeCanvas() {
    const wrapper = document.getElementById('canvasWrapper');
    if (!wrapper || !this.canvas) return;

    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    this.ctx.scale(dpr, dpr);
    this.redrawAll();
  },

  setupToolbarEvents() {
    // 1. Brush Type Buttons
    const brushButtons = [
      { id: 'toolBrushPen', type: 'pen' },
      { id: 'toolBrushHighlighter', type: 'highlighter' },
      { id: 'toolBrushCalligraphy', type: 'calligraphy' },
      { id: 'toolBrushEraser', type: 'eraser' },
    ];

    brushButtons.forEach(({ id, type }) => {
      const btn = document.getElementById(id);
      btn?.addEventListener('click', () => {
        brushButtons.forEach((b) => document.getElementById(b.id)?.classList.remove('active'));
        btn.classList.add('active');
        this.currentBrushType = type;
      });
    });

    // 2. Brush Size Slider
    const sizeSlider = document.getElementById('brushSizeSlider');
    const sizePreview = document.getElementById('brushSizePreview');

    if (sizeSlider) {
      sizeSlider.addEventListener('input', (e) => {
        this.currentSize = parseInt(e.target.value, 10);
        if (sizePreview) {
          const s = Math.min(22, Math.max(4, this.currentSize));
          sizePreview.style.width = `${s}px`;
          sizePreview.style.height = `${s}px`;
          sizePreview.style.background = this.currentBrushType === 'eraser' ? '#aaa' : this.currentColor;
        }
      });
    }

    // 3. Quick Color Dots & Color Input
    const colorDots = document.querySelectorAll('.brush-color-dot');
    const colorInput = document.getElementById('brushColor');

    colorDots.forEach((dot) => {
      dot.addEventListener('click', () => {
        colorDots.forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        this.currentColor = dot.getAttribute('data-color');
        if (colorInput) colorInput.value = this.currentColor;
        if (sizePreview && this.currentBrushType !== 'eraser') {
          sizePreview.style.background = this.currentColor;
        }
      });
    });

    colorInput?.addEventListener('input', (e) => {
      this.currentColor = e.target.value;
      colorDots.forEach((d) => d.classList.remove('active'));
      if (sizePreview && this.currentBrushType !== 'eraser') {
        sizePreview.style.background = this.currentColor;
      }
    });

    // 4. Sticky Note Button (Creates plain text note by default)
    document.getElementById('toolAddSticky')?.addEventListener('click', () => {
      this.createStickyNote();
    });

    // 5. Polaroid Button & File Input
    const polaroidBtn = document.getElementById('toolAddPolaroid');
    const polaroidInput = document.getElementById('polaroidFileInput');

    polaroidBtn?.addEventListener('click', () => {
      polaroidInput?.click();
    });

    polaroidInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await this.handlePolaroidUpload(file);
      polaroidInput.value = '';
    });

    // 6. Voice Recording Button
    document.getElementById('toolRecordVoice')?.addEventListener('click', () => {
      this.toggleVoiceRecording();
    });

    // 7. Clear Scratchbook
    document.getElementById('btnClearScratchbook')?.addEventListener('click', async () => {
      const confirmed = await HeartlyDialog.confirm(
        'Clear the entire shared scratchbook canvas for both of you? All notes, drawings and stickers will be wiped.',
        'Clear Scratchbook'
      );
      if (confirmed) {
        await API.clearScratchbook(this.currentBookId);
        window.SocketManager.emitScratchClear(this.currentBookId);
        this.elements = [];
        this.redrawAll();
        const overlay = document.getElementById('canvasElementsOverlay');
        if (overlay) overlay.innerHTML = '';
      }
    });
  },

  // ==================== BACKGROUND COLOR CUSTOMIZATION ====================
  setupBackgroundColorPicker() {
    const dots = document.querySelectorAll('.scratch-bg-dot');
    const picker = document.getElementById('canvasBgColorPicker');

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const color = dot.getAttribute('data-color');
        this.applyBackgroundColor(color, true);
      });
    });

    picker?.addEventListener('input', (e) => {
      this.applyBackgroundColor(e.target.value, false);
    });

    picker?.addEventListener('change', (e) => {
      this.applyBackgroundColor(e.target.value, true);
    });
  },

  applyBackgroundColor(color, persist = true) {
    if (!color) return;
    this.currentBgColor = color;
    const wrapper = document.getElementById('canvasWrapper');
    const canvas = document.getElementById('scratchCanvas');
    if (wrapper) wrapper.style.backgroundColor = color;
    if (canvas) canvas.style.backgroundColor = 'transparent';

    // Update active dot in palette
    const dots = document.querySelectorAll('.scratch-bg-dot');
    dots.forEach((dot) => {
      const dotColor = (dot.getAttribute('data-color') || '').toLowerCase();
      if (dotColor === color.toLowerCase()) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });

    const picker = document.getElementById('canvasBgColorPicker');
    if (picker) picker.value = color;

    if (persist && this.currentBookId) {
      API.updateScratchbookBg(this.currentBookId, color).catch(console.warn);
      window.SocketManager.emitScratchBackgroundChange(this.currentBookId, color);
    }
  },

  // ==================== MULTI-SCRAPBOOK MANAGEMENT ====================
  setupBookManagement() {
    const btnBrowse = document.getElementById('btnBrowseScratchbooks');
    const modal = document.getElementById('savedScrapbooksModal');
    const btnCloseModal = document.getElementById('btnCloseSavedBooksModal');
    const btnNewBook = document.getElementById('btnNewScratchbook');
    const btnModalNewBook = document.getElementById('btnModalCreateNewBook');
    const btnRename = document.getElementById('btnRenameCurrentBook');

    btnBrowse?.addEventListener('click', () => {
      this.openSavedBooksModal();
    });

    btnCloseModal?.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });

    // Close on clicking backdrop
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    const promptCreateBook = async () => {
      const name = await HeartlyDialog.prompt(
        'Give your new romantic scrapbook a special title (e.g. "Our Trip to Paris", "Valentine 2026"):',
        'Our Romantic Memories',
        'Create New Scrapbook'
      );
      if (name && name.trim()) {
        try {
          const res = await API.createScratchbook(name.trim(), this.currentBgColor || '#ffffff');
          if (res.scratchbook) {
            if (modal) modal.style.display = 'none';
            await this.switchToBook(res.scratchbook._id);
            HeartlyDialog.alert(`"${res.scratchbook.title}" created! Ready to fill with sweet memories ❤️`, 'New Scrapbook');
          }
        } catch (err) {
          HeartlyDialog.alert('Failed to create scrapbook: ' + err.message, 'Create Error');
        }
      }
    };

    btnNewBook?.addEventListener('click', promptCreateBook);
    btnModalNewBook?.addEventListener('click', promptCreateBook);

    const promptRenameCurrentBook = async () => {
      if (!this.currentBookId) return;
      const newTitle = await HeartlyDialog.prompt(
        'Enter new title for this scrapbook:',
        this.currentBookTitle || 'Our Shared Scratchbook',
        'Rename Scrapbook'
      );
      if (newTitle && newTitle.trim()) {
        try {
          await API.renameScratchbook(this.currentBookId, newTitle.trim());
          this.currentBookTitle = newTitle.trim();
          const titleEl = document.getElementById('scratchbookTitleText');
          if (titleEl) titleEl.innerText = this.currentBookTitle;
          window.SocketManager.emitScratchBookRename(this.currentBookId, this.currentBookTitle);
        } catch (err) {
          HeartlyDialog.alert('Failed to rename scrapbook: ' + err.message, 'Rename Error');
        }
      }
    };

    btnRename?.addEventListener('click', promptRenameCurrentBook);
    const titleTextEl = document.getElementById('scratchbookTitleText');
    if (titleTextEl) {
      titleTextEl.style.cursor = 'pointer';
      titleTextEl.addEventListener('click', promptRenameCurrentBook);
    }
  },

  async openSavedBooksModal() {
    const modal = document.getElementById('savedScrapbooksModal');
    const listEl = document.getElementById('savedScrapbooksList');
    if (!modal || !listEl) return;

    modal.style.display = 'flex';
    listEl.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--text-muted);">Loading scrapbooks... ❤️</div>';

    try {
      const res = await API.getScratchbookList();
      const books = res.scrapbooks || [];
      if (books.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--text-muted);">No scrapbooks found.</div>';
        return;
      }

      listEl.innerHTML = '';
      books.forEach((book) => {
        const item = document.createElement('div');
        const isActive = book._id === this.currentBookId;
        item.className = `saved-book-item ${isActive ? 'active-book' : ''}`;

        const createdDate = new Date(book.updatedAt || book.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        item.innerHTML = `
          <div class="saved-book-left">
            <span class="saved-book-swatch" style="background: ${book.backgroundColor || '#ffffff'};"></span>
            <div class="saved-book-meta">
              <h4>${this.escapeHtml(book.title)} ${isActive ? '<span style="font-size:11px; color:var(--primary); font-weight:700;">(Current)</span>' : ''}</h4>
              <p>🎨 ${book.elementsCount || 0} memories • Updated ${createdDate}</p>
            </div>
          </div>
          <div class="saved-book-actions">
            ${
              isActive
                ? `<button type="button" class="btn-book-open" disabled style="opacity: 0.6; cursor: default;">Active</button>`
                : `<button type="button" class="btn-book-open btn-action-switch" data-id="${book._id}">Open 📖</button>`
            }
            <button type="button" class="btn-book-icon-action btn-action-rename" data-id="${book._id}" data-title="${this.escapeHtml(book.title)}" title="Rename">✏️</button>
            ${
              books.length > 1
                ? `<button type="button" class="btn-book-icon-action btn-action-delete" data-id="${book._id}" data-title="${this.escapeHtml(book.title)}" title="Delete book" style="color: #e74c3c;">🗑️</button>`
                : ''
            }
          </div>
        `;

        item.querySelector('.btn-action-switch')?.addEventListener('click', async () => {
          modal.style.display = 'none';
          await this.switchToBook(book._id);
        });

        item.querySelector('.btn-action-rename')?.addEventListener('click', async () => {
          const newName = await HeartlyDialog.prompt('Rename this scrapbook:', book.title, 'Rename Scrapbook');
          if (newName && newName.trim()) {
            try {
              await API.renameScratchbook(book._id, newName.trim());
              window.SocketManager.emitScratchBookRename(book._id, newName.trim());
              if (book._id === this.currentBookId) {
                this.currentBookTitle = newName.trim();
                const titleEl = document.getElementById('scratchbookTitleText');
                if (titleEl) titleEl.innerText = this.currentBookTitle;
              }
              await this.openSavedBooksModal();
            } catch (err) {
              HeartlyDialog.alert('Failed to rename scrapbook: ' + err.message, 'Rename Error');
            }
          }
        });

        item.querySelector('.btn-action-delete')?.addEventListener('click', async () => {
          const confirmed = await HeartlyDialog.confirm(
            `Delete "${book.title}" and all its saved memories? This cannot be undone.`,
            'Delete Scrapbook'
          );
          if (confirmed) {
            await API.deleteScratchbook(book._id);
            if (book._id === this.currentBookId) {
              await this.loadScratchbook();
            }
            this.openSavedBooksModal();
          }
        });

        listEl.appendChild(item);
      });
    } catch (err) {
      listEl.innerHTML = `<div style="color:#e74c3c; text-align:center; padding:16px;">Failed to load saved scrapbooks: ${err.message}</div>`;
    }
  },

  async switchToBook(bookId) {
    if (this.currentBookId === bookId) return;
    await this.loadScratchbook(bookId);
    window.SocketManager.emitScratchBookSwitched(this.currentBookId, this.currentBookTitle);
  },

  applyRemoteBackground(bookId, color) {
    if (bookId === this.currentBookId) {
      this.applyBackgroundColor(color, false);
    }
  },

  applyRemoteRename(bookId, title) {
    if (bookId === this.currentBookId) {
      this.currentBookTitle = title;
      const titleEl = document.getElementById('scratchbookTitleText');
      if (titleEl) titleEl.innerText = title;
    }
  },

  handlePartnerClearedCanvas(bookId) {
    if (bookId === this.currentBookId) {
      this.elements = [];
      this.redrawAll();
      const overlay = document.getElementById('canvasElementsOverlay');
      if (overlay) overlay.innerHTML = '';
    }
  },

  async handlePartnerSwitchedBook(data) {
    if (data.scratchbookId && data.scratchbookId !== this.currentBookId) {
      const switchNow = await HeartlyDialog.confirm(
        `${data.switchedByName || 'Your partner'} opened the scrapbook "${data.title}" 📚. Would you like to switch to it now?`,
        'Partner Switched Scrapbook'
      );
      if (switchNow) {
        await this.switchToBook(data.scratchbookId);
      }
    }
  },

  // ==================== GLASSMORPHYS STICKER PICKER ====================
  setupStickerPicker() {
    const btnToggle = document.getElementById('toolToggleStickers');
    const picker = document.getElementById('glassmorphicStickerPicker');
    const btnClose = document.getElementById('btnCloseStickerPicker');
    const content = document.getElementById('glassPickerContent');

    if (!btnToggle || !picker) return;

    const categories = [
      {
        title: '💖 Love & Romance',
        emojis: ['❤️', '💖', '💘', '💝', '💓', '💞', '💕', '💌', '💍', '💎', '🌹', '🥀', '💐', '🌸', '🌺', '🌷', '🍫', '🥂'],
      },
      {
        title: '🥰 Cute Expressions',
        emojis: ['🥰', '😍', '😘', '😚', '🥺', '🤗', '😽', '💋', '😻', '🫶', '🥹', '✨', '🤍', '💫', '🕊️', '🧸', '😇', '😻'],
      },
      {
        title: '🍷 Romantic Dates & Treats',
        emojis: ['🍷', '🍾', '🎂', '🍰', '🥞', '🍓', '☕', '🍽️', '🕯️', '🍿', '🧁', '🍩', '🍕', '🍦', '🍨', '🍪', '🧇', '🍣'],
      },
      {
        title: '✈️ Adventures & Travel',
        emojis: ['✈️', '🚗', '🏖️', '🌅', '🎡', '⛺', '🌲', '🗼', '⛵', '🏝️', '🏕️', '🚀', '🌌', '🏰', '🗽', '🎢', '🚲', '🎆'],
      },
      {
        title: '🎁 Sweet Gifts & Fun',
        emojis: ['🎁', '🎀', '🎈', '🎵', '🎶', '📸', '✉️', '🌙', '⭐', '💫', '🔮', '🧸', '🎨', '🎠', '💌', '👑', '☀️', '🌈'],
      },
    ];

    if (content) {
      let html = '';
      categories.forEach((cat) => {
        html += `
          <div class="sticker-category-group">
            <div class="sticker-category-title">${cat.title}</div>
            <div class="sticker-emoji-grid">
              ${cat.emojis.map((emoji) => `<button type="button" class="sticker-emoji-btn" data-emoji="${emoji}">${emoji}</button>`).join('')}
            </div>
          </div>
        `;
      });
      content.innerHTML = html;

      content.querySelectorAll('.sticker-emoji-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const emoji = btn.getAttribute('data-emoji');
          this.createSticker(emoji);
          picker.style.display = 'none';
        });
      });
    }

    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
    });

    btnClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      picker.style.display = 'none';
    });

    // Close when clicking outside
    window.addEventListener('click', (e) => {
      if (picker.style.display !== 'none' && !picker.contains(e.target) && e.target !== btnToggle) {
        picker.style.display = 'none';
      }
    });
  },

  // ==================== STICKY NOTE CONTEXT MENU ====================
  setupStickyContextMenu() {
    const menu = document.getElementById('stickyContextMenu');
    const toggleOutline = document.getElementById('stickyToggleOutline');
    const outlineColorRow = document.getElementById('stickyOutlineColorRow');
    const outlineColorInput = document.getElementById('stickyOutlineColor');

    const toggleBorder = document.getElementById('stickyToggleBorder');
    const borderColorsRow = document.getElementById('stickyBorderColorsRow');

    const btnToggleFontList = document.getElementById('btnToggleFontList');
    const fontListPanel = document.getElementById('stickyFontList');
    const textColorInput = document.getElementById('stickyTextColor');
    const btnDelete = document.getElementById('btnDeleteSticky');

    // Layer arrangement buttons
    const btnLayerFront = document.getElementById('btnLayerFront');
    const btnLayerForward = document.getElementById('btnLayerForward');
    const btnLayerBackward = document.getElementById('btnLayerBackward');
    const btnLayerBack = document.getElementById('btnLayerBack');

    // Rotation controls
    const btnRotateLeft15 = document.getElementById('btnRotateLeft15');
    const btnRotateReset = document.getElementById('btnRotateReset');
    const btnRotateRight15 = document.getElementById('btnRotateRight15');
    const rotSlider = document.getElementById('elementRotationSlider');
    const rotValueLabel = document.getElementById('elementRotationValue');

    if (!menu) return;

    // Layer Ordering Actions
    btnLayerFront?.addEventListener('click', () => {
      if (this.activeStickyId) {
        this.bringToFront(this.activeStickyId);
        menu.style.display = 'none';
      }
    });

    btnLayerForward?.addEventListener('click', () => {
      if (this.activeStickyId) {
        this.bringForward(this.activeStickyId);
      }
    });

    btnLayerBackward?.addEventListener('click', () => {
      if (this.activeStickyId) {
        this.sendBackward(this.activeStickyId);
      }
    });

    btnLayerBack?.addEventListener('click', () => {
      if (this.activeStickyId) {
        this.sendToBack(this.activeStickyId);
        menu.style.display = 'none';
      }
    });

    // Rotation Actions
    btnRotateLeft15?.addEventListener('click', () => {
      if (this.activeStickyId) {
        const el = this.elements.find((e) => e.id === this.activeStickyId);
        if (el) {
          let newRot = (el.rotation || 0) - 15;
          if (newRot < -180) newRot += 360;
          this.setElementRotation(this.activeStickyId, newRot);
          if (rotSlider) rotSlider.value = newRot;
          if (rotValueLabel) rotValueLabel.innerText = `${newRot}°`;
        }
      }
    });

    btnRotateRight15?.addEventListener('click', () => {
      if (this.activeStickyId) {
        const el = this.elements.find((e) => e.id === this.activeStickyId);
        if (el) {
          let newRot = (el.rotation || 0) + 15;
          if (newRot > 180) newRot -= 360;
          this.setElementRotation(this.activeStickyId, newRot);
          if (rotSlider) rotSlider.value = newRot;
          if (rotValueLabel) rotValueLabel.innerText = `${newRot}°`;
        }
      }
    });

    btnRotateReset?.addEventListener('click', () => {
      if (this.activeStickyId) {
        this.setElementRotation(this.activeStickyId, 0);
        if (rotSlider) rotSlider.value = 0;
        if (rotValueLabel) rotValueLabel.innerText = '0°';
      }
    });

    rotSlider?.addEventListener('input', (e) => {
      if (this.activeStickyId) {
        const val = parseInt(e.target.value, 10);
        this.setElementRotation(this.activeStickyId, val);
        if (rotValueLabel) rotValueLabel.innerText = `${val}°`;
      }
    });

    // 1. Outline Toggle
    toggleOutline?.addEventListener('change', () => {
      const activeEl = this.elements.find((e) => e.id === this.activeStickyId);
      if (!activeEl) return;
      activeEl.outlineEnabled = toggleOutline.checked;
      if (outlineColorRow) {
        outlineColorRow.style.display = activeEl.outlineEnabled ? 'flex' : 'none';
      }
      this.applyStickyStyles(activeEl);
      this.syncElementChange(activeEl);
    });

    // 1b. Outline Color Change
    outlineColorInput?.addEventListener('input', (e) => {
      const activeEl = this.elements.find((e) => e.id === this.activeStickyId);
      if (!activeEl) return;
      activeEl.outlineColor = e.target.value;
      this.applyStickyStyles(activeEl);
      this.syncElementChange(activeEl);
    });

    // 2. Border / Box Toggle
    toggleBorder?.addEventListener('change', () => {
      const activeEl = this.elements.find((e) => e.id === this.activeStickyId);
      if (!activeEl) return;
      activeEl.borderEnabled = toggleBorder.checked;
      if (borderColorsRow) {
        borderColorsRow.style.display = activeEl.borderEnabled ? 'flex' : 'none';
      }
      this.applyStickyStyles(activeEl);
      this.syncElementChange(activeEl);
    });

    // 2b. Border & Box Color Palette
    borderColorsRow?.querySelectorAll('.sticky-palette-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        const activeEl = this.elements.find((e) => e.id === this.activeStickyId);
        if (!activeEl) return;
        activeEl.bgColor = dot.getAttribute('data-bg');
        activeEl.borderColor = dot.getAttribute('data-border');
        this.applyStickyStyles(activeEl);
        this.syncElementChange(activeEl);
      });
    });

    // 3. Font Style List Toggle
    btnToggleFontList?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (fontListPanel) {
        fontListPanel.style.display = fontListPanel.style.display === 'none' ? 'block' : 'none';
      }
    });

    // 3b. Font Selection (from all 20 fonts)
    fontListPanel?.querySelectorAll('.font-option-item').forEach((item) => {
      item.addEventListener('click', () => {
        const activeEl = this.elements.find((e) => e.id === this.activeStickyId);
        if (!activeEl) return;
        const font = item.getAttribute('data-font');
        activeEl.fontFamily = font;
        if (btnToggleFontList) {
          btnToggleFontList.innerText = `${item.innerText.split(' ')[0]} ▾`;
          btnToggleFontList.style.fontFamily = font;
        }
        if (fontListPanel) fontListPanel.style.display = 'none';
        this.applyStickyStyles(activeEl);
        this.syncElementChange(activeEl);
      });
    });

    // 4. Text Color Change
    textColorInput?.addEventListener('input', (e) => {
      const activeEl = this.elements.find((e) => e.id === this.activeStickyId);
      if (!activeEl) return;
      activeEl.textColor = e.target.value;
      this.applyStickyStyles(activeEl);
      this.syncElementChange(activeEl);
    });

    // 5. Delete Note / Element
    btnDelete?.addEventListener('click', async () => {
      if (this.activeStickyId) {
        const idToDelete = this.activeStickyId;
        menu.style.display = 'none';
        this.activeStickyId = null;

        const dom = document.getElementById(idToDelete);
        if (dom) dom.remove();
        this.elements = this.elements.filter((e) => e.id !== idToDelete);
        window.SocketManager.emitElementDelete(idToDelete, this.currentBookId);
        await API.deleteScratchElement(idToDelete, this.currentBookId);
      }
    });

    // Close when clicking outside
    window.addEventListener('click', (e) => {
      if (menu.style.display !== 'none' && !menu.contains(e.target)) {
        menu.style.display = 'none';
        if (fontListPanel) fontListPanel.style.display = 'none';
        this.activeStickyId = null;
      }
    });
  },

  openStickyContextMenu(event, element) {
    event.preventDefault();
    event.stopPropagation();

    this.activeStickyId = element.id;
    const menu = document.getElementById('stickyContextMenu');
    const titleEl = document.getElementById('scratchContextMenuTitle');
    const stickyGroup = document.getElementById('stickyStylingGroup');

    const rotSlider = document.getElementById('elementRotationSlider');
    const rotValueLabel = document.getElementById('elementRotationValue');
    const btnDelete = document.getElementById('btnDeleteSticky');

    if (!menu) return;

    const isSticky = element.type === 'sticky';
    if (stickyGroup) {
      stickyGroup.style.display = isSticky ? 'block' : 'none';
    }

    if (titleEl) {
      if (element.type === 'polaroid') titleEl.innerText = '📸 Polaroid Settings';
      else if (element.type === 'sticker') titleEl.innerText = '✨ Sticker Settings';
      else if (element.type === 'voice') titleEl.innerText = '🎙️ Voice Note Settings';
      else titleEl.innerText = '✨ Note Styling';
    }

    // Update rotation slider & label
    const curRot = element.rotation || 0;
    if (rotSlider) rotSlider.value = curRot;
    if (rotValueLabel) rotValueLabel.innerText = `${curRot}°`;

    if (btnDelete) {
      const typeLabel = element.type === 'polaroid' ? 'Polaroid' : element.type === 'sticker' ? 'Sticker' : element.type === 'voice' ? 'Voice Note' : 'Note';
      btnDelete.innerText = `🗑️ Delete ${typeLabel}`;
    }

    if (isSticky) {
      const toggleOutline = document.getElementById('stickyToggleOutline');
      const outlineColorRow = document.getElementById('stickyOutlineColorRow');
      const outlineColorInput = document.getElementById('stickyOutlineColor');
      const toggleBorder = document.getElementById('stickyToggleBorder');
      const borderColorsRow = document.getElementById('stickyBorderColorsRow');
      const btnToggleFontList = document.getElementById('btnToggleFontList');
      const fontListPanel = document.getElementById('stickyFontList');
      const textColorInput = document.getElementById('stickyTextColor');

      if (toggleOutline) toggleOutline.checked = !!element.outlineEnabled;
      if (outlineColorRow) outlineColorRow.style.display = element.outlineEnabled ? 'flex' : 'none';
      if (outlineColorInput) outlineColorInput.value = element.outlineColor || '#ff4d6d';

      if (toggleBorder) toggleBorder.checked = !!element.borderEnabled;
      if (borderColorsRow) borderColorsRow.style.display = element.borderEnabled ? 'flex' : 'none';

      if (btnToggleFontList) {
        const fontName = (element.fontFamily || 'Caveat').split(',')[0].replace(/['"]/g, '');
        btnToggleFontList.innerText = `${fontName} ▾`;
        btnToggleFontList.style.fontFamily = element.fontFamily || "'Caveat', cursive";
      }
      if (fontListPanel) fontListPanel.style.display = 'none';

      if (textColorInput) textColorInput.value = element.textColor || '#2b2326';
    }

    menu.style.display = 'block';

    // Position menu near cursor using fixed viewport coordinates
    const menuWidth = 270;
    const menuHeight = isSticky ? 410 : 220;
    let posX = event?.clientX || (window.innerWidth / 2 - menuWidth / 2);
    let posY = event?.clientY || (window.innerHeight / 2 - menuHeight / 2);

    if (posX + menuWidth > window.innerWidth - 12) {
      posX = window.innerWidth - menuWidth - 12;
    }
    if (posY + menuHeight > window.innerHeight - 12) {
      posY = Math.max(10, posY - menuHeight);
    }

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
  },

  // ==================== LAYER ORDERING (FRONT / FORWARD / BACKWARD / BACK) ====================
  bringToFront(elementId) {
    const el = this.elements.find((e) => e.id === elementId);
    if (!el) return;
    const overlayElements = this.elements.filter((e) => e.type !== 'stroke');
    const maxZ = overlayElements.reduce((max, cur) => Math.max(max, cur.zIndex || 10), 10);
    el.zIndex = maxZ + 1;
    this.applyElementZIndex(el);
    this.syncElementChange(el);
  },

  sendToBack(elementId) {
    const el = this.elements.find((e) => e.id === elementId);
    if (!el) return;
    const overlayElements = this.elements.filter((e) => e.type !== 'stroke');
    const minZ = overlayElements.reduce((min, cur) => Math.min(min, cur.zIndex || 10), 10);
    el.zIndex = Math.max(2, minZ - 1);
    this.applyElementZIndex(el);
    this.syncElementChange(el);
  },

  bringForward(elementId) {
    const el = this.elements.find((e) => e.id === elementId);
    if (!el) return;
    const overlayElements = this.elements
      .filter((e) => e.type !== 'stroke')
      .sort((a, b) => (a.zIndex || 10) - (b.zIndex || 10));

    const currentIndex = overlayElements.findIndex((e) => e.id === elementId);
    if (currentIndex !== -1 && currentIndex < overlayElements.length - 1) {
      const nextEl = overlayElements[currentIndex + 1];
      const curZ = el.zIndex || 10;
      const nextZ = nextEl.zIndex || 10;
      if (curZ >= nextZ) {
        el.zIndex = curZ + 1;
      } else {
        el.zIndex = nextZ;
        nextEl.zIndex = curZ;
        this.applyElementZIndex(nextEl);
        this.syncElementChange(nextEl);
      }
    } else {
      el.zIndex = (el.zIndex || 10) + 1;
    }
    this.applyElementZIndex(el);
    this.syncElementChange(el);
  },

  sendBackward(elementId) {
    const el = this.elements.find((e) => e.id === elementId);
    if (!el) return;
    const overlayElements = this.elements
      .filter((e) => e.type !== 'stroke')
      .sort((a, b) => (a.zIndex || 10) - (b.zIndex || 10));

    const currentIndex = overlayElements.findIndex((e) => e.id === elementId);
    if (currentIndex > 0) {
      const prevEl = overlayElements[currentIndex - 1];
      const curZ = el.zIndex || 10;
      const prevZ = prevEl.zIndex || 10;
      if (curZ <= prevZ) {
        el.zIndex = Math.max(2, curZ - 1);
      } else {
        el.zIndex = Math.max(2, prevZ);
        prevEl.zIndex = curZ;
        this.applyElementZIndex(prevEl);
        this.syncElementChange(prevEl);
      }
    } else {
      el.zIndex = Math.max(2, (el.zIndex || 10) - 1);
    }
    this.applyElementZIndex(el);
    this.syncElementChange(el);
  },

  applyElementZIndex(el) {
    const dom = document.getElementById(el.id);
    if (dom) {
      dom.style.zIndex = el.zIndex || 10;
    }
  },

  // ==================== ROTATION HELPERS & DRAGGABLE ROTATE HANDLE ====================
  setElementRotation(elementId, degrees) {
    const el = this.elements.find((e) => e.id === elementId);
    if (!el) return;
    el.rotation = Math.round(degrees);
    this.applyElementRotation(el);
    this.syncElementChange(el);
  },

  applyElementRotation(el) {
    const dom = document.getElementById(el.id);
    if (dom) {
      dom.style.transform = `rotate(${el.rotation || 0}deg)`;
    }
  },

  makeRotatable(domEl, element) {
    const handle = document.createElement('div');
    handle.className = 'element-rotate-handle';
    handle.innerHTML = '🔄';
    handle.title = 'Drag to rotate element (Hold Shift for 15° steps)';
    domEl.appendChild(handle);

    const onRotateStart = (e) => {
      e.stopPropagation();
      e.preventDefault();

      handle.classList.add('active-rotating');

      let tooltip = domEl.querySelector('.rotate-tooltip-bubble');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'rotate-tooltip-bubble';
        domEl.appendChild(tooltip);
      }

      const rect = domEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const onRotateMove = (moveEvt) => {
        const clientX = moveEvt.clientX || (moveEvt.touches && moveEvt.touches[0].clientX);
        const clientY = moveEvt.clientY || (moveEvt.touches && moveEvt.touches[0].clientY);
        if (clientX === undefined) return;

        let angleRad = Math.atan2(clientY - centerY, clientX - centerX);
        let angleDeg = Math.round((angleRad * 180) / Math.PI) + 90;

        if (angleDeg > 180) angleDeg -= 360;
        if (angleDeg < -180) angleDeg += 360;

        // Snapping within 4 degrees
        if (Math.abs(angleDeg) <= 4) angleDeg = 0;
        else if (Math.abs(angleDeg - 90) <= 4) angleDeg = 90;
        else if (Math.abs(angleDeg + 90) <= 4) angleDeg = -90;
        else if (Math.abs(angleDeg - 180) <= 4 || Math.abs(angleDeg + 180) <= 4) angleDeg = 180;
        else if (moveEvt.shiftKey) {
          angleDeg = Math.round(angleDeg / 15) * 15;
        }

        element.rotation = angleDeg;
        domEl.style.transform = `rotate(${angleDeg}deg)`;
        if (tooltip) tooltip.innerText = `${angleDeg}°`;
      };

      const onRotateEnd = () => {
        handle.classList.remove('active-rotating');
        if (tooltip) tooltip.remove();
        window.removeEventListener('mousemove', onRotateMove);
        window.removeEventListener('mouseup', onRotateEnd);
        window.removeEventListener('touchmove', onRotateMove);
        window.removeEventListener('touchend', onRotateEnd);

        this.syncElementChange(element);
      };

      window.addEventListener('mousemove', onRotateMove);
      window.addEventListener('mouseup', onRotateEnd);
      window.addEventListener('touchmove', onRotateMove, { passive: false });
      window.addEventListener('touchend', onRotateEnd);
    };

    handle.addEventListener('mousedown', onRotateStart);
    handle.addEventListener('touchstart', onRotateStart, { passive: false });
  },

  applyStickyStyles(element) {
    const dom = document.getElementById(element.id);
    if (!dom) return;

    const textarea = dom.querySelector('.plain-sticky-textarea');

    // 1. Border / Box styling
    if (element.borderEnabled) {
      dom.classList.remove('plain-text');
      dom.classList.add('has-border');
      dom.style.background = element.bgColor || '#fff9c4';
      dom.style.border = `1.5px solid ${element.borderColor || '#fff176'}`;
      dom.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
    } else {
      dom.classList.add('plain-text');
      dom.classList.remove('has-border');
      dom.style.background = 'transparent';
      dom.style.border = 'none';
      dom.style.boxShadow = 'none';
    }

    // 2. Textarea styles (Font, Color, Outline, Font Size)
    if (textarea) {
      textarea.style.fontFamily = element.fontFamily || "'Caveat', cursive";
      textarea.style.color = element.textColor || '#2b2326';
      if (element.fontSize) {
        textarea.style.fontSize = `${element.fontSize}px`;
      }

      if (element.outlineEnabled) {
        const outColor = element.outlineColor || '#ff4d6d';
        textarea.style.webkitTextStroke = `1px ${outColor}`;
        textarea.style.textShadow = `0 0 4px ${outColor}`;
      } else {
        textarea.style.webkitTextStroke = '0';
        textarea.style.textShadow = 'none';
      }
    }
  },

  async syncElementChange(element) {
    element.updatedAt = Date.now();
    window.SocketManager.emitElementUpsert(element, this.currentBookId);
    try {
      await API.syncScratchElement(element, this.currentBookId);
    } catch (err) {
      console.warn('Sync element error:', err);
    }
  },

  setupDrawingEvents() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const startDraw = (e) => {
      this.isDrawing = true;
      const pos = getPos(e);
      this.currentStroke = [pos.x, pos.y];

      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
      this.applyBrushContextSettings(this.ctx, this.currentBrushType, this.currentColor, this.currentSize);

      window.SocketManager.sendActivity('drawing');
    };

    const drawMove = (e) => {
      if (!this.isDrawing) return;
      const pos = getPos(e);
      this.currentStroke.push(pos.x, pos.y);

      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();

      window.SocketManager.emitStrokeLive(
        [pos.x, pos.y],
        this.currentColor,
        this.currentSize,
        this.currentBookId
      );
    };

    const endDraw = async () => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      this.ctx.closePath();

      if (this.currentStroke.length > 2) {
        const strokeElement = {
          id: 'stroke-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          type: 'stroke',
          brushType: this.currentBrushType,
          points: this.currentStroke,
          color: this.currentColor,
          strokeWidth: this.currentSize,
          zIndex: 1,
          updatedAt: Date.now(),
        };

        this.elements.push(strokeElement);
        window.SocketManager.emitElementUpsert(strokeElement, this.currentBookId);
        try {
          await API.syncScratchElement(strokeElement, this.currentBookId);
        } catch (err) {
          console.error('Error saving stroke:', err);
        }
      }
      this.currentStroke = [];
      window.SocketManager.sendActivity('idle');
    };

    this.canvas.addEventListener('mousedown', startDraw);
    this.canvas.addEventListener('mousemove', drawMove);
    window.addEventListener('mouseup', endDraw);

    this.canvas.addEventListener('touchstart', startDraw, { passive: true });
    this.canvas.addEventListener('touchmove', drawMove, { passive: true });
    window.addEventListener('touchend', endDraw);
  },

  applyBrushContextSettings(ctx, brushType, color, size) {
    ctx.lineWidth = size || 4;
    ctx.strokeStyle = color || '#ff4d6d';

    if (brushType === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.35;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'bevel';
      ctx.lineWidth = (size || 4) * 2.2;
    } else if (brushType === 'calligraphy') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.9;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.lineWidth = (size || 4) * 1.5;
    } else if (brushType === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = (size || 4) * 3;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  },

  async loadScratchbook(bookId = null) {
    try {
      const targetId = bookId || this.currentBookId || localStorage.getItem('heartly_active_scratchbook_id') || null;
      const data = await API.getScratchbook(targetId);
      const sb = data.scratchbook;
      if (!sb) return;

      this.currentBookId = sb._id;
      localStorage.setItem('heartly_active_scratchbook_id', sb._id);
      this.currentBookTitle = sb.title || 'Our Shared Scrapbook';
      this.currentBgColor = sb.backgroundColor || '#ffffff';

      // Deduplicate elements by ID keeping newest updatedAt
      const elementMap = new Map();
      (sb.elements || []).forEach((el) => {
        if (!el || !el.id) return;
        const existing = elementMap.get(el.id);
        if (!existing || (el.updatedAt || 0) >= (existing.updatedAt || 0)) {
          elementMap.set(el.id, el);
        }
      });
      this.elements = Array.from(elementMap.values());
      this.version = sb.version || 1;

      // Update UI title and header
      const titleEl = document.getElementById('scratchbookTitleText');
      if (titleEl) titleEl.innerText = this.currentBookTitle;

      // Update background
      this.applyBackgroundColor(this.currentBgColor, false);

      this.redrawAll();
      this.renderOverlayElements();
    } catch (err) {
      console.error('Failed to load scratchbook from MongoDB:', err);
    }
  },

  redrawAll() {
    if (!this.ctx || !this.canvas) return;
    const wrapper = document.getElementById('canvasWrapper');
    const width = wrapper ? wrapper.clientWidth : 800;
    const height = wrapper ? wrapper.clientHeight : 600;

    this.ctx.clearRect(0, 0, width, height);

    this.elements
      .filter((el) => el.type === 'stroke' && el.points && el.points.length > 1)
      .forEach((stroke) => {
        this.drawStroke(stroke.points, stroke.color, stroke.strokeWidth, stroke.brushType);
      });
  },

  drawStroke(points, color, width, brushType = 'pen') {
    if (!points || points.length < 2) return;
    this.ctx.save();
    this.ctx.beginPath();
    this.applyBrushContextSettings(this.ctx, brushType, color, width);

    this.ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
      this.ctx.lineTo(points[i], points[i + 1]);
    }
    this.ctx.stroke();
    this.ctx.closePath();
    this.ctx.restore();
  },

  renderLiveStroke(data) {
    if (!this.ctx) return;
    const { points, color, strokeWidth } = data;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = strokeWidth;
    this.ctx.lineCap = 'round';
    this.ctx.arc(points[0], points[1], strokeWidth / 2, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.closePath();
    this.ctx.restore();
  },

  renderOverlayElements() {
    const overlay = document.getElementById('canvasElementsOverlay');
    if (!overlay) return;
    overlay.innerHTML = '';

    this.elements
      .filter((el) => el.type !== 'stroke')
      .forEach((el) => {
        if (el.type === 'sticky') {
          this.mountStickyDOM(el);
        } else if (el.type === 'sticker') {
          this.mountStickerDOM(el);
        } else if (el.type === 'polaroid') {
          this.mountPolaroidDOM(el);
        } else if (el.type === 'voice') {
          this.mountVoiceDOM(el);
        }
      });
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  },

  applyRemoteElement(element, bookId = null) {
    if (bookId && this.currentBookId && bookId !== this.currentBookId) {
      return;
    }
    this.elements = this.elements.filter((e) => e.id !== element.id);
    this.elements.push(element);

    if (element.type === 'stroke') {
      this.drawStroke(element.points, element.color, element.strokeWidth, element.brushType);
    } else {
      const existingDom = document.getElementById(element.id);
      // If user is currently actively typing inside this element, only update coordinates, dimensions and styles without remounting
      if (existingDom && existingDom.contains(document.activeElement)) {
        existingDom.style.left = `${element.x}px`;
        existingDom.style.top = `${element.y}px`;
        if (element.zIndex !== undefined) {
          existingDom.style.zIndex = element.zIndex;
        }
        if (element.rotation !== undefined) {
          existingDom.style.transform = `rotate(${element.rotation}deg)`;
        }
        if (element.width) {
          if (element.type === 'sticker') {
            existingDom.style.fontSize = `${element.width}px`;
          } else {
            existingDom.style.width = `${element.width}px`;
          }
        }
        if (element.height && element.type === 'sticky') {
          existingDom.style.height = `${element.height}px`;
        }
        if (element.type === 'sticky') {
          this.applyStickyStyles(element);
        }
        return;
      }

      if (existingDom) existingDom.remove();
      if (element.type === 'sticky') this.mountStickyDOM(element);
      else if (element.type === 'sticker') this.mountStickerDOM(element);
      else if (element.type === 'polaroid') this.mountPolaroidDOM(element);
      else if (element.type === 'voice') this.mountVoiceDOM(element);
    }
  },

  removeElementFromDOM(elementId, bookId = null) {
    if (bookId && this.currentBookId && bookId !== this.currentBookId) {
      return;
    }
    this.elements = this.elements.filter((e) => e.id !== elementId);
    const domEl = document.getElementById(elementId);
    if (domEl) domEl.remove();
    this.redrawAll();
  },

  // ==================== 1. PLAIN TEXT & STYLED STICKY NOTES ====================
  async createStickyNote() {
    const id = 'sticky-' + Date.now();
    const element = {
      id,
      type: 'sticky',
      content: 'Write your sweet note here...',
      x: 80 + Math.random() * 200,
      y: 80 + Math.random() * 180,
      zIndex: 10,
      borderEnabled: false,
      outlineEnabled: false,
      fontFamily: "'Caveat', cursive",
      textColor: '#2b2326',
      bgColor: '#fff9c4',
      borderColor: '#fff176',
      outlineColor: '#ff4d6d',
      updatedAt: Date.now(),
    };

    this.elements.push(element);
    this.mountStickyDOM(element);
    window.SocketManager.emitElementUpsert(element, this.currentBookId);
    await API.syncScratchElement(element, this.currentBookId);
  },

  mountStickyDOM(element) {
    const overlay = document.getElementById('canvasElementsOverlay');
    if (!overlay) return;

    const existing = document.getElementById(element.id);
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = element.id;
    div.className = `sticky-note ${element.borderEnabled ? 'has-border' : 'plain-text'}`;
    div.style.left = `${element.x}px`;
    div.style.top = `${element.y}px`;
    div.style.zIndex = element.zIndex || 10;
    div.style.transform = `rotate(${element.rotation || 0}deg)`;

    div.innerHTML = `
      <div class="sticky-drag-bar drag-handle">
        <button type="button" class="btn-sticky-menu-trigger" title="Note Styling & Layer (Right-Click)">⋮</button>
      </div>
      <textarea class="plain-sticky-textarea" placeholder="Write your sweet note here...">${this.escapeHtml(element.content || '')}</textarea>
    `;

    // Right-click or ⋮ button opens styling context menu
    div.addEventListener('contextmenu', (e) => {
      this.openStickyContextMenu(e, element);
    });

    div.querySelector('.btn-sticky-menu-trigger').addEventListener('click', (e) => {
      this.openStickyContextMenu(e, element);
    });

    const textarea = div.querySelector('.plain-sticky-textarea');
    textarea.value = element.content || '';

    // Stop all clicks/touches inside the textarea from triggering card drag or canvas drawing
    ['mousedown', 'pointerdown', 'touchstart', 'click', 'dblclick'].forEach((evt) => {
      textarea.addEventListener(evt, (e) => e.stopPropagation());
    });

    let saveTimer;
    textarea.addEventListener('input', () => {
      element.content = textarea.value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        element.updatedAt = Date.now();
        window.SocketManager.emitElementUpsert(element, this.currentBookId);
        await API.syncScratchElement(element, this.currentBookId);
      }, 500);
    });

    textarea.addEventListener('blur', async () => {
      element.content = textarea.value;
      element.updatedAt = Date.now();
      window.SocketManager.emitElementUpsert(element, this.currentBookId);
      await API.syncScratchElement(element, this.currentBookId);
    });

    if (element.width) div.style.width = `${element.width}px`;
    if (element.height) div.style.height = `${element.height}px`;
    if (element.fontSize) textarea.style.fontSize = `${element.fontSize}px`;

    this.makeDraggable(div, element);
    this.makeResizable(div, element, 'sticky');
    this.makeRotatable(div, element);
    overlay.appendChild(div);

    // Apply styles (fonts, colors, outline, border)
    this.applyStickyStyles(element);
  },

  // ==================== 2. DIGITAL POLAROIDS ON CANVAS ====================
  async handlePolaroidUpload(file) {
    const formData = new FormData();
    formData.append('media', file);

    const btn = document.getElementById('toolAddPolaroid');
    if (btn) btn.innerText = 'Uploading...';

    try {
      const res = await API.uploadScratchMedia(formData);
      const id = 'polaroid-' + Date.now();

      const element = {
        id,
        type: 'polaroid',
        mediaUrl: res.mediaUrl,
        content: 'Our beautiful memory ❤️',
        x: 120 + Math.random() * 200,
        y: 80 + Math.random() * 150,
        zIndex: 12,
        rotation: -2,
        updatedAt: Date.now(),
      };

      this.elements = this.elements.filter((el) => el.id !== element.id);
      this.elements.push(element);
      this.mountPolaroidDOM(element);
      window.SocketManager.emitElementUpsert(element, this.currentBookId);
      await API.syncScratchElement(element, this.currentBookId);
    } catch (err) {
      HeartlyDialog.alert('Failed to add polaroid to canvas: ' + err.message, 'Polaroid');
    } finally {
      if (btn) btn.innerText = '📸 Polaroid';
    }
  },

  mountPolaroidDOM(element) {
    const overlay = document.getElementById('canvasElementsOverlay');
    if (!overlay) return;

    const existing = document.getElementById(element.id);
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = element.id;
    div.className = 'canvas-polaroid';
    div.style.left = `${element.x}px`;
    div.style.top = `${element.y}px`;
    div.style.zIndex = element.zIndex || 12;
    div.style.transform = `rotate(${element.rotation !== undefined ? element.rotation : -2}deg)`;

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;" class="polaroid-header">
        <span style="font-size:10px; color:#aaa;">📸 Polaroid</span>
        <button style="background:none; border:none; cursor:pointer; color:#999; font-size:16px; font-weight:700;" class="btn-del">&times;</button>
      </div>
      <div class="polaroid-img-frame">
        <img src="${element.mediaUrl}" class="polaroid-img" alt="Polaroid Memory">
      </div>
      <input type="text" class="polaroid-caption-input" placeholder="Our memory ❤️" value="${this.escapeHtml(element.content || '')}">
    `;

    // Right-click opens context menu for layer arrangement, rotation and deletion
    div.addEventListener('contextmenu', (e) => {
      this.openStickyContextMenu(e, element);
    });

    div.querySelector('.btn-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      div.remove();
      this.elements = this.elements.filter((el) => el.id !== element.id);
      window.SocketManager.emitElementDelete(element.id, this.currentBookId);
      await API.deleteScratchElement(element.id, this.currentBookId);
    });

    const captionInput = div.querySelector('.polaroid-caption-input');
    captionInput.value = element.content || '';

    ['mousedown', 'pointerdown', 'touchstart', 'click', 'dblclick'].forEach((evt) => {
      captionInput.addEventListener(evt, (e) => e.stopPropagation());
    });

    let capTimer;
    captionInput.addEventListener('input', () => {
      element.content = captionInput.value;
      clearTimeout(capTimer);
      capTimer = setTimeout(async () => {
        element.updatedAt = Date.now();
        window.SocketManager.emitElementUpsert(element, this.currentBookId);
        await API.syncScratchElement(element, this.currentBookId);
      }, 500);
    });

    captionInput.addEventListener('blur', async () => {
      element.content = captionInput.value;
      element.updatedAt = Date.now();
      window.SocketManager.emitElementUpsert(element, this.currentBookId);
      await API.syncScratchElement(element, this.currentBookId);
    });

    if (element.width) {
      div.style.width = `${element.width}px`;
      captionInput.style.fontSize = `${Math.max(11, Math.min(32, Math.round(13 * (element.width / 230))))}px`;
    }

    const polHandle = div.querySelector('.polaroid-header');
    this.makeDraggable(div, element, polHandle);
    this.makeResizable(div, element, 'polaroid');
    this.makeRotatable(div, element);
    overlay.appendChild(div);
  },

  // ==================== 3. RECORDABLE VOICE NOTES ON CANVAS ====================
  async toggleVoiceRecording() {
    if (this.isVoiceTransitioning) return;
    this.isVoiceTransitioning = true;
    setTimeout(() => {
      this.isVoiceTransitioning = false;
    }, 600);

    const btn = document.getElementById('toolRecordVoice');

    if (this.isRecordingVoice) {
      this.isRecordingVoice = false;
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      if (btn) {
        btn.innerHTML = '🎙️ Voice Clip';
        btn.style.color = '';
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        await this.handleVoiceUpload(audioBlob);
      };

      this.mediaRecorder.start();
      this.isRecordingVoice = true;
      if (btn) {
        btn.innerHTML = '<span class="recording-pulse"></span> Stop Recording';
        btn.style.color = '#ff4757';
      }
    } catch (err) {
      this.isRecordingVoice = false;
      HeartlyDialog.alert('Microphone access needed to record voice note: ' + err.message, 'Voice Note');
    }
  },

  async handleVoiceUpload(audioBlob) {
    const formData = new FormData();
    formData.append('media', audioBlob, `voice_${Date.now()}.webm`);

    try {
      const res = await API.uploadScratchMedia(formData);
      const id = 'voice-' + Date.now();
      const authorName = window.App?.currentUser?.name || 'Partner';

      const element = {
        id,
        type: 'voice',
        audioUrl: res.mediaUrl,
        authorName,
        content: `Voice note from ${authorName} ❤️`,
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 150,
        zIndex: 14,
        updatedAt: Date.now(),
      };

      this.elements.push(element);
      this.mountVoiceDOM(element);
      window.SocketManager.emitElementUpsert(element, this.currentBookId);
      await API.syncScratchElement(element, this.currentBookId);
    } catch (err) {
      HeartlyDialog.alert('Failed to upload voice note: ' + err.message, 'Voice Note');
    }
  },

  mountVoiceDOM(element) {
    const overlay = document.getElementById('canvasElementsOverlay');
    if (!overlay) return;

    const existing = document.getElementById(element.id);
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = element.id;
    div.className = 'canvas-voice-note';
    div.style.left = `${element.x}px`;
    div.style.top = `${element.y}px`;
    div.style.zIndex = element.zIndex || 14;
    div.style.transform = `rotate(${element.rotation || 0}deg)`;

    div.innerHTML = `
      <button class="voice-play-btn" title="Play / Pause Voice Note">▶</button>
      <div class="voice-meta">
        <div class="voice-title">🎙️ ${element.authorName || 'Partner'}'s Voice</div>
        <div class="voice-duration">Tap to listen ❤️</div>
      </div>
      <button style="background:none; border:none; cursor:pointer; color:#aaa; font-size:16px; font-weight:700;" class="btn-del">&times;</button>
      <audio src="${element.audioUrl}" preload="auto" style="display:none;"></audio>
    `;

    // Right-click opens context menu for layer arrangement, rotation and deletion
    div.addEventListener('contextmenu', (e) => {
      this.openStickyContextMenu(e, element);
    });

    const audio = div.querySelector('audio');
    const playBtn = div.querySelector('.voice-play-btn');

    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (audio.paused) {
        audio.play();
        playBtn.innerText = '⏸';
      } else {
        audio.pause();
        playBtn.innerText = '▶';
      }
    });

    audio.addEventListener('ended', () => {
      playBtn.innerText = '▶';
    });

    div.querySelector('.btn-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      div.remove();
      this.elements = this.elements.filter((el) => el.id !== element.id);
      window.SocketManager.emitElementDelete(element.id, this.currentBookId);
      await API.deleteScratchElement(element.id, this.currentBookId);
    });

    if (element.width) div.style.width = `${element.width}px`;

    this.makeDraggable(div, element);
    this.makeResizable(div, element, 'voice');
    this.makeRotatable(div, element);
    overlay.appendChild(div);
  },

  // ==================== 4. STICKERS ====================
  async createSticker(emoji) {
    const id = 'sticker-' + Date.now();
    const element = {
      id,
      type: 'sticker',
      content: emoji,
      x: 100 + Math.random() * 250,
      y: 100 + Math.random() * 200,
      zIndex: 8,
      updatedAt: Date.now(),
    };

    this.elements = this.elements.filter((el) => el.id !== element.id);
    this.elements.push(element);
    this.mountStickerDOM(element);
    window.SocketManager.emitElementUpsert(element, this.currentBookId);
    await API.syncScratchElement(element, this.currentBookId);
  },

  mountStickerDOM(element) {
    const overlay = document.getElementById('canvasElementsOverlay');
    if (!overlay) return;

    const existing = document.getElementById(element.id);
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = element.id;
    div.className = 'canvas-sticker';
    div.style.left = `${element.x}px`;
    div.style.top = `${element.y}px`;
    div.style.zIndex = element.zIndex || 8;
    div.style.transform = `rotate(${element.rotation || 0}deg)`;
    if (element.width) {
      div.style.fontSize = `${element.width}px`;
    }
    div.innerHTML = `<span class="sticker-emoji-char">${this.escapeHtml(element.content || '❤️')}</span>`;

    // Right-click opens context menu for layer arrangement, rotation and deletion
    div.addEventListener('contextmenu', (e) => {
      this.openStickyContextMenu(e, element);
    });

    div.addEventListener('dblclick', async () => {
      div.remove();
      this.elements = this.elements.filter((el) => el.id !== element.id);
      window.SocketManager.emitElementDelete(element.id, this.currentBookId);
      await API.deleteScratchElement(element.id, this.currentBookId);
    });

    this.makeDraggable(div, element);
    this.makeResizable(div, element, 'sticker');
    this.makeRotatable(div, element);
    overlay.appendChild(div);
  },

  // ==================== UNIVERSAL DRAGGABLE HELPER WITH DRAG-TO-DELETE ====================
  makeDraggable(domEl, element, handleEl = null) {
    const dragTarget = handleEl || domEl;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
    let isDragging = false;

    const deleteZone = document.getElementById('canvasDeleteZone');

    const onMouseDown = (e) => {
      // Never initiate drag if clicking an input, textarea, button, trigger or resize handle
      if (
        ['TEXTAREA', 'INPUT', 'BUTTON'].includes(e.target.tagName) ||
        e.target.isContentEditable ||
        e.target.classList.contains('btn-sticky-menu-trigger') ||
        e.target.classList.contains('element-resize-handle')
      ) {
        return;
      }

      startX = e.clientX || (e.touches && e.touches[0].clientX);
      startY = e.clientY || (e.touches && e.touches[0].clientY);
      initialLeft = parseFloat(domEl.style.left) || 0;
      initialTop = parseFloat(domEl.style.top) || 0;
      isDragging = true;

      // Reveal bottom-right delete zone
      if (deleteZone) {
        deleteZone.classList.add('visible');
      }

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        const clientX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
        const clientY = moveEvent.clientY || (moveEvent.touches && moveEvent.touches[0].clientY);
        if (clientX === undefined) return;

        const deltaX = clientX - startX;
        const deltaY = clientY - startY;

        element.x = Math.max(0, initialLeft + deltaX);
        element.y = Math.max(0, initialTop + deltaY);
        domEl.style.left = `${element.x}px`;
        domEl.style.top = `${element.y}px`;

        // Check if cursor or element is over the delete zone
        if (deleteZone) {
          const dzRect = deleteZone.getBoundingClientRect();
          const isOver = clientX >= dzRect.left && clientX <= dzRect.right && clientY >= dzRect.top && clientY <= dzRect.bottom;
          if (isOver) {
            deleteZone.classList.add('drag-over');
          } else {
            deleteZone.classList.remove('drag-over');
          }
        }
      };

      const onMouseUp = async (upEvent) => {
        isDragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('touchmove', onMouseMove);
        window.removeEventListener('touchend', onMouseUp);

        let droppedInDelete = false;
        if (deleteZone && deleteZone.classList.contains('drag-over')) {
          droppedInDelete = true;
        }

        // Hide delete zone
        if (deleteZone) {
          deleteZone.classList.remove('visible', 'drag-over');
        }

        if (droppedInDelete) {
          // Animate and delete element from canvas
          domEl.style.transition = 'transform 0.2s, opacity 0.2s';
          domEl.style.transform = 'scale(0)';
          domEl.style.opacity = '0';

          setTimeout(async () => {
            domEl.remove();
            ScratchbookManager.elements = ScratchbookManager.elements.filter((el) => el.id !== element.id);
            window.SocketManager.emitElementDelete(element.id, ScratchbookManager.currentBookId);
            await API.deleteScratchElement(element.id, ScratchbookManager.currentBookId);
          }, 200);
          return;
        }

        // Persist new position
        element.updatedAt = Date.now();
        ScratchbookManager.elements = ScratchbookManager.elements.filter((el) => el.id !== element.id);
        ScratchbookManager.elements.push(element);
        window.SocketManager.emitElementUpsert(element, ScratchbookManager.currentBookId);
        await API.syncScratchElement(element, ScratchbookManager.currentBookId);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onMouseMove, { passive: true });
      window.addEventListener('touchend', onMouseUp);
    };

    dragTarget.addEventListener('mousedown', onMouseDown);
    dragTarget.addEventListener('touchstart', onMouseDown, { passive: true });
  },

  // ==================== UNIVERSAL RESIZABLE HELPER FOR ALL ELEMENTS ====================
  makeResizable(domEl, element, type) {
    const handle = document.createElement('div');
    handle.className = 'element-resize-handle';
    handle.innerHTML = '↘';
    handle.title = 'Drag to resize';
    domEl.appendChild(handle);

    const onResizeStart = (e) => {
      e.stopPropagation();
      e.preventDefault();

      const startPointerX = e.clientX || (e.touches && e.touches[0].clientX);
      const startPointerY = e.clientY || (e.touches && e.touches[0].clientY);

      const rect = domEl.getBoundingClientRect();
      const startWidth = rect.width;
      const startHeight = rect.height;
      const startFontSize = parseFloat(window.getComputedStyle(domEl).fontSize) || 44;

      handle.classList.add('active-resizing');

      const onResizeMove = (moveEvt) => {
        const clientX = moveEvt.clientX || (moveEvt.touches && moveEvt.touches[0].clientX);
        const clientY = moveEvt.clientY || (moveEvt.touches && moveEvt.touches[0].clientY);
        if (clientX === undefined) return;

        const deltaX = clientX - startPointerX;
        const deltaY = clientY - startPointerY;

        if (type === 'sticky') {
          const newW = Math.max(140, Math.min(650, startWidth + deltaX));
          const newH = Math.max(90, Math.min(650, startHeight + deltaY));
          domEl.style.width = `${newW}px`;
          domEl.style.height = `${newH}px`;
          element.width = Math.round(newW);
          element.height = Math.round(newH);

          // Proportional font sizing: default 17px at 190px width
          const newFontSize = Math.max(12, Math.min(54, Math.round(17 * (newW / 190))));
          const textarea = domEl.querySelector('.plain-sticky-textarea');
          if (textarea) {
            textarea.style.fontSize = `${newFontSize}px`;
          }
          element.fontSize = newFontSize;
        } else if (type === 'polaroid') {
          const newW = Math.max(160, Math.min(650, startWidth + deltaX));
          domEl.style.width = `${newW}px`;
          element.width = Math.round(newW);
        } else if (type === 'sticker') {
          const newSize = Math.max(24, Math.min(200, startFontSize + deltaX));
          domEl.style.fontSize = `${newSize}px`;
          element.width = Math.round(newSize);
          element.height = Math.round(newSize);
        } else if (type === 'voice') {
          const newW = Math.max(200, Math.min(500, startWidth + deltaX));
          domEl.style.width = `${newW}px`;
          element.width = Math.round(newW);
        }
      };

      const onResizeEnd = async () => {
        handle.classList.remove('active-resizing');
        window.removeEventListener('mousemove', onResizeMove);
        window.removeEventListener('mouseup', onResizeEnd);
        window.removeEventListener('touchmove', onResizeMove);
        window.removeEventListener('touchend', onResizeEnd);

        this.syncElementChange(element);
      };

      window.addEventListener('mousemove', onResizeMove);
      window.addEventListener('mouseup', onResizeEnd);
      window.addEventListener('touchmove', onResizeMove, { passive: false });
      window.addEventListener('touchend', onResizeEnd);
    };

    handle.addEventListener('mousedown', onResizeStart);
    handle.addEventListener('touchstart', onResizeStart, { passive: false });
  },
};

window.ScratchbookManager = ScratchbookManager;
