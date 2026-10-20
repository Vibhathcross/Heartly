const ChatManager = {
  messages: [],
  typingTimeout: null,
  activeReactionBar: null,
  longPressTimeout: null,
  initialized: false,
  selectedImageFile: null,
  activeEmojiCategory: 'love',

  // Shared Wallpaper State
  currentWallpaper: { type: 'none', value: '', opacity: 40 },
  wallpaperActiveLayer: 'A',
  selectedWallpaperPreset: { type: 'none', value: '' },
  selectedWallpaperFile: null,
  chatBgSettings: { zoom: 100, panX: 50, panY: 50 },

  // Pinned Whispers Drawer State
  pinnedDrawerOpen: false,

  // Magic Words & Love Triggers State
  magicWords: [],
  lastBurstKey: null,
  lastBurstTime: 0,

  // Audio Recording State
  mediaRecorder: null,
  audioChunks: [],
  recordTimerInterval: null,
  recordSeconds: 0,
  isRecordingAudio: false,

  // Current Playing Audio
  currentAudio: null,
  currentPlayingMsgId: null,

  // Delete message modal target
  pendingDeleteMsgId: null,

  // WhatsApp-style Reply Target
  replyTargetMessage: null,

  QUICK_REACTIONS: ['❤️', '👍', '😂', '😮', '😢', '🙏'],
  MORE_REACTIONS: ['🥰', '😘', '🔥', '🎉', '🥺', '🌹', '💖', '💯', '✨', '👀', '😍', '👏'],

  EMOJI_CATEGORIES: {
    love: [
      '❤️', '💖', '💕', '💞', '💓', '💗', '💘', '💝', '💟', '💌',
      '💋', '💍', '🌹', '💐', '🌸', '✨', '⭐', '💫', '🔥', '🥰',
      '😍', '😘', '😚', '😻', '🫂', '👰', '🤵', '💐', '❤️‍🔥', '💝'
    ],
    smileys: [
      '😊', '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂',
      '😉', '😌', '😇', '😋', '😜', '🤪', '🤭', '🤫', '🤔', '🥺',
      '🥹', '😭', '😢', '🤤', '😴', '😎', '🥳', '🤩', '😳', '🥵'
    ],
    gestures: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '👇', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '👏',
      '🙌', '👐', '🤲', '💪'
    ],
    fun: [
      '🎉', '🎊', '🎈', '🎁', '🎂', '🍰', '🧁', '🥂', '🍾', '🍻',
      '🍷', '🍸', '☕', '🍫', '🍓', '🍭', '🍩', '🍿', '🍕', '🏖️',
      '✈️', '🎵', '🎶', '💯', '🌈', '☀️', '🌙', '🌟'
    ],
  },

  getCurrentUserId() {
    if (window.App?.currentUser?.id) return String(window.App.currentUser.id);
    if (window.App?.currentUser?._id) return String(window.App.currentUser._id);
    const token = window.API?.getToken?.();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.userId ? String(payload.userId) : null;
      } catch (e) {}
    }
    return null;
  },

  getCurrentUserName() {
    if (window.App?.currentUser?.name) return window.App.currentUser.name;
    const token = window.API?.getToken?.();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.name || 'You';
      } catch (e) {}
    }
    return 'You';
  },

  async init() {
    this.setupEvents();
    this.initChatBgAdjuster();
    await this.loadMessages();
    await this.loadWallpaper();
    await this.loadMagicWords();
    this.updatePinnedCount();
    this.markChatAsRead();
    this.startLiveSync();
  },

  setupEvents() {
    if (this.initialized) return;
    this.initialized = true;

    const form = document.getElementById('chatForm');
    const input = document.getElementById('chatInput');
    const container = document.getElementById('chatMessages');

    // 1. Submit Form (Text or Image or Both)
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      const hasImage = !!this.selectedImageFile;
      if (!text && !hasImage) return;

      const sendBtn = document.getElementById('btnSendChat');
      if (sendBtn) sendBtn.disabled = true;

      window.SocketManager.sendChatTyping(false);
      const replyPayload = this.getReplyPayload();

      try {
        let msg;
        if (hasImage) {
          const formData = new FormData();
          formData.append('image', this.selectedImageFile);
          if (text) formData.append('caption', text);
          if (replyPayload) formData.append('replyTo', JSON.stringify(replyPayload));

          const res = await API.sendChatImage(formData);
          msg = res.message;
          this.clearAttachedImage();
        } else {
          const res = await API.sendChatMessage(text, replyPayload);
          msg = res.message;
        }

        this.clearReply();
        input.value = '';
        this.appendMessage(msg);
        window.SocketManager.sendChatMessage(msg);
        this.closeEmojiDrawer();
        input.focus();

        if (text) {
          this.checkAndTriggerMagicWords(text, 'You', true);
        }
      } catch (err) {
        console.error('Failed to send message:', err);
        alert('Failed to send message: ' + (err.message || 'Network error'));
      } finally {
        if (sendBtn) sendBtn.disabled = false;
      }
    });

    // 1.1 Cancel Reply Bar button
    document.getElementById('btnCancelChatReply')?.addEventListener('click', () => {
      this.clearReply();
    });

    // 2. Typing indicator
    input?.addEventListener('input', () => {
      window.SocketManager.sendChatTyping(true);
      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        window.SocketManager.sendChatTyping(false);
      }, 1500);
    });

    // 3. Image Attachment Handling
    const attachBtn = document.getElementById('btnChatAttachImage');
    const imageInput = document.getElementById('chatImageInput');
    const cancelImgBtn = document.getElementById('btnCancelChatImage');

    attachBtn?.addEventListener('click', () => {
      imageInput?.click();
    });

    imageInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        alert('Please choose an image file (PNG, JPG, WEBP, GIF)');
        imageInput.value = '';
        return;
      }

      this.selectedImageFile = file;
      const previewTray = document.getElementById('chatImagePreviewTray');
      const thumb = document.getElementById('chatPreviewThumb');
      const name = document.getElementById('chatPreviewFileName');

      if (thumb) thumb.src = URL.createObjectURL(file);
      if (name) name.innerText = file.name;
      if (previewTray) previewTray.style.display = 'flex';

      input.placeholder = 'Add a sweet caption...';
      input.focus();
    });

    cancelImgBtn?.addEventListener('click', () => {
      this.clearAttachedImage();
    });

    // 4. Voice Whisper Audio Recording
    const recordBtn = document.getElementById('btnChatRecordAudio');
    const cancelRecordBtn = document.getElementById('btnCancelAudioRecord');
    const sendRecordBtn = document.getElementById('btnSendAudioRecord');

    recordBtn?.addEventListener('click', () => {
      if (this.isRecordingAudio) {
        this.stopAndSendAudioRecording();
      } else {
        this.startAudioRecording();
      }
    });

    cancelRecordBtn?.addEventListener('click', () => {
      this.cancelAudioRecording();
    });

    sendRecordBtn?.addEventListener('click', () => {
      this.stopAndSendAudioRecording();
    });

    // 5. WhatsApp-Style Emoji Picker Drawer
    const emojiPickerBtn = document.getElementById('btnChatEmojiPicker');
    const emojiDrawer = document.getElementById('chatEmojiDrawer');
    const closeEmojiBtn = document.getElementById('btnCloseEmojiDrawer');

    emojiPickerBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = emojiDrawer?.style.display === 'none';
      if (isHidden) {
        this.openEmojiDrawer();
      } else {
        this.closeEmojiDrawer();
      }
    });

    closeEmojiBtn?.addEventListener('click', () => {
      this.closeEmojiDrawer();
    });

    emojiDrawer?.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.emoji-tab-btn');
      if (tabBtn) {
        const cat = tabBtn.getAttribute('data-cat');
        if (cat) {
          emojiDrawer.querySelectorAll('.emoji-tab-btn').forEach((b) => b.classList.remove('active'));
          tabBtn.classList.add('active');
          this.activeEmojiCategory = cat;
          this.renderEmojiGrid(cat);
        }
        return;
      }

      const item = e.target.closest('.emoji-drawer-item');
      if (item) {
        const emoji = item.getAttribute('data-emoji');
        if (emoji && input) {
          const start = input.selectionStart || input.value.length;
          const end = input.selectionEnd || input.value.length;
          const val = input.value;
          input.value = val.substring(0, start) + emoji + val.substring(end);
          input.selectionStart = input.selectionEnd = start + emoji.length;
          input.focus();
          window.SocketManager.sendChatTyping(true);
        }
      }
    });

    // 6. Right Click on Message Bubble -> WhatsApp Emoji Reaction & Delete Bar
    container?.addEventListener('contextmenu', (e) => {
      const bubble = e.target.closest('.chat-bubble');
      if (!bubble) return;

      e.preventDefault();
      const msgId = bubble.getAttribute('data-msg-id');
      if (msgId) {
        this.showReactionBar(bubble, msgId, e.clientX, e.clientY);
      }
    });

    // 7. Click handlers inside messages container (Audio play, Image lightbox & reactions)
    container?.addEventListener('click', (e) => {
      // Audio play/pause button
      const audioBtn = e.target.closest('.chat-audio-play-btn');
      if (audioBtn) {
        e.stopPropagation();
        const player = audioBtn.closest('.chat-audio-player');
        const bubble = audioBtn.closest('.chat-bubble');
        const msgId = bubble?.getAttribute('data-msg-id');
        const url = player?.getAttribute('data-audio-url');
        if (url && msgId) {
          this.toggleAudioPlayback(msgId, url, player);
        }
        return;
      }

      // Lightbox view for image
      const imgWrap = e.target.closest('.chat-bubble-image-wrap');
      if (imgWrap) {
        const url = imgWrap.getAttribute('data-img-url');
        const imgEl = imgWrap.querySelector('img');
        if (url) {
          this.openImageLightbox(url, imgEl);
        }
        return;
      }

      // Quick Reply button on desktop hover pill
      const quickReplyBtn = e.target.closest('.btn-quick-reply');
      if (quickReplyBtn) {
        e.stopPropagation();
        const bubble = quickReplyBtn.closest('.chat-bubble');
        const msgId = bubble?.getAttribute('data-msg-id');
        const msg = this.messages.find((m) => String(m._id) === String(msgId));
        if (msg) this.setReplyTarget(msg);
        return;
      }

      // Quick Heart reaction on desktop hover pill
      const quickHeartBtn = e.target.closest('.btn-quick-heart');
      if (quickHeartBtn) {
        e.stopPropagation();
        const bubble = quickHeartBtn.closest('.chat-bubble');
        const msgId = bubble?.getAttribute('data-msg-id');
        if (msgId) this.submitReaction(msgId, '❤️');
        return;
      }

      // Quick Pin / Unpin button on desktop hover pill
      const quickPinBtn = e.target.closest('.btn-quick-pin');
      if (quickPinBtn) {
        e.stopPropagation();
        const bubble = quickPinBtn.closest('.chat-bubble');
        const msgId = bubble?.getAttribute('data-msg-id');
        if (msgId) this.togglePinMessage(msgId);
        return;
      }

      // Quick More options button on desktop hover pill
      const quickMoreBtn = e.target.closest('.btn-quick-more');
      if (quickMoreBtn) {
        e.stopPropagation();
        const bubble = quickMoreBtn.closest('.chat-bubble');
        const msgId = bubble?.getAttribute('data-msg-id');
        if (bubble && msgId) this.showReactionBar(bubble, msgId);
        return;
      }

      // Reaction badge click -> toggle own reaction or open reaction bar
      const badge = e.target.closest('.chat-reactions-badge');
      if (badge) {
        e.stopPropagation();
        const msgId = badge.getAttribute('data-msg-id');
        const bubble = badge.closest('.chat-bubble');
        if (msgId && bubble) {
          const currentUserId = this.getCurrentUserId();
          const msg = this.messages.find((m) => String(m._id) === String(msgId));
          const myReaction = msg?.reactions?.find(
            (r) => String(r.userId) === currentUserId
          );

          if (myReaction) {
            this.submitReaction(msgId, myReaction.emoji);
          } else {
            this.showReactionBar(bubble, msgId);
          }
        }
        return;
      }

      // Click on Quoted Message preview inside bubble -> scroll to quoted message and flash
      const quoteCard = e.target.closest('.chat-reply-quote');
      if (quoteCard) {
        e.stopPropagation();
        const targetReplyId = quoteCard.getAttribute('data-target-reply-id');
        if (targetReplyId) {
          this.scrollToQuotedMessage(targetReplyId);
        }
        return;
      }

      // Close reaction bar if clicking elsewhere
      this.closeReactionBar();
    });

    // 7.1 Double click on bubble -> WhatsApp style fast reply
    container?.addEventListener('dblclick', (e) => {
      const bubble = e.target.closest('.chat-bubble');
      if (!bubble) return;
      const msgId = bubble.getAttribute('data-msg-id');
      const msg = this.messages.find((m) => String(m._id) === String(msgId));
      if (msg && !msg.isDeleted) {
        this.setReplyTarget(msg);
      }
    });

    // 8. Delete message modal actions
    const btnDelEveryone = document.getElementById('btnDeleteForEveryone');
    const btnDelMe = document.getElementById('btnDeleteForMe');
    const btnCancelDel = document.getElementById('btnCancelDeleteModal');

    btnDelEveryone?.addEventListener('click', () => this.confirmDeleteMessage('everyone'));
    btnDelMe?.addEventListener('click', () => this.confirmDeleteMessage('me'));
    btnCancelDel?.addEventListener('click', () => this.closeDeleteModal());

    // 9. Mobile Long Press Support (480ms touchhold)
    let touchStartX = 0;
    let touchStartY = 0;

    container?.addEventListener(
      'touchstart',
      (e) => {
        const bubble = e.target.closest('.chat-bubble');
        if (!bubble || e.touches.length > 1) return;

        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;

        clearTimeout(this.longPressTimeout);
        this.longPressTimeout = setTimeout(() => {
          const msgId = bubble.getAttribute('data-msg-id');
          if (msgId) {
            this.showReactionBar(bubble, msgId, touchStartX, touchStartY);
          }
        }, 480);
      },
      { passive: true }
    );

    container?.addEventListener('touchmove', (e) => {
      if (!this.longPressTimeout) return;
      const touch = e.touches[0];
      if (
        Math.abs(touch.clientX - touchStartX) > 10 ||
        Math.abs(touch.clientY - touchStartY) > 10
      ) {
        clearTimeout(this.longPressTimeout);
        this.longPressTimeout = null;
      }
    });

    container?.addEventListener('touchend', () => {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    });

    // Global dismissal listeners
    container?.addEventListener('scroll', () => this.closeReactionBar(), { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeReactionBar();
        this.closeEmojiDrawer();
        this.closeDeleteModal();
        this.closeWallpaperModal();
        this.closeMagicWordsModal();
        this.closePinnedDrawer();
        const modal = document.getElementById('lightboxModal');
        if (modal?.classList.contains('active')) {
          modal.classList.remove('active', 'chat-photo-mode');
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.chat-reaction-bar') && !e.target.closest('.chat-bubble')) {
        this.closeReactionBar();
      }
      if (
        !e.target.closest('#chatEmojiDrawer') &&
        !e.target.closest('#btnChatEmojiPicker')
      ) {
        this.closeEmojiDrawer();
      }
      if (e.target.id === 'chatDeleteModal') {
        this.closeDeleteModal();
      }
      if (e.target.id === 'chatWallpaperModal') {
        this.closeWallpaperModal();
      }
      if (e.target.id === 'chatMagicWordsModal') {
        this.closeMagicWordsModal();
      }
      if (
        this.pinnedDrawerOpen &&
        !e.target.closest('#chatPinnedDrawer') &&
        !e.target.closest('#btnTogglePinnedMessages')
      ) {
        this.closePinnedDrawer();
      }
    });

    // Pinned Drawer Toggle & Close
    document.getElementById('btnTogglePinnedMessages')?.addEventListener('click', () => {
      this.togglePinnedDrawer();
    });
    document.getElementById('btnClosePinnedDrawer')?.addEventListener('click', () => {
      this.closePinnedDrawer();
    });

    // Pinned List Item Click & Unpin
    const pinnedList = document.getElementById('chatPinnedList');
    pinnedList?.addEventListener('click', (e) => {
      const unpinBtn = e.target.closest('.btn-unpin-item');
      if (unpinBtn) {
        e.stopPropagation();
        const msgId = unpinBtn.getAttribute('data-msg-id');
        if (msgId) this.togglePinMessage(msgId);
        return;
      }
      const item = e.target.closest('.chat-pinned-item');
      if (item) {
        const msgId = item.getAttribute('data-msg-id');
        if (msgId) this.jumpToMessage(msgId);
      }
    });

    // Wallpaper Modal Open & Close
    document.getElementById('btnOpenWallpaperModal')?.addEventListener('click', () => {
      this.openWallpaperModal();
    });
    document.getElementById('btnCloseWallpaperModal')?.addEventListener('click', () => {
      this.closeWallpaperModal();
    });
    // Chat Background View & Zoom Adjuster
    const btnAdjustChatBg = document.getElementById('btnAdjustChatBg');
    const chatBgAdjustPanel = document.getElementById('chatBgAdjustPanel');
    const btnCloseAdjustBg = document.getElementById('btnCloseAdjustBg');
    const chatBgZoomSlider = document.getElementById('chatBgZoomSlider');
    const chatBgPanXSlider = document.getElementById('chatBgPanXSlider');
    const chatBgPanYSlider = document.getElementById('chatBgPanYSlider');
    const btnResetChatBg = document.getElementById('btnResetChatBg');
    const btnSaveChatBg = document.getElementById('btnSaveChatBg');

    btnAdjustChatBg?.addEventListener('click', () => {
      if (!chatBgAdjustPanel) return;
      const isVisible = chatBgAdjustPanel.style.display === 'block';
      chatBgAdjustPanel.style.display = isVisible ? 'none' : 'block';
    });

    btnCloseAdjustBg?.addEventListener('click', () => {
      if (chatBgAdjustPanel) chatBgAdjustPanel.style.display = 'none';
    });

    chatBgZoomSlider?.addEventListener('input', (e) => {
      this.chatBgSettings.zoom = parseInt(e.target.value, 10);
      this.applyChatBgView();
    });

    chatBgPanXSlider?.addEventListener('input', (e) => {
      this.chatBgSettings.panX = parseInt(e.target.value, 10);
      this.applyChatBgView();
    });

    chatBgPanYSlider?.addEventListener('input', (e) => {
      this.chatBgSettings.panY = parseInt(e.target.value, 10);
      this.applyChatBgView();
    });

    btnResetChatBg?.addEventListener('click', () => {
      this.resetChatBgView();
    });

    btnSaveChatBg?.addEventListener('click', () => {
      this.saveChatBgView();
    });

    // Wallpaper Presets Grid Click
    const presetsGrid = document.getElementById('wallpaperPresetsGrid');
    presetsGrid?.addEventListener('click', (e) => {
      const card = e.target.closest('.wallpaper-preset-card');
      if (!card) return;
      presetsGrid.querySelectorAll('.wallpaper-preset-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');

      const type = card.getAttribute('data-type') || 'none';
      const value = card.getAttribute('data-value') || '';
      this.selectedWallpaperPreset = { type, value };
      this.selectedWallpaperFile = null;

      // Hide custom preview
      const previewWrap = document.getElementById('wallpaperCustomPreviewWrap');
      const uploadPrompt = document.getElementById('wallpaperUploadPrompt');
      const fileInput = document.getElementById('wallpaperFileInput');
      if (fileInput) fileInput.value = '';
      if (previewWrap) previewWrap.style.display = 'none';
      if (uploadPrompt) uploadPrompt.style.display = 'flex';
    });

    // Custom Wallpaper Upload File Input
    const fileInput = document.getElementById('wallpaperFileInput');
    const btnBrowse = document.getElementById('btnBrowseWallpaperFile');
    btnBrowse?.addEventListener('click', () => fileInput?.click());
    document.getElementById('wallpaperUploadDropZone')?.addEventListener('click', (e) => {
      if (!e.target.closest('#btnRemoveCustomWallpaper') && !e.target.closest('#wallpaperCustomPreviewWrap')) {
        fileInput?.click();
      }
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      this.selectedWallpaperFile = file;
      this.selectedWallpaperPreset = { type: 'custom', value: '' };

      presetsGrid?.querySelectorAll('.wallpaper-preset-card').forEach((c) => c.classList.remove('active'));

      const reader = new FileReader();
      reader.onload = (ev) => {
        const previewImg = document.getElementById('wallpaperCustomPreviewImg');
        const previewWrap = document.getElementById('wallpaperCustomPreviewWrap');
        const uploadPrompt = document.getElementById('wallpaperUploadPrompt');
        if (previewImg) previewImg.src = ev.target.result;
        if (previewWrap) previewWrap.style.display = 'block';
        if (uploadPrompt) uploadPrompt.style.display = 'none';
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btnRemoveCustomWallpaper')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectedWallpaperFile = null;
      this.selectedWallpaperPreset = { type: 'none', value: '' };
      if (fileInput) fileInput.value = '';
      const previewWrap = document.getElementById('wallpaperCustomPreviewWrap');
      const uploadPrompt = document.getElementById('wallpaperUploadPrompt');
      if (previewWrap) previewWrap.style.display = 'none';
      if (uploadPrompt) uploadPrompt.style.display = 'flex';
      const defaultCard = presetsGrid?.querySelector('[data-type="none"]');
      if (defaultCard) defaultCard.classList.add('active');
    });

    // Opacity Slider Live Update
    const opacitySlider = document.getElementById('wallpaperOpacitySlider');
    const opacityVal = document.getElementById('wallpaperOpacityVal');
    opacitySlider?.addEventListener('input', () => {
      if (opacityVal) opacityVal.innerText = `${opacitySlider.value}%`;
    });

    // Apply Wallpaper for Both
    document.getElementById('btnSaveWallpaper')?.addEventListener('click', async () => {
      await this.saveWallpaper();
    });

    // Magic Words Modal Open & Close
    document.getElementById('btnOpenMagicWordsModal')?.addEventListener('click', () => {
      this.openMagicWordsModal();
    });
    document.getElementById('btnCloseMagicWordsModal')?.addEventListener('click', () => {
      this.closeMagicWordsModal();
    });

    // Magic Effect Option Pills Selection
    const effectOptions = document.getElementById('magicEffectOptions');
    effectOptions?.addEventListener('click', (e) => {
      const pill = e.target.closest('.magic-effect-pill');
      if (!pill) return;
      effectOptions.querySelectorAll('.magic-effect-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      const radio = pill.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });

    // Add Magic Word Form Submit
    document.getElementById('formAddMagicWord')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveNewMagicWord();
    });

    // Preview Magic Effect
    document.getElementById('btnPreviewMagicEffect')?.addEventListener('click', () => {
      const activeRadio = document.querySelector('input[name="magicEffect"]:checked');
      const effect = activeRadio ? activeRadio.value : 'hearts';
      const input = document.getElementById('inputMagicPhrase');
      const phrase = input?.value.trim() || 'Our Love';
      this.triggerParticleBurst(effect, phrase, 'Preview');
    });

    // Delete Magic Word from List
    document.getElementById('magicWordsList')?.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('.btn-delete-magic-word');
      if (!delBtn) return;
      e.stopPropagation();
      const id = delBtn.getAttribute('data-id');
      if (id) await this.deleteMagicWord(id);
    });

    // Window focus / tab click triggers mark as read
    window.addEventListener('focus', () => this.markChatAsRead());
    document.getElementById('tabChat')?.addEventListener('click', () => {
      setTimeout(() => this.markChatAsRead(), 300);
    });
  },

  // ===================== AUDIO RECORDING & PLAYBACK =====================
  async startAudioRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.start();
      this.isRecordingAudio = true;
      this.recordSeconds = 0;

      // Update UI
      const recordBar = document.getElementById('chatAudioRecordBar');
      const timerLabel = document.getElementById('chatRecordTimer');
      const recordBtn = document.getElementById('btnChatRecordAudio');
      if (recordBar) recordBar.style.display = 'flex';
      if (timerLabel) timerLabel.innerText = '0:00';
      if (recordBtn) recordBtn.classList.add('active');

      clearInterval(this.recordTimerInterval);
      this.recordTimerInterval = setInterval(() => {
        this.recordSeconds++;
        if (timerLabel) {
          timerLabel.innerText = this.formatDuration(this.recordSeconds);
        }
      }, 1000);
    } catch (err) {
      console.error('Audio recording failed to start:', err);
      alert('Could not access microphone: ' + (err.message || 'Permission denied'));
    }
  },

  cancelAudioRecording() {
    if (!this.isRecordingAudio) return;
    this.isRecordingAudio = false;
    clearInterval(this.recordTimerInterval);

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }

    this.audioChunks = [];
    const recordBar = document.getElementById('chatAudioRecordBar');
    const recordBtn = document.getElementById('btnChatRecordAudio');
    if (recordBar) recordBar.style.display = 'none';
    if (recordBtn) recordBtn.classList.remove('active');
  },

  async stopAndSendAudioRecording() {
    if (!this.isRecordingAudio || !this.mediaRecorder) return;
    this.isRecordingAudio = false;
    clearInterval(this.recordTimerInterval);

    const recordBar = document.getElementById('chatAudioRecordBar');
    const recordBtn = document.getElementById('btnChatRecordAudio');
    if (recordBar) recordBar.style.display = 'none';
    if (recordBtn) recordBtn.classList.remove('active');

    const duration = this.recordSeconds;

    this.mediaRecorder.onstop = async () => {
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.audioChunks = [];

      if (audioBlob.size < 500) return;

      const replyPayload = this.getReplyPayload();
      const formData = new FormData();
      formData.append('audio', audioBlob, 'voice_whisper.webm');
      formData.append('duration', duration.toString());
      if (replyPayload) formData.append('replyTo', JSON.stringify(replyPayload));

      try {
        const res = await API.sendChatAudio(formData);
        if (res && res.message) {
          this.clearReply();
          this.appendMessage(res.message);
          window.SocketManager.sendChatMessage(res.message);
        }
      } catch (err) {
        console.error('Failed to upload voice whisper:', err);
        alert('Failed to send voice whisper: ' + err.message);
      }
    };

    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  },

  toggleAudioPlayback(msgId, url, player) {
    const playBtn = player.querySelector('.chat-audio-play-btn');
    const slider = player.querySelector('.chat-audio-slider');
    const currentLabel = player.querySelector('.audio-current-time');

    if (this.currentPlayingMsgId === msgId && this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
      if (playBtn) playBtn.innerText = '▶️';
      return;
    }

    if (this.currentAudio) {
      this.currentAudio.pause();
      document.querySelectorAll('.chat-audio-play-btn').forEach((b) => (b.innerText = '▶️'));
    }

    const audio = new Audio(url);
    this.currentAudio = audio;
    this.currentPlayingMsgId = msgId;
    if (playBtn) playBtn.innerText = '⏸️';

    audio.addEventListener('timeupdate', () => {
      if (audio.duration && slider) {
        const pct = (audio.currentTime / audio.duration) * 100;
        slider.value = pct;
        if (currentLabel) {
          currentLabel.innerText = this.formatDuration(audio.currentTime);
        }
      }
    });

    audio.addEventListener('ended', () => {
      if (playBtn) playBtn.innerText = '▶️';
      if (slider) slider.value = 0;
      if (currentLabel) currentLabel.innerText = '0:00';
      this.currentPlayingMsgId = null;
      this.currentAudio = null;
    });

    slider?.addEventListener('input', () => {
      if (audio.duration) {
        audio.currentTime = (slider.value / 100) * audio.duration;
      }
    });

    audio.play().catch((err) => console.error('Audio playback error:', err));
  },

  // ===================== READ RECEIPTS =====================
  async markChatAsRead() {
    try {
      const currentUserId = this.getCurrentUserId();
      if (!currentUserId) return;

      const unreadCount = this.messages.filter(
        (m) => String(m.senderId) !== currentUserId && m.status !== 'read'
      ).length;

      if (unreadCount > 0) {
        await API.markChatRead();
        window.SocketManager.sendChatRead({
          readBy: currentUserId,
          readAt: Date.now(),
        });

        this.messages.forEach((m) => {
          if (String(m.senderId) !== currentUserId) m.status = 'read';
        });
      }
    } catch (err) {
      console.warn('Mark chat read error:', err);
    }
  },

  handlePartnerRead(data) {
    const currentUserId = this.getCurrentUserId();
    this.messages.forEach((m) => {
      if (String(m.senderId) === currentUserId) {
        m.status = 'read';
      }
    });

    document.querySelectorAll('.chat-status-heart').forEach((heart) => {
      heart.classList.remove('sent');
      heart.classList.add('read');
      heart.innerText = '💗💗';
      heart.setAttribute('title', 'Seen by partner');
    });
  },

  // ===================== MESSAGE DELETION =====================
  openDeleteModal(msgId) {
    this.pendingDeleteMsgId = msgId;
    this.closeReactionBar();

    const msg = this.messages.find((m) => String(m._id) === String(msgId));
    const currentUserId = this.getCurrentUserId();
    const isMine = msg && String(msg.senderId) === currentUserId;

    const modal = document.getElementById('chatDeleteModal');
    const btnEveryone = document.getElementById('btnDeleteForEveryone');

    if (btnEveryone) {
      btnEveryone.style.display = isMine ? 'block' : 'none';
    }

    if (modal) modal.style.display = 'flex';
  },

  closeDeleteModal() {
    const modal = document.getElementById('chatDeleteModal');
    if (modal) modal.style.display = 'none';
    this.pendingDeleteMsgId = null;
  },

  async confirmDeleteMessage(type) {
    const msgId = this.pendingDeleteMsgId;
    if (!msgId) return;

    this.closeDeleteModal();

    try {
      const res = await API.deleteChatMessage(msgId, type);
      if (type === 'everyone') {
        const msg = this.messages.find((m) => String(m._id) === String(msgId));
        if (msg) {
          msg.isDeleted = true;
          msg.text = 'This whisper was deleted 🕊️';
          msg.imageUrl = '';
          msg.audioUrl = '';
          msg.reactions = [];
        }
        this.updateBubbleDOM(msgId);
        window.SocketManager.sendChatMessageDeleted({ messageId: msgId });
      } else {
        this.messages = this.messages.filter((m) => String(m._id) !== String(msgId));
        const bubble = document.querySelector(`.chat-bubble[data-msg-id="${msgId}"]`);
        if (bubble) bubble.remove();
      }
    } catch (err) {
      console.error('Delete message error:', err);
      alert('Failed to delete whisper: ' + err.message);
    }
  },

  handleMessageDeleted(data) {
    if (!data || !data.messageId) return;
    const msg = this.messages.find((m) => String(m._id) === String(data.messageId));
    if (msg) {
      msg.isDeleted = true;
      msg.text = 'This whisper was deleted 🕊️';
      msg.imageUrl = '';
      msg.audioUrl = '';
      msg.reactions = [];
      this.updateBubbleDOM(data.messageId);
      this.updatePinnedCount();
      if (this.pinnedDrawerOpen) {
        this.renderPinnedList();
      }
    }
  },

  updateBubbleDOM(msgId) {
    const bubble = document.querySelector(`.chat-bubble[data-msg-id="${msgId}"]`);
    const msg = this.messages.find((m) => String(m._id) === String(msgId));
    const currentUserId = this.getCurrentUserId();

    if (bubble && msg) {
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = this.renderMessageBubble(msg, currentUserId);
      const newBubble = tempContainer.firstElementChild;
      if (newBubble) {
        bubble.replaceWith(newBubble);
      }
    }
  },

  // ===================== EMOJI & ATTACHMENT HELPERS =====================
  clearAttachedImage() {
    this.selectedImageFile = null;
    const imageInput = document.getElementById('chatImageInput');
    const previewTray = document.getElementById('chatImagePreviewTray');
    const thumb = document.getElementById('chatPreviewThumb');
    const input = document.getElementById('chatInput');

    if (imageInput) imageInput.value = '';
    if (thumb) thumb.src = '';
    if (previewTray) previewTray.style.display = 'none';
    if (input) input.placeholder = 'Type a sweet message...';
  },

  openEmojiDrawer() {
    const drawer = document.getElementById('chatEmojiDrawer');
    const pickerBtn = document.getElementById('btnChatEmojiPicker');
    if (!drawer) return;

    drawer.style.display = 'flex';
    pickerBtn?.classList.add('active');
    this.renderEmojiGrid(this.activeEmojiCategory);
  },

  closeEmojiDrawer() {
    const drawer = document.getElementById('chatEmojiDrawer');
    const pickerBtn = document.getElementById('btnChatEmojiPicker');
    if (drawer) drawer.style.display = 'none';
    pickerBtn?.classList.remove('active');
  },

  renderEmojiGrid(category) {
    const grid = document.getElementById('chatEmojiGrid');
    if (!grid) return;

    const emojis = this.EMOJI_CATEGORIES[category] || this.EMOJI_CATEGORIES.love;
    grid.innerHTML = emojis
      .map(
        (em) =>
          `<button type="button" class="emoji-drawer-item" data-emoji="${em}" title="${em}">${em}</button>`
      )
      .join('');
  },

  openImageLightbox(url, sourceElement = null) {
    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImg');

    if (modal && img) {
      const updateDOM = () => {
        img.src = url;
        modal.classList.add('chat-photo-mode');
        modal.classList.add('active');
      };

      if (document.startViewTransition) {
        if (sourceElement) sourceElement.style.viewTransitionName = 'hero-lightbox';
        img.style.viewTransitionName = 'hero-lightbox';
        const transition = document.startViewTransition(updateDOM);
        transition.finished.finally(() => {
          if (sourceElement) sourceElement.style.viewTransitionName = '';
          img.style.viewTransitionName = '';
        });
      } else {
        updateDOM();
      }
    }
  },

  showReactionBar(bubble, msgId, clientX = null, clientY = null) {
    this.closeReactionBar();

    const msg = this.messages.find((m) => String(m._id) === String(msgId));
    const currentUserId = this.getCurrentUserId();
    const myCurrentEmoji = msg?.reactions?.find(
      (r) => String(r.userId) === currentUserId
    )?.emoji;

    const bar = document.createElement('div');
    bar.className = 'chat-reaction-bar';
    bar.setAttribute('data-target-msg-id', msgId);

    // If message is deleted, only allow delete for me
    if (msg?.isDeleted) {
      bar.innerHTML = `
        <button class="reaction-delete-btn" id="btnReactionDelete" title="Delete whisper">🗑️</button>
      `;
    } else {
      let buttonsHtml = this.QUICK_REACTIONS.map((emoji) => {
        const isActive = myCurrentEmoji === emoji;
        return `<button class="reaction-option ${isActive ? 'active' : ''}" data-emoji="${emoji}" title="${emoji}">${emoji}</button>`;
      }).join('');

      const isPinned = !!msg?.isPinned;
      buttonsHtml += `<button class="reaction-reply-btn" id="btnReactionReply" title="Reply to whisper">↩️</button>`;
      buttonsHtml += `<button class="reaction-pin-btn" id="btnReactionPin" title="${isPinned ? 'Unpin whisper' : 'Pin whisper'}">${isPinned ? '📍' : '📌'}</button>`;
      buttonsHtml += `<button class="reaction-more-btn" id="btnReactionMore" title="More reactions">➕</button>`;
      buttonsHtml += `<button class="reaction-delete-btn" id="btnReactionDelete" title="Delete whisper">🗑️</button>`;

      buttonsHtml += `
        <div class="chat-reaction-expanded" id="chatReactionExpanded" style="display: none;">
          ${this.MORE_REACTIONS.map((emoji) => {
            const isActive = myCurrentEmoji === emoji;
            return `<button class="reaction-option ${isActive ? 'active' : ''}" data-emoji="${emoji}">${emoji}</button>`;
          }).join('')}
        </div>
      `;

      bar.innerHTML = buttonsHtml;
    }

    document.body.appendChild(bar);
    this.activeReactionBar = bar;

    const rect = bubble.getBoundingClientRect();
    const chatContainer = bubble.closest('.chat-container') || document.querySelector('.chat-container');
    const containerRect = chatContainer ? chatContainer.getBoundingClientRect() : null;

    // Use offsetWidth and offsetHeight to measure true layout dimensions
    // without distortion from the scale(0.6) entry animation
    const barWidth = bar.offsetWidth || 340;
    const barHeight = bar.offsetHeight || 44;

    let top = rect.top - barHeight - 8;
    const minTop = containerRect ? containerRect.top + 8 : 10;
    if (top < minTop) {
      top = rect.bottom + 8;
    }

    const isMine = bubble.classList.contains('mine');
    let left;
    if (isMine) {
      left = rect.right - barWidth;
      bar.classList.add('align-right');
    } else {
      left = rect.left;
    }

    const minLeft = containerRect ? Math.max(12, containerRect.left + 8) : 12;
    const maxLeft = containerRect
      ? Math.min(window.innerWidth - barWidth - 12, containerRect.right - barWidth - 8)
      : window.innerWidth - barWidth - 12;

    left = Math.max(minLeft, Math.min(maxLeft, left));

    bar.style.top = `${Math.round(top)}px`;
    bar.style.left = `${Math.round(left)}px`;

    bar.addEventListener('click', (e) => {
      const replyBtn = e.target.closest('#btnReactionReply');
      if (replyBtn) {
        e.stopPropagation();
        this.closeReactionBar();
        this.setReplyTarget(msg);
        return;
      }

      const pinBtn = e.target.closest('#btnReactionPin');
      if (pinBtn) {
        e.stopPropagation();
        this.closeReactionBar();
        this.togglePinMessage(msgId);
        return;
      }

      const delBtn = e.target.closest('#btnReactionDelete');
      if (delBtn) {
        e.stopPropagation();
        this.openDeleteModal(msgId);
        return;
      }

      const moreBtn = e.target.closest('#btnReactionMore');
      if (moreBtn) {
        e.stopPropagation();
        const expanded = bar.querySelector('#chatReactionExpanded');
        if (expanded) {
          const isHidden = expanded.style.display === 'none';
          expanded.style.display = isHidden ? 'grid' : 'none';
        }
        return;
      }

      const opt = e.target.closest('.reaction-option');
      if (opt) {
        e.stopPropagation();
        const emoji = opt.getAttribute('data-emoji');
        this.closeReactionBar();
        this.submitReaction(msgId, emoji);
      }
    });
  },

  closeReactionBar() {
    if (this.activeReactionBar) {
      this.activeReactionBar.remove();
      this.activeReactionBar = null;
    }
  },

  async submitReaction(msgId, emoji) {
    const msg = this.messages.find((m) => String(m._id) === String(msgId));
    if (!msg || msg.isDeleted) return;

    const currentUserId = this.getCurrentUserId();
    const currentUserName = this.getCurrentUserName();

    if (!msg.reactions) msg.reactions = [];

    const existingIdx = msg.reactions.findIndex(
      (r) => String(r.userId) === currentUserId
    );

    if (existingIdx > -1) {
      if (msg.reactions[existingIdx].emoji === emoji) {
        msg.reactions.splice(existingIdx, 1);
      } else {
        msg.reactions[existingIdx].emoji = emoji;
        msg.reactions[existingIdx].userName = currentUserName;
      }
    } else {
      msg.reactions.push({
        userId: currentUserId,
        userName: currentUserName,
        emoji,
      });
    }

    this.updateBubbleReactionsDOM(msgId);

    try {
      const res = await API.reactToChatMessage(msgId, emoji);
      if (res && res.reactions) {
        msg.reactions = res.reactions;
        this.updateBubbleReactionsDOM(msgId);
        window.SocketManager.sendChatReaction({
          messageId: msgId,
          reactions: res.reactions,
        });
      }
    } catch (err) {
      console.error('Failed to submit message reaction:', err);
      await this.loadMessages();
    }
  },

  handleReactionUpdate(data) {
    if (!data || !data.messageId) return;
    const msg = this.messages.find((m) => String(m._id) === String(data.messageId));
    if (msg) {
      msg.reactions = data.reactions || [];
      this.updateBubbleReactionsDOM(data.messageId);
    }
  },

  updateBubbleReactionsDOM(msgId) {
    const bubble = document.querySelector(`.chat-bubble[data-msg-id="${msgId}"]`);
    if (!bubble) return;

    const msg = this.messages.find((m) => String(m._id) === String(msgId));
    const currentUserId = this.getCurrentUserId();

    const existingBadge = bubble.querySelector('.chat-reactions-badge');
    if (existingBadge) existingBadge.remove();

    if (msg && msg.reactions && msg.reactions.length > 0) {
      bubble.classList.add('has-reactions');
      bubble.insertAdjacentHTML(
        'beforeend',
        this.renderReactionsHtml(msg.reactions, currentUserId, msgId)
      );
    } else {
      bubble.classList.remove('has-reactions');
    }
  },

  renderReactionsHtml(reactions, currentUserId, msgId) {
    if (!reactions || reactions.length === 0) return '';

    const uid = currentUserId || this.getCurrentUserId();
    const counts = {};
    let hasMine = false;
    const usersByEmoji = {};

    reactions.forEach((r) => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      if (!usersByEmoji[r.emoji]) usersByEmoji[r.emoji] = [];
      const isMine = uid && String(r.userId) === uid;
      if (isMine) hasMine = true;
      usersByEmoji[r.emoji].push(isMine ? 'You' : r.userName);
    });

    const tooltip = Object.entries(usersByEmoji)
      .map(([em, names]) => `${em} by ${names.join(', ')}`)
      .join(' • ');

    return `
      <div class="chat-reactions-badge ${hasMine ? 'has-mine' : ''}" data-msg-id="${msgId}" title="${this.escapeHtml(tooltip)}">
        ${Object.entries(counts)
          .map(
            ([em, cnt]) => `
          <span class="chat-reaction-emoji">${em}</span>
          ${cnt > 1 ? `<span class="chat-reaction-count">${cnt}</span>` : ''}
        `
          )
          .join('')}
      </div>
    `;
  },

  liveSyncInterval: null,
  lastSyncTime: null,

  startLiveSync() {
    if (this.liveSyncInterval) return;
    this.lastSyncTime = new Date().toISOString();
    // Live delta sync: pings every 1500ms for incoming whispers, media, and reactions
    this.liveSyncInterval = setInterval(() => {
      this.syncDelta();
    }, 1500);
  },

  stopLiveSync() {
    if (this.liveSyncInterval) {
      clearInterval(this.liveSyncInterval);
      this.liveSyncInterval = null;
    }
  },

  async syncDelta() {
    if (!API.getToken() || !API.isSpaceUnlocked()) return;
    try {
      const data = await API.getChatMessages(this.lastSyncTime);
      if (data?.serverTime) {
        this.lastSyncTime = data.serverTime;
      }
      const newOrUpdated = data?.messages || [];
      if (!newOrUpdated.length) return;

      const currentUserId = this.getCurrentUserId();
      let hasNewAppend = false;

      for (const msg of newOrUpdated) {
        const existingIdx = this.messages.findIndex((m) => String(m._id) === String(msg._id));
        if (existingIdx >= 0) {
          const oldMsg = this.messages[existingIdx];
          const oldReactions = JSON.stringify(oldMsg.reactions || []);
          const newReactions = JSON.stringify(msg.reactions || []);
          if (
            oldReactions !== newReactions ||
            oldMsg.status !== msg.status ||
            oldMsg.isPinned !== msg.isPinned ||
            oldMsg.isDeleted !== msg.isDeleted
          ) {
            this.messages[existingIdx] = msg;
            this.updateBubbleDOM(msg._id);
          }
        } else {
          this.appendMessage(msg);
          hasNewAppend = true;
        }
      }

      if (hasNewAppend) {
        this.scrollToBottom();
      }
    } catch (e) {
      // Background sync non-blocking catch
    }
  },

  async loadMessages() {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    try {
      const data = await API.getChatMessages();
      this.messages = data.messages || [];
      if (data?.serverTime) {
        this.lastSyncTime = data.serverTime;
      } else {
        this.lastSyncTime = new Date().toISOString();
      }
      this.render();
      this.updatePinnedCount();
    } catch (err) {
      container.innerHTML = `<div style="text-align:center; padding: 20px; color: #e74c3c;">Failed to load chat: ${err.message}</div>`;
    }
  },

  render() {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    if (this.messages.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; margin: auto; color: var(--text-muted);">
          <div style="font-size: 40px; margin-bottom: 8px;">💌</div>
          <p style="font-size: 14px; font-weight: 600;">Your private space is quiet</p>
          <p style="font-size: 12px;">Send your first love message!</p>
        </div>
      `;
      return;
    }

    const currentUserId = this.getCurrentUserId();
    container.innerHTML = this.messages
      .map((msg) => this.renderMessageBubble(msg, currentUserId))
      .join('');

    this.scrollToBottom();
  },

  async sendQuickReply(text) {
    if (!text || !text.trim()) return;
    const res = await API.sendChatMessage(text.trim());
    if (res && res.message) {
      this.appendMessage(res.message);
      if (window.SocketManager) {
        window.SocketManager.sendChatMessage(res.message);
      }
      this.checkAndTriggerMagicWords(text.trim(), 'You', true);
    }
  },

  appendMessage(msg) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    if (this.messages.some((m) => String(m._id) === String(msg._id))) return;
    this.messages.push(msg);
    if (msg.isPinned) {
      this.updatePinnedCount();
    }

    if (this.messages.length === 1) {
      container.innerHTML = '';
    }

    const currentUserId = this.getCurrentUserId();
    container.insertAdjacentHTML('beforeend', this.renderMessageBubble(msg, currentUserId));
    this.scrollToBottom();

    // If incoming message from partner and chat is visible, mark as read
    if (String(msg.senderId) !== currentUserId) {
      if (msg.text) {
        this.checkAndTriggerMagicWords(msg.text, msg.senderName, false);
      }
      const chatSection = document.getElementById('chatSection');
      if (chatSection && chatSection.style.display !== 'none') {
        this.markChatAsRead();
      }
    }
  },

  renderMessageBubble(msg, currentUserId) {
    const uid = currentUserId || this.getCurrentUserId();
    const isMine = uid && String(msg.senderId) === uid;
    const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const isDeleted = !!msg.isDeleted;
    const hasReactions = !isDeleted && msg.reactions && msg.reactions.length > 0;
    const reactionsMarkup = !isDeleted
      ? this.renderReactionsHtml(msg.reactions, uid, msg._id)
      : '';

    // Checkmark Read Receipts
    const isRead = msg.status === 'read';
    const checkmarkHtml = isMine
      ? `<span class="chat-status-heart ${isRead ? 'read' : 'sent'}" title="${isRead ? 'Seen by partner' : 'Sent'}">${isRead ? '💗💗' : '🖤'}</span>`
      : '';

    // Image Content
    const imageHtml =
      !isDeleted && msg.imageUrl
        ? `<div class="chat-bubble-image-wrap" data-img-url="${this.escapeHtml(msg.imageUrl)}" title="Click to view full photo">
             <img src="${this.escapeHtml(msg.imageUrl)}" class="chat-bubble-image" alt="Shared photo" loading="lazy">
           </div>`
        : '';

    // Audio Voice Note Content
    const audioHtml =
      !isDeleted && msg.audioUrl
        ? `<div class="chat-audio-player" data-audio-url="${this.escapeHtml(msg.audioUrl)}">
             <button type="button" class="chat-audio-play-btn" data-action="play" title="Play Voice Whisper">▶️</button>
             <div class="chat-audio-progress-wrap">
               <input type="range" class="chat-audio-slider" min="0" max="100" value="0">
               <div class="chat-audio-meta">
                 <span class="audio-current-time">0:00</span>
                 <span class="audio-total-time">${this.formatDuration(msg.audioDuration)}</span>
               </div>
             </div>
           </div>`
        : '';

    // Text Content
    let textHtml = '';
    if (isDeleted) {
      textHtml = `<div style="display: flex; align-items: center; gap: 6px;"><span>🕊️</span><span><em>${this.escapeHtml(msg.text || 'This whisper was deleted')}</em></span></div>`;
    } else if (msg.text) {
      // Check if message is pure emojis (1 to 6 emojis)
      const isEmojiOnly = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\s){1,6}$/u.test(msg.text.trim());
      const emojiStyle = isEmojiOnly ? 'font-size: 30px; line-height: 1.25;' : '';
      textHtml = `<div style="${emojiStyle}">${this.escapeHtml(msg.text)}</div>`;
    }

    // WhatsApp-Style Reply / Quoted Message Preview inside Bubble
    let replyQuoteHtml = '';
    if (msg.replyTo && (msg.replyTo.messageId || msg.replyTo._id)) {
      const replyMsgId = msg.replyTo.messageId || msg.replyTo._id;
      const senderDisplayName = msg.replyTo.senderName || 'Partner';
      let quoteSnippet = msg.replyTo.text || '';
      if (!quoteSnippet) {
        if (msg.replyTo.imageUrl) quoteSnippet = '📷 Photo';
        else if (msg.replyTo.audioUrl) quoteSnippet = '🎙️ Voice whisper';
      }
      const quoteThumb = msg.replyTo.imageUrl
        ? `<img src="${this.escapeHtml(msg.replyTo.imageUrl)}" class="chat-quote-thumb" alt="Quoted photo">`
        : '';

      replyQuoteHtml = `
        <div class="chat-reply-quote" data-target-reply-id="${this.escapeHtml(replyMsgId)}" title="Click to view quoted message">
          <div class="chat-quote-body">
            <div class="chat-quote-sender">${this.escapeHtml(senderDisplayName)}</div>
            <div class="chat-quote-text">${this.escapeHtml(quoteSnippet)}</div>
          </div>
          ${quoteThumb}
        </div>
      `;
    }

    // Desktop Floating Quick-Action Pill (Reply, Heart, Pin, More) on hover
    const isPinned = !!msg.isPinned;
    const quickActionsHtml = !isDeleted
      ? `
        <div class="chat-bubble-quick-actions" data-msg-id="${msg._id}" title="Message actions">
          <button type="button" class="quick-action-btn btn-quick-reply" title="Reply (WhatsApp Style)">↩️</button>
          <button type="button" class="quick-action-btn btn-quick-heart" title="React with ❤️">❤️</button>
          <button type="button" class="quick-action-btn btn-quick-pin" title="${isPinned ? 'Unpin whisper' : 'Pin whisper'}">${isPinned ? '📍' : '📌'}</button>
          <button type="button" class="quick-action-btn btn-quick-more" title="More reactions & options">⋯</button>
        </div>
      `
      : '';

    const pinnedBadgeHtml = isPinned && !isDeleted
      ? `<div class="chat-pinned-tag" title="Pinned whisper">📌 Pinned</div>`
      : '';

    return `
      <div class="chat-bubble ${isMine ? 'mine' : 'partner'} ${hasReactions ? 'has-reactions' : ''} ${isDeleted ? 'deleted' : ''} ${isPinned ? 'is-pinned' : ''}" data-msg-id="${msg._id}">
        ${quickActionsHtml}
        ${pinnedBadgeHtml}
        ${replyQuoteHtml}
        ${imageHtml}
        ${audioHtml}
        ${textHtml}
        <div class="chat-meta">
          ${isMine ? 'You' : this.escapeHtml(msg.senderName)} • ${timeStr} ${checkmarkHtml}
        </div>
        ${reactionsMarkup}
      </div>
    `;
  },

  setReplyTarget(msg) {
    if (!msg) return;
    this.replyTargetMessage = msg;

    const bar = document.getElementById('chatReplyPreviewBar');
    const toUser = document.getElementById('chatReplyToUser');
    const snippet = document.getElementById('chatReplySnippet');
    const thumbWrap = document.getElementById('chatReplyThumbWrap');
    const thumbImg = document.getElementById('chatReplyThumb');
    const input = document.getElementById('chatInput');

    if (!bar || !toUser || !snippet) return;

    const currentUserId = this.getCurrentUserId();
    const isMine = currentUserId && String(msg.senderId) === currentUserId;
    toUser.innerText = isMine ? 'Replying to Yourself' : `Replying to ${msg.senderName || 'Partner'}`;

    let textSnippet = msg.text || '';
    if (msg.isDeleted) {
      textSnippet = '🕊️ This whisper was deleted';
    } else if (!textSnippet) {
      if (msg.imageUrl) textSnippet = '📷 Photo';
      else if (msg.audioUrl) textSnippet = '🎙️ Voice whisper';
    }
    snippet.innerText = textSnippet;

    if (!msg.isDeleted && msg.imageUrl && thumbWrap && thumbImg) {
      thumbImg.src = msg.imageUrl;
      thumbWrap.style.display = 'block';
    } else if (thumbWrap) {
      thumbWrap.style.display = 'none';
      if (thumbImg) thumbImg.src = '';
    }

    bar.style.display = 'flex';
    input?.focus();
  },

  clearReply() {
    this.replyTargetMessage = null;
    const bar = document.getElementById('chatReplyPreviewBar');
    const thumbWrap = document.getElementById('chatReplyThumbWrap');
    const thumbImg = document.getElementById('chatReplyThumb');
    if (bar) bar.style.display = 'none';
    if (thumbWrap) thumbWrap.style.display = 'none';
    if (thumbImg) thumbImg.src = '';
  },

  getReplyPayload() {
    if (!this.replyTargetMessage) return null;
    const m = this.replyTargetMessage;
    return {
      messageId: m._id,
      senderName: m.senderName,
      text: m.text || '',
      imageUrl: m.imageUrl || '',
      audioUrl: m.audioUrl || '',
    };
  },

  scrollToQuotedMessage(targetId) {
    if (!targetId) return;
    const bubble = document.querySelector(`.chat-bubble[data-msg-id="${targetId}"]`);
    if (bubble) {
      bubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
      bubble.classList.remove('highlight-reply');
      void bubble.offsetWidth; // trigger reflow
      bubble.classList.add('highlight-reply');
      setTimeout(() => {
        bubble.classList.remove('highlight-reply');
      }, 2400);
    }
  },

  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  },

  setPartnerTyping(isTyping, partnerName) {
    const indicator = document.getElementById('chatTypingIndicator');
    if (!indicator) return;

    if (isTyping) {
      indicator.innerText = `${partnerName} is typing... 💬`;
      indicator.style.display = 'block';
      this.scrollToBottom();
    } else {
      indicator.style.display = 'none';
    }
  },

  scrollToBottom() {
    const container = document.getElementById('chatMessages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  },

  // ===================== PINNED WHISPERS =====================
  updatePinnedCount() {
    const pinnedCount = this.messages.filter((m) => m.isPinned && !m.isDeleted).length;
    const badge = document.getElementById('chatPinnedCount');
    const sub = document.getElementById('chatPinnedDrawerSubtitle');
    if (badge) badge.innerText = pinnedCount;
    if (sub) sub.innerText = `${pinnedCount} pinned whisper${pinnedCount === 1 ? '' : 's'}`;
  },

  togglePinnedDrawer() {
    if (this.pinnedDrawerOpen) {
      this.closePinnedDrawer();
    } else {
      this.openPinnedDrawer();
    }
  },

  openPinnedDrawer() {
    const drawer = document.getElementById('chatPinnedDrawer');
    const btn = document.getElementById('btnTogglePinnedMessages');
    if (!drawer) return;
    this.pinnedDrawerOpen = true;
    drawer.style.display = 'flex';
    btn?.classList.add('active');
    this.renderPinnedList();
  },

  closePinnedDrawer() {
    const drawer = document.getElementById('chatPinnedDrawer');
    const btn = document.getElementById('btnTogglePinnedMessages');
    if (!drawer) return;
    this.pinnedDrawerOpen = false;
    drawer.style.display = 'none';
    btn?.classList.remove('active');
  },

  renderPinnedList() {
    const list = document.getElementById('chatPinnedList');
    if (!list) return;

    const pinnedMessages = this.messages
      .filter((m) => m.isPinned && !m.isDeleted)
      .sort((a, b) => new Date(b.pinnedAt || b.createdAt) - new Date(a.pinnedAt || a.createdAt));

    if (pinnedMessages.length === 0) {
      list.innerHTML = `
        <div class="chat-pinned-empty">
          No pinned whispers yet. Hover over any sweet message to pin it ❤️
        </div>
      `;
      return;
    }

    const currentUserId = this.getCurrentUserId();
    list.innerHTML = pinnedMessages
      .map((msg) => {
        const isMine = currentUserId && String(msg.senderId) === currentUserId;
        const sender = isMine ? 'You' : this.escapeHtml(msg.senderName || 'Partner');
        const timeStr = new Date(msg.createdAt).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        let snippet = msg.text || '';
        if (!snippet) {
          if (msg.imageUrl) snippet = '📷 Shared Photo';
          else if (msg.audioUrl) snippet = '🎙️ Voice Whisper';
        }

        const thumbHtml = msg.imageUrl
          ? `<img src="${this.escapeHtml(msg.imageUrl)}" class="chat-pinned-thumb" alt="Thumbnail">`
          : '';

        return `
          <div class="chat-pinned-item" data-msg-id="${msg._id}" title="Click to view message in chat">
            <div class="chat-pinned-item-main">
              ${thumbHtml}
              <div class="chat-pinned-info">
                <div class="chat-pinned-meta">
                  <strong>${sender}</strong> • <span>${timeStr}</span>
                </div>
                <div class="chat-pinned-text">${this.escapeHtml(snippet)}</div>
              </div>
            </div>
            <div class="chat-pinned-actions">
              <button type="button" class="btn-unpin-item" data-msg-id="${msg._id}" title="Unpin this whisper">Unpin 📍</button>
            </div>
          </div>
        `;
      })
      .join('');
  },

  jumpToMessage(msgId) {
    if (!msgId) return;
    const bubble = document.querySelector(`.chat-bubble[data-msg-id="${msgId}"]`);
    if (bubble) {
      bubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
      bubble.classList.remove('highlight-pinned');
      void bubble.offsetWidth;
      bubble.classList.add('highlight-pinned');
      setTimeout(() => {
        bubble.classList.remove('highlight-pinned');
      }, 2200);
    }
  },

  async togglePinMessage(msgId) {
    if (!msgId) return;
    try {
      const res = await API.togglePinMessage(msgId);
      const msg = this.messages.find((m) => String(m._id) === String(msgId));
      if (msg) {
        msg.isPinned = res.isPinned;
        msg.pinnedAt = res.pinnedAt;
        msg.pinnedBy = res.pinnedBy;
        this.updateBubbleDOM(msgId);
        this.updatePinnedCount();
        if (this.pinnedDrawerOpen) {
          this.renderPinnedList();
        }
        window.SocketManager.sendChatPinToggled({
          messageId: msgId,
          isPinned: res.isPinned,
          pinnedAt: res.pinnedAt,
          pinnedBy: res.pinnedBy,
        });
      }
    } catch (err) {
      console.error('Failed to toggle pin message:', err);
      alert('Failed to pin/unpin message: ' + err.message);
    }
  },

  handlePinToggled(data) {
    if (!data || !data.messageId) return;
    const msg = this.messages.find((m) => String(m._id) === String(data.messageId));
    if (msg) {
      msg.isPinned = data.isPinned;
      msg.pinnedAt = data.pinnedAt;
      msg.pinnedBy = data.pinnedBy;
      this.updateBubbleDOM(data.messageId);
      this.updatePinnedCount();
      if (this.pinnedDrawerOpen) {
        this.renderPinnedList();
      }
    }
  },

  // ===================== SHARED WALLPAPER =====================
  openWallpaperModal() {
    const modal = document.getElementById('chatWallpaperModal');
    if (!modal) return;

    const presetsGrid = document.getElementById('wallpaperPresetsGrid');
    const opacitySlider = document.getElementById('wallpaperOpacitySlider');
    const opacityVal = document.getElementById('wallpaperOpacityVal');
    const previewWrap = document.getElementById('wallpaperCustomPreviewWrap');
    const previewImg = document.getElementById('wallpaperCustomPreviewImg');
    const uploadPrompt = document.getElementById('wallpaperUploadPrompt');

    const cur = this.currentWallpaper || { type: 'none', value: '', opacity: 40 };
    this.selectedWallpaperPreset = { type: cur.type, value: cur.value };
    this.selectedWallpaperFile = null;

    let rawOp = 0.4;
    if (cur.opacity != null && !isNaN(Number(cur.opacity))) {
      rawOp = Number(cur.opacity);
    }
    const opVal = Math.round(rawOp <= 1 ? rawOp * 100 : rawOp);
    if (opacitySlider) opacitySlider.value = opVal;
    if (opacityVal) opacityVal.innerText = `${opVal}%`;

    // Highlight matching preset or select none
    presetsGrid?.querySelectorAll('.wallpaper-preset-card').forEach((c) => {
      const type = c.getAttribute('data-type');
      const val = c.getAttribute('data-value');
      if (cur.type === 'preset' && val === cur.value) {
        c.classList.add('active');
      } else if (cur.type === 'none' && type === 'none') {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    if (cur.type === 'custom' && cur.value) {
      if (previewImg) previewImg.src = cur.value;
      if (previewWrap) previewWrap.style.display = 'block';
      if (uploadPrompt) uploadPrompt.style.display = 'none';
      presetsGrid?.querySelectorAll('.wallpaper-preset-card').forEach((c) => c.classList.remove('active'));
    } else {
      if (previewWrap) previewWrap.style.display = 'none';
      if (uploadPrompt) uploadPrompt.style.display = 'flex';
    }

    modal.style.display = 'flex';
  },

  closeWallpaperModal() {
    const modal = document.getElementById('chatWallpaperModal');
    if (modal) modal.style.display = 'none';
    this.selectedWallpaperFile = null;
  },

  async loadWallpaper() {
    try {
      const res = await API.getChatWallpaper();
      const wp = res?.chatWallpaper || res?.wallpaper;
      if (wp) {
        this.currentWallpaper = wp;
        this.applyWallpaper(wp, false);
      }
    } catch (err) {
      console.warn('Failed to load shared chat wallpaper:', err);
    }
  },

  applyWallpaper(wallpaperData, animate = true) {
    if (!wallpaperData) return;
    this.currentWallpaper = wallpaperData;

    const layerA = document.getElementById('chatWallpaperLayer');
    const layerB = document.getElementById('chatWallpaperLayerNext');
    if (!layerA || !layerB) return;

    const type = wallpaperData.type || 'none';
    const value = wallpaperData.value || '';

    // Normalize opacity: support both 0.40 and 40
    let rawOp = 0.4;
    if (wallpaperData.opacity != null && !isNaN(Number(wallpaperData.opacity))) {
      rawOp = Number(wallpaperData.opacity);
    }
    const targetOpacity = type === 'none' ? 0 : (rawOp > 1 ? rawOp / 100 : rawOp);

    const setLayerBackground = (layer) => {
      if (type === 'preset' && value) {
        layer.style.background = value;
      } else if (type === 'custom' && value) {
        layer.style.background = 'none';
        layer.style.backgroundImage = `url("${value}")`;
        layer.style.backgroundRepeat = 'no-repeat';
        layer.style.backgroundSize = `var(--chat-bg-zoom, cover)`;
        layer.style.backgroundPosition = `var(--chat-bg-pos, center center)`;
      } else {
        layer.style.background = 'none';
        layer.style.backgroundImage = 'none';
      }
    };

    if (!animate) {
      // Direct load without animation (initial render)
      layerA.style.transition = 'none';
      setLayerBackground(layerA);
      layerA.style.opacity = targetOpacity.toString();
      layerB.style.opacity = '0';
      layerB.style.background = 'none';
      void layerA.offsetWidth;
      layerA.style.transition = 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
      this.wallpaperActiveLayer = 'A';
      return;
    }

    // Cross-fade dual-layer animation
    const isLayerAActive = this.wallpaperActiveLayer === 'A';
    const currentLayer = isLayerAActive ? layerA : layerB;
    const nextLayer = isLayerAActive ? layerB : layerA;

    // Prepare next layer hidden
    nextLayer.style.transition = 'none';
    setLayerBackground(nextLayer);
    nextLayer.style.opacity = '0';
    void nextLayer.offsetWidth; // force browser layout reflow

    // Smoothly transition both layers
    nextLayer.style.transition = 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
    currentLayer.style.transition = 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)';

    nextLayer.style.opacity = targetOpacity.toString();
    currentLayer.style.opacity = '0';

    this.wallpaperActiveLayer = isLayerAActive ? 'B' : 'A';

    setTimeout(() => {
      currentLayer.style.background = 'none';
    }, 650);
  },

  async saveWallpaper() {
    const saveBtn = document.getElementById('btnSaveWallpaper');
    const opacitySlider = document.getElementById('wallpaperOpacitySlider');
    const opacity = opacitySlider ? parseInt(opacitySlider.value, 10) : 40;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = 'Applying... ❤️';
    }

    try {
      let updatedWallpaper;
      if (this.selectedWallpaperFile) {
        const formData = new FormData();
        formData.append('wallpaper', this.selectedWallpaperFile);
        formData.append('opacity', (opacity / 100).toString());
        const res = await API.uploadChatWallpaper(formData);
        updatedWallpaper = res?.chatWallpaper || res?.wallpaper;
      } else {
        const payload = {
          type: this.selectedWallpaperPreset.type || 'none',
          value: this.selectedWallpaperPreset.value || '',
          opacity: opacity / 100,
        };
        const res = await API.updateChatWallpaper(payload);
        updatedWallpaper = res?.chatWallpaper || res?.wallpaper;
      }

      if (updatedWallpaper) {
        this.applyWallpaper(updatedWallpaper, true);
        window.SocketManager.sendChatWallpaperChange({
          chatWallpaper: updatedWallpaper,
        });
      }

      this.closeWallpaperModal();
    } catch (err) {
      console.error('Failed to save chat wallpaper:', err);
      alert('Failed to set wallpaper: ' + err.message);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Apply for Both of Us ❤️';
      }
    }
  },

  handleWallpaperChange(data) {
    const wp = data?.chatWallpaper || data?.wallpaper;
    if (!wp) return;
    this.applyWallpaper(wp, true);
  },

  // ===================== CHAT BACKGROUND VIEW ADJUSTER (ZOOM & PAN) =====================
  initChatBgAdjuster() {
    try {
      const saved = localStorage.getItem('heartly_chat_bg_adjust');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.zoom === 'number') {
          this.chatBgSettings = parsed;
        }
      }
    } catch (e) {}
    this.applyChatBgView();
  },

  applyChatBgView() {
    const { zoom, panX, panY } = this.chatBgSettings;
    const zoomVal = `${zoom}%`;
    const posVal = `${panX}% ${panY}%`;

    const chatCard = document.getElementById('chatCard');
    const layerA = document.getElementById('chatWallpaperLayer');
    const layerB = document.getElementById('chatWallpaperLayerNext');

    [chatCard, layerA, layerB].forEach((el) => {
      if (el) {
        el.style.setProperty('--chat-bg-zoom', zoomVal);
        el.style.setProperty('--chat-bg-pos', posVal);
      }
    });

    if (layerA && layerA.style.backgroundImage && layerA.style.backgroundImage !== 'none') {
      layerA.style.backgroundSize = zoomVal;
      layerA.style.backgroundPosition = posVal;
    }
    if (layerB && layerB.style.backgroundImage && layerB.style.backgroundImage !== 'none') {
      layerB.style.backgroundSize = zoomVal;
      layerB.style.backgroundPosition = posVal;
    }

    const zoomEl = document.getElementById('chatBgZoomVal');
    const panXEl = document.getElementById('chatBgPanXVal');
    const panYEl = document.getElementById('chatBgPanYVal');
    const zoomSlider = document.getElementById('chatBgZoomSlider');
    const panXSlider = document.getElementById('chatBgPanXSlider');
    const panYSlider = document.getElementById('chatBgPanYSlider');

    if (zoomEl) zoomEl.innerText = `${zoom}%`;
    if (panXEl) panXEl.innerText = `${panX}%`;
    if (panYEl) panYEl.innerText = `${panY}%`;
    if (zoomSlider) zoomSlider.value = zoom;
    if (panXSlider) panXSlider.value = panX;
    if (panYSlider) panYSlider.value = panY;
  },

  saveChatBgView() {
    try {
      localStorage.setItem('heartly_chat_bg_adjust', JSON.stringify(this.chatBgSettings));
    } catch (e) {}
    const panel = document.getElementById('chatBgAdjustPanel');
    if (panel) panel.style.display = 'none';
  },

  resetChatBgView() {
    this.chatBgSettings = { zoom: 100, panX: 50, panY: 50 };
    this.applyChatBgView();
    try {
      localStorage.removeItem('heartly_chat_bg_adjust');
    } catch (e) {}
  },

  // ===================== MAGIC WORDS & LOVE PARTICLE BURSTS =====================
  checkAndTriggerMagicWords(text, senderName, isLocalSend = false) {
    if (!text || !this.magicWords || this.magicWords.length === 0) return;
    const lowerText = text.toLowerCase();

    // Sort by phrase length descending to match longest phrase first
    const sortedWords = [...this.magicWords].sort((a, b) => b.phrase.length - a.phrase.length);
    for (const mw of sortedWords) {
      if (!mw.phrase) continue;
      const lowerPhrase = mw.phrase.toLowerCase().trim();
      if (lowerPhrase && lowerText.includes(lowerPhrase)) {
        this.triggerParticleBurst(mw.effect, mw.phrase, senderName);
        if (isLocalSend) {
          window.SocketManager.sendTriggerBurst({
            effect: mw.effect,
            phrase: mw.phrase,
            senderName,
          });
        }
        break; // Trigger once per message
      }
    }
  },

  triggerParticleBurst(effect, phrase, senderName) {
    const container = document.getElementById('chatParticleBurstContainer');
    if (!container) return;

    // Cooldown check: prevent duplicate animation/audio if both socket event and message event fire simultaneously
    const now = Date.now();
    const burstKey = `${effect}_${(phrase || '').toLowerCase().trim()}`;
    if (this.lastBurstKey === burstKey && (now - this.lastBurstTime) < 1600) {
      return;
    }
    this.lastBurstKey = burstKey;
    this.lastBurstTime = now;

    // 1. Play enchanted chime
    this.playMagicChime(effect);

    // 2. Display subtle floating romantic banner toast
    this.showMagicBanner(effect, phrase, senderName);

    // If fireworks effect, launch the realistic HTML5 Canvas Fireworks Engine!
    if (effect === 'fireworks') {
      this.launchCanvasFireworks();
      return;
    }

    // 3. Clear container for DOM-based particles (hearts, petals, stars)
    container.innerHTML = '';

    const EFFECT_EMOJIS = {
      hearts: ['💖', '💕', '❤️', '💓', '💗', '🥰', '✨', '💝', '💞'],
      petals: ['🌹', '🌸', '🌺', '🌷', '🥀', '💐'],
      stars: ['✨', '⭐', '🌟', '💫', '🌠', '✨', '⭐'],
    };

    const emojis = EFFECT_EMOJIS[effect] || EFFECT_EMOJIS.hearts;
    const particleCount = 32;

    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div');
      p.className = `love-particle particle-${effect}`;
      p.innerText = emojis[Math.floor(Math.random() * emojis.length)];

      const left = Math.random() * 88 + 6; // 6% to 94% horizontal spread
      p.style.left = `${left}%`;

      const size = Math.floor(Math.random() * 16 + 22); // 22px to 38px
      p.style.fontSize = `${size}px`;

      const delay = (Math.random() * 0.45).toFixed(2);
      p.style.animationDelay = `${delay}s`;

      if (effect === 'hearts') {
        p.style.bottom = `${Math.floor(Math.random() * 20 + 20)}px`;
        const travelY = -1 * (Math.random() * 260 + 280);
        p.style.setProperty('--travel-y', `${travelY}px`);
        p.style.setProperty('--rot-mid', `${(Math.random() * 40 - 20).toFixed(0)}deg`);
        p.style.setProperty('--rot-end', `${(Math.random() * 50 - 25).toFixed(0)}deg`);
      } else if (effect === 'petals') {
        p.style.top = `${Math.floor(Math.random() * 30 + 10)}px`;
        const travelY = Math.random() * 280 + 320;
        p.style.setProperty('--travel-y', `${travelY}px`);
        p.style.setProperty('--drift-x', `${(Math.random() * 60 - 30).toFixed(0)}px`);
        p.style.setProperty('--rot-mid', `${(Math.random() * 180).toFixed(0)}deg`);
        p.style.setProperty('--rot-end', `${(Math.random() * 360).toFixed(0)}deg`);
      } else if (effect === 'stars') {
        p.style.top = `${Math.floor(Math.random() * 70 + 15)}%`;
        p.style.setProperty('--rot-mid', `${(Math.random() * 90).toFixed(0)}deg`);
        p.style.setProperty('--rot-end', `${(Math.random() * 180).toFixed(0)}deg`);
      }

      container.appendChild(p);
    }

    setTimeout(() => {
      container.innerHTML = '';
    }, 3800);
  },

  // ===================== REALISTIC HTML5 CANVAS FIREWORKS ENGINE =====================
  launchCanvasFireworks() {
    const canvas = document.getElementById('chatFireworksCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const chatContainer = canvas.parentElement || document.querySelector('.chat-container');
    const rect = chatContainer ? chatContainer.getBoundingClientRect() : { width: 680, height: 680 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const W = rect.width || 680;
    const H = rect.height || 680;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    if (this.fireworksAnimId) {
      cancelAnimationFrame(this.fireworksAnimId);
      this.fireworksAnimId = null;
    }

    const PALETTES = [
      ['#ff007f', '#ff4d6d', '#ff758c', '#ffffff', '#ffccd5'], // Neon Rose
      ['#ffd700', '#ffb703', '#ffe49e', '#fffdf0', '#ffa200'], // Golden Sparks
      ['#c77dff', '#9d4edd', '#70d6ff', '#ffffff', '#e0aaff'], // Starlight Amethyst
      ['#ff5400', '#ff0054', '#ff758c', '#ffe66d', '#ffffff'], // Romantic Sunset
      ['#06d6a0', '#118ab2', '#ffd166', '#ffffff', '#ef476f'], // Celestial Aurora
    ];

    const rockets = [];
    const particles = [];
    const sparkTrails = [];

    class Rocket {
      constructor(startX, targetY, delayMs, colorPalette) {
        this.x = startX;
        this.y = H - 15;
        this.targetY = targetY;
        this.delay = delayMs;
        this.spawnTime = performance.now() + delayMs;
        this.alive = true;
        this.launched = false;
        this.palette = colorPalette;
        this.color = colorPalette[Math.floor(Math.random() * colorPalette.length)];

        // Calculate initial launch velocity needed to reach apex around targetY (faster launch)
        const totalDistance = H - 15 - targetY;
        this.vy = -Math.sqrt(2 * 0.30 * Math.max(80, totalDistance)) * 1.1;
        this.vx = (Math.random() - 0.5) * 1.6;
        this.gravity = 0.28;
        this.history = [];
        this.maxHistory = 6;
      }

      update(now) {
        if (!this.alive) return;
        if (now < this.spawnTime) return;
        this.launched = true;

        this.history.push({ x: this.x, y: this.y });
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }

        // Falling glowing rocket sparks / smoke
        if (Math.random() < 0.65) {
          sparkTrails.push({
            x: this.x + (Math.random() - 0.5) * 4,
            y: this.y + 3,
            vx: (Math.random() - 0.5) * 1.2,
            vy: Math.random() * 2 + 0.8,
            color: '#ffd166',
            alpha: 1,
            decay: Math.random() * 0.06 + 0.045,
            size: Math.random() * 1.6 + 1,
          });
        }

        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;

        // Reached apex or target altitude -> explode!
        if (this.vy >= -1.0 || this.y <= this.targetY) {
          this.explode();
          this.alive = false;
        }
      }

      draw(c) {
        if (!this.launched || !this.alive || this.history.length < 2) return;
        c.save();
        c.beginPath();
        c.moveTo(this.history[0].x, this.history[0].y);
        for (let i = 1; i < this.history.length; i++) {
          c.lineTo(this.history[i].x, this.history[i].y);
        }
        c.strokeStyle = this.color;
        c.lineWidth = 2.4;
        c.lineCap = 'round';
        c.shadowColor = this.color;
        c.shadowBlur = 10;
        c.stroke();

        // Glowing rocket core
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(this.x, this.y, 2.6, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      explode() {
        const count = Math.floor(Math.random() * 35 + 85); // 85-120 particles per burst
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          // Faster explosion burst speed
          const speed = Math.pow(Math.random(), 0.55) * 9.2 + 1.8;
          const pColor = this.palette[Math.floor(Math.random() * this.palette.length)];
          particles.push(new Particle(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed, pColor));
        }
      }
    }

    class Particle {
      constructor(x, y, vx, vy, color) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.alpha = 1;
        this.decay = Math.random() * 0.024 + 0.024; // Faster, snappier fade
        this.friction = 0.948; // Snappy air resistance
        this.gravity = 0.12; // Downward gravity
        this.size = Math.random() * 2 + 1.2;
        this.history = [{ x, y }];
        this.maxHistory = Math.floor(Math.random() * 3 + 4);
        this.flicker = Math.random() < 0.35; // Sparkling shimmer
      }

      update() {
        this.history.push({ x: this.x, y: this.y });
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }

        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
      }

      draw(c) {
        if (this.alpha <= 0) return;
        c.save();
        const displayAlpha = this.flicker
          ? Math.max(0, this.alpha * (Math.random() * 0.45 + 0.55))
          : this.alpha;
        c.globalAlpha = displayAlpha;

        // Glowing motion trail
        if (this.history.length > 1) {
          c.beginPath();
          c.moveTo(this.history[0].x, this.history[0].y);
          for (let i = 1; i < this.history.length; i++) {
            c.lineTo(this.history[i].x, this.history[i].y);
          }
          c.strokeStyle = this.color;
          c.lineWidth = this.size;
          c.lineCap = 'round';
          c.shadowColor = this.color;
          c.shadowBlur = 8;
          c.stroke();
        }

        // Particle core
        c.fillStyle = this.color;
        c.shadowColor = this.color;
        c.shadowBlur = 6;
        c.beginPath();
        c.arc(this.x, this.y, this.size * 0.85, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }

    // Launch 5 staggered rockets across the width in rapid succession
    const rocketConfigs = [
      { xPct: 0.22, yPct: 0.28, delay: 0 },
      { xPct: 0.74, yPct: 0.24, delay: 110 },
      { xPct: 0.48, yPct: 0.18, delay: 240 },
      { xPct: 0.34, yPct: 0.32, delay: 380 },
      { xPct: 0.65, yPct: 0.26, delay: 520 },
    ];

    rocketConfigs.forEach((cfg, i) => {
      const palette = PALETTES[i % PALETTES.length];
      const startX = W * cfg.xPct + (Math.random() * 24 - 12);
      const targetY = H * cfg.yPct + (Math.random() * 24 - 12);
      rockets.push(new Rocket(startX, targetY, cfg.delay, palette));
    });

    const startTime = performance.now();

    const loop = (now) => {
      ctx.save();
      ctx.scale(dpr, dpr);

      // Realistic motion blur trailing with destination-out
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(0, 0, W, H);

      // Additive lighter blending for glowing neon cores and overlapping bursts
      ctx.globalCompositeOperation = 'lighter';

      // Update & Draw Rockets
      for (const r of rockets) {
        r.update(now);
        r.draw(ctx);
      }

      // Update & Draw Rocket Sparks
      for (let i = sparkTrails.length - 1; i >= 0; i--) {
        const s = sparkTrails[i];
        s.x += s.vx;
        s.y += s.vy;
        s.alpha -= s.decay;
        if (s.alpha <= 0) {
          sparkTrails.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Update & Draw Explosion Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        if (p.alpha <= 0) {
          particles.splice(i, 1);
        } else {
          p.draw(ctx);
        }
      }

      ctx.restore();

      const allRocketsDone = rockets.every((r) => !r.alive);
      const allParticlesDone = particles.length === 0 && sparkTrails.length === 0;

      // Completion check or 5.5s safety timeout
      if ((allRocketsDone && allParticlesDone) || (now - startTime > 5500)) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.fireworksAnimId = null;
        return;
      }

      this.fireworksAnimId = requestAnimationFrame(loop);
    };

    this.fireworksAnimId = requestAnimationFrame(loop);
  },

  playMagicChime(effect) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const notes = effect === 'stars'
        ? [587.33, 739.99, 880.00, 1174.66] // D5, F#5, A5, D6
        : effect === 'petals'
        ? [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6
        : [659.25, 830.61, 987.77, 1318.51]; // E5, G#5, B5, E6 (Romantic Sparkle)

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

        gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.55);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.6);
      });
    } catch (e) {
      console.warn('Audio chime error:', e);
    }
  },

  showMagicBanner(effect, phrase, senderName) {
    const chatContainer = document.querySelector('.chat-container');
    if (!chatContainer) return;

    const existing = chatContainer.querySelector('.chat-magic-banner');
    if (existing) existing.remove();

    const EFFECT_LABELS = {
      hearts: '💖 Neon Hearts',
      petals: '🌹 Rose Petals',
      stars: '✨ Constellations',
      fireworks: '🎆 Love Fireworks',
    };

    const effectLabel = EFFECT_LABELS[effect] || '💖 Romantic Sparkles';
    const banner = document.createElement('div');
    banner.className = 'chat-magic-banner';
    banner.innerHTML = `
      <span>✨</span>
      <span><strong>"${this.escapeHtml(phrase)}"</strong> triggered ${effectLabel}!</span>
    `;

    chatContainer.appendChild(banner);
    setTimeout(() => {
      banner.remove();
    }, 3100);
  },

  openMagicWordsModal() {
    const modal = document.getElementById('chatMagicWordsModal');
    if (!modal) return;
    this.renderMagicWordsList();
    modal.style.display = 'flex';
  },

  closeMagicWordsModal() {
    const modal = document.getElementById('chatMagicWordsModal');
    if (modal) modal.style.display = 'none';
  },

  async loadMagicWords() {
    try {
      const res = await API.getMagicWords();
      if (res && res.magicWords) {
        this.magicWords = res.magicWords;
      }
    } catch (err) {
      console.warn('Failed to load magic words:', err);
    }
  },

  renderMagicWordsList() {
    const list = document.getElementById('magicWordsList');
    if (!list) return;

    if (!this.magicWords || this.magicWords.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 18px;">No magic words added yet. Add your first secret word above! ❤️</div>`;
      return;
    }

    const EFFECT_ICONS = {
      hearts: '💖',
      petals: '🌹',
      stars: '✨',
      fireworks: '🎆',
    };

    const EFFECT_LABELS = {
      hearts: 'Neon Hearts',
      petals: 'Rose Petals',
      stars: 'Constellations',
      fireworks: 'Love Fireworks',
    };

    list.innerHTML = this.magicWords
      .map((mw) => {
        const icon = EFFECT_ICONS[mw.effect] || '💖';
        const label = EFFECT_LABELS[mw.effect] || 'Hearts';
        const addedBy = mw.createdByName ? `Added by ${this.escapeHtml(mw.createdByName)}` : '';
        const id = mw._id || '';

        return `
          <div class="magic-word-item">
            <div class="magic-word-main">
              <span class="magic-word-icon">${icon}</span>
              <span class="magic-word-phrase">"${this.escapeHtml(mw.phrase)}"</span>
              <span class="magic-word-badge">${label}</span>
              ${addedBy ? `<span class="magic-word-meta">${addedBy}</span>` : ''}
            </div>
            ${id ? `<button type="button" class="btn-delete-magic-word" data-id="${id}" title="Remove this magic word">&times;</button>` : ''}
          </div>
        `;
      })
      .join('');
  },

  async saveNewMagicWord() {
    const input = document.getElementById('inputMagicPhrase');
    const phrase = input?.value.trim();
    if (!phrase) return;

    const activeRadio = document.querySelector('input[name="magicEffect"]:checked');
    const effect = activeRadio ? activeRadio.value : 'hearts';

    const submitBtn = document.getElementById('btnAddMagicWordSubmit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Adding... ✨';
    }

    try {
      const res = await API.addMagicWord(phrase, effect);
      if (res && res.magicWords) {
        this.magicWords = res.magicWords;
        this.renderMagicWordsList();
        if (input) input.value = '';
        window.SocketManager.sendMagicWordsUpdate({
          magicWords: res.magicWords,
          updatedByName: this.getCurrentUserName(),
        });
        // Playful preview of the added effect!
        this.triggerParticleBurst(effect, phrase, 'You');
      }
    } catch (err) {
      console.error('Failed to add magic word:', err);
      alert('Failed to add magic word: ' + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = '✨ Add to Our Chat';
      }
    }
  },

  async deleteMagicWord(id) {
    if (!id) return;
    try {
      const res = await API.deleteMagicWord(id);
      if (res && res.magicWords) {
        this.magicWords = res.magicWords;
        this.renderMagicWordsList();
        window.SocketManager.sendMagicWordsUpdate({
          magicWords: res.magicWords,
          updatedByName: this.getCurrentUserName(),
        });
      }
    } catch (err) {
      console.error('Failed to delete magic word:', err);
      alert('Failed to delete magic word: ' + err.message);
    }
  },

  handleMagicWordsUpdate(data) {
    if (!data || !data.magicWords) return;
    this.magicWords = data.magicWords;
    const modal = document.getElementById('chatMagicWordsModal');
    if (modal && modal.style.display !== 'none') {
      this.renderMagicWordsList();
    }
  },
};

window.ChatManager = ChatManager;
