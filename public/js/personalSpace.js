/**
 * Heartly - Personal Space (Private Sanctuary)
 * Strictly isolated for each partner in the space.
 * 
 * Features:
 * 1. 💌 Popup Scheduler: Plan & edit surprise popups (birthday/anniversary wishes) with text, photo, and voice notes.
 * 2. 📖 Personal Lined Diary: Ruled lined notebook pages where users can write, title, and save separate diaries.
 * 3. 🎁 Secret Surprises & Gift Planner: Hidden ideas and wishlist plans.
 * 4. 📝 Secret Scratchpad: Continuous auto-saving personal memos.
 * 5. 🌸 My Daily Vibe: Private mood tracker.
 * 6. Incoming Celebratory Popup: App-open check for surprise greetings scheduled for today.
 */

const PersonalSpaceManager = {
  data: {
    mood: { emoji: '🌸', text: 'Peaceful & Content', time: Date.now() },
    surprises: [],
    diaries: [],
    currentDiaryId: null,
    scratchpad: '',
  },

  // State for popup creation/editing
  activePopups: [],
  currentPopupEditId: null,
  attachedImageUrl: null,
  attachedAudioUrl: null,
  mediaRecorder: null,
  audioChunks: [],
  recTimerInterval: null,
  recStartTime: null,

  syncDebounceTimer: null,

  getStorageKey() {
    const userId = window.App?.currentUser?.id || window.App?.currentUser?._id || 'guest';
    const spaceId = window.App?.currentSpace?.spaceId || window.App?.currentSpace?._id || 'main';
    return `heartly_personal_space_${spaceId}_${userId}`;
  },

  async loadData() {
    // 1. Fast cache load from localStorage
    try {
      const key = this.getStorageKey();
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...this.data, ...parsed };
      }
    } catch (e) {
      console.warn('[PersonalSpaceManager] Local cache load warning:', e);
    }

    // 2. Authoritative sync with MongoDB database
    try {
      const token = localStorage.getItem('heartly_token');
      if (token) {
        const res = await fetch('/api/personal/vault-data', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await res.json();
        if (result.success && result.vault) {
          this.data = {
            ...this.data,
            diaries: result.vault.diaries || [],
            moments: result.vault.moments || [],
            momentClasses: result.vault.momentClasses || [],
            currentDiaryId: result.vault.currentDiaryId || this.data.currentDiaryId || null,
            scratchpad: result.vault.scratchpad !== undefined ? result.vault.scratchpad : this.data.scratchpad,
            mood: result.vault.mood || this.data.mood,
          };
          // Update cache
          const key = this.getStorageKey();
          localStorage.setItem(key, JSON.stringify(this.data));

          // Re-render subviews with fresh database data
          this.renderDiariesShelf();
          this.renderMomentsFilterBar();
          this.renderMomentsGrid();
        }
      }
    } catch (err) {
      console.warn('[PersonalSpaceManager] Database sync warning:', err);
    }
  },

  saveData() {
    // 1. Immediate local cache write
    try {
      const key = this.getStorageKey();
      localStorage.setItem(key, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[PersonalSpaceManager] Local save warning:', e);
    }

    // 2. Debounced sync to MongoDB database
    if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = setTimeout(async () => {
      try {
        const token = localStorage.getItem('heartly_token');
        if (!token) return;

        await fetch('/api/personal/vault-sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            diaries: this.data.diaries || [],
            moments: this.data.moments || [],
            momentClasses: this.data.momentClasses || [],
            currentDiaryId: this.data.currentDiaryId || null,
            scratchpad: this.data.scratchpad || '',
            mood: this.data.mood,
          }),
        });
      } catch (err) {
        console.warn('[PersonalSpaceManager] MongoDB vault sync error:', err);
      }
    }, 400);
  },

  async init() {
    await this.loadData();
    this.updateUserGreeting();
    this.bindSubNav();
    this.initPopupScheduler();
    this.initLinedDiary();
    this.initMoments();
    this.bindModals();
    this.initMidnightWatcher();
  },

  updateUserGreeting() {
    const userName = window.App?.currentUser?.name || 'My Love';
    const nameEl = document.getElementById('personalSpaceUserName');
    if (nameEl) {
      nameEl.textContent = userName;
    }
  },

  // -------------------------------------------------------------
  // Internal Sub-Navigation Switching
  // -------------------------------------------------------------
  bindSubNav() {
    const subNavBtns = document.querySelectorAll('.personal-sub-nav-btn');
    subNavBtns.forEach((btn) => {
      btn.onclick = () => {
        const targetView = btn.getAttribute('data-subview');
        this.switchSubView(targetView);
      };
    });
  },

  switchSubView(viewKey) {
    document.querySelectorAll('.personal-sub-nav-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-subview') === viewKey);
    });

    const views = {
      popups: document.getElementById('subviewPopups'),
      diary: document.getElementById('subviewDiary'),
      moments: document.getElementById('subviewMoments'),
    };

    Object.keys(views).forEach((k) => {
      if (views[k]) {
        views[k].style.display = k === viewKey ? 'block' : 'none';
      }
    });

    if (viewKey === 'popups') {
      this.fetchMyScheduledPopups();
    } else if (viewKey === 'diary') {
      this.renderDiariesShelf();
    } else if (viewKey === 'moments') {
      this.renderMomentsFilterBar();
      this.renderMomentsGrid();
    }
  },

  // =============================================================
  // SUBVIEW 1: POPUP SCHEDULER
  // =============================================================
  initPopupScheduler() {
    const btnOpenModal = document.getElementById('btnOpenSchedulePopupModal');
    if (btnOpenModal) {
      btnOpenModal.onclick = () => this.openPopupModal();
    }

    // Theme selector
    const themePills = document.querySelectorAll('.popup-theme-pill');
    themePills.forEach((pill) => {
      pill.onclick = () => {
        themePills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        const radio = pill.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      };
    });

    // Image upload trigger
    const btnPickImg = document.getElementById('btnPickPopupImage');
    const inputImgFile = document.getElementById('popupImageFileInput');
    if (btnPickImg && inputImgFile) {
      btnPickImg.onclick = () => inputImgFile.click();
      inputImgFile.onchange = (e) => this.handleImageSelected(e);
    }

    const btnRemoveImg = document.getElementById('btnRemovePopupImage');
    if (btnRemoveImg) {
      btnRemoveImg.onclick = () => this.clearAttachedImage();
    }

    // Audio upload trigger
    const btnPickAudio = document.getElementById('btnPickPopupAudio');
    const inputAudioFile = document.getElementById('popupAudioFileInput');
    if (btnPickAudio && inputAudioFile) {
      btnPickAudio.onclick = () => inputAudioFile.click();
      inputAudioFile.onchange = (e) => this.handleAudioSelected(e);
    }

    // Audio recording trigger
    const btnRecVoice = document.getElementById('btnRecordPopupVoice');
    const btnStopVoice = document.getElementById('btnStopPopupVoice');
    if (btnRecVoice) {
      btnRecVoice.onclick = () => this.startVoiceRecording();
    }
    if (btnStopVoice) {
      btnStopVoice.onclick = () => this.stopVoiceRecording();
    }

    const btnRemoveAudio = document.getElementById('btnRemovePopupAudio');
    if (btnRemoveAudio) {
      btnRemoveAudio.onclick = () => this.clearAttachedAudio();
    }

    // Form submit
    const formPopup = document.getElementById('formScheduledPopup');
    if (formPopup) {
      formPopup.onsubmit = (e) => {
        e.preventDefault();
        this.saveScheduledPopup();
      };
    }

    this.fetchMyScheduledPopups();
  },

  async fetchMyScheduledPopups() {
    try {
      const token = localStorage.getItem('heartly_token');
      if (!token) return;

      const res = await fetch('/api/personal/my-scheduled-popups', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.popups)) {
        this.activePopups = data.popups;
        this.renderPopupsList();
      }
    } catch (err) {
      console.warn('[PersonalSpaceManager] Fetch popups error:', err);
    }
  },

  renderPopupsList() {
    const container = document.getElementById('personalPopupsList');
    if (!container) return;

    if (!this.activePopups || this.activePopups.length === 0) {
      container.innerHTML = `
        <div class="personal-empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; background: rgba(255,255,255,0.08); border-radius: 18px; border: 1.5px dashed rgba(255,255,255,0.25);">
          <span style="font-size: 38px; display: block; margin-bottom: 8px;">💌</span>
          <h4 style="font-size: 16px; font-weight: 800; color: #ffffff; margin: 0 0 6px 0;">No Scheduled Popups Yet</h4>
          <p style="font-size: 13px; color: rgba(255,255,255,0.7); max-width: 480px; margin: 0 auto 16px auto;">
            Plan a birthday greeting, midnight anniversary wish, or sweet love letter. When your partner opens Heartly on that day, it will greet them throughout the day until dismissed!
          </p>
          <button type="button" class="btn-personal-action-main" onclick="PersonalSpaceManager.openPopupModal()">
            ✨ + Schedule First Surprise Popup
          </button>
        </div>
      `;
      return;
    }

    const themeIcons = {
      birthday: '🎂 Birthday',
      anniversary: '💍 Anniversary',
      love: '💖 Romantic Love',
      celebration: '🎉 Celebration',
      custom: '✨ Custom Surprise',
    };

    container.innerHTML = this.activePopups
      .map((p) => {
        const dateFormatted = new Date(p.targetDate + 'T00:00:00').toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const themeLabel = themeIcons[p.theme] || '✨ Surprise';

        return `
          <div class="popup-card-scheduled" id="popupCard_${p._id}">
            <div class="popup-card-top-row">
              <span class="popup-date-badge">🗓️ ${dateFormatted}</span>
              <span class="popup-theme-tag">${themeLabel}</span>
            </div>

            <h4 class="popup-card-title">${this.escapeHtml(p.title)}</h4>
            <p class="popup-card-msg">${this.escapeHtml(p.message)}</p>

            ${(p.imageUrl || p.audioUrl) ? `
              <div class="popup-card-media-preview">
                ${p.imageUrl ? `<img src="${p.imageUrl}" class="popup-card-img-thumb" alt="Attached photo">` : ''}
                ${p.audioUrl ? `<span class="popup-card-voice-tag">🎙️ Voice Note Included</span>` : ''}
              </div>
            ` : ''}

            <div class="popup-card-actions">
              <button type="button" class="btn-popup-edit" onclick="PersonalSpaceManager.openPopupModal('${p._id}')" title="Edit text, date, photo, or voice note">
                ✏️ Edit
              </button>
              <button type="button" class="btn-popup-delete" onclick="PersonalSpaceManager.deletePopup('${p._id}')" title="Delete popup">
                🗑️ Delete
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  },

  openPopupModal(popupId = null) {
    this.currentPopupEditId = popupId;
    const modal = document.getElementById('personalPopupModal');
    const modalTitle = document.getElementById('personalPopupModalTitle');
    const inputDate = document.getElementById('popupTargetDate');
    const inputTitle = document.getElementById('popupTitle');
    const inputMessage = document.getElementById('popupMessage');
    const checkConfetti = document.getElementById('popupConfettiToggle');
    const editIdHidden = document.getElementById('popupEditId');

    this.clearAttachedImage();
    this.clearAttachedAudio();

    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    if (inputDate) inputDate.min = today;

    if (popupId) {
      // Editing existing popup
      const existing = this.activePopups.find((p) => p._id === popupId);
      if (existing) {
        if (modalTitle) modalTitle.innerText = '✏️ Edit Surprise Popup';
        if (editIdHidden) editIdHidden.value = existing._id;
        if (inputDate) inputDate.value = existing.targetDate;
        if (inputTitle) inputTitle.value = existing.title;
        if (inputMessage) inputMessage.value = existing.message;
        if (checkConfetti) checkConfetti.checked = existing.hasConfetti !== false;

        // Select theme
        document.querySelectorAll('.popup-theme-pill').forEach((pill) => {
          const radio = pill.querySelector('input');
          const isMatch = radio && radio.value === existing.theme;
          pill.classList.toggle('active', isMatch);
          if (radio) radio.checked = isMatch;
        });

        // Set image if exists
        if (existing.imageUrl) {
          this.setAttachedImage(existing.imageUrl, 'Attached photo');
        }

        // Set audio if exists
        if (existing.audioUrl) {
          this.setAttachedAudio(existing.audioUrl, 'Attached voice note');
        }
      }
    } else {
      // Creating new
      if (modalTitle) modalTitle.innerText = '💌 Schedule a Surprise Popup';
      if (editIdHidden) editIdHidden.value = '';
      if (inputDate) inputDate.value = today;
      if (inputTitle) inputTitle.value = '';
      if (inputMessage) inputMessage.value = '';
      if (checkConfetti) checkConfetti.checked = true;

      // Reset to birthday theme
      document.querySelectorAll('.popup-theme-pill').forEach((pill, idx) => {
        pill.classList.toggle('active', idx === 0);
        const radio = pill.querySelector('input');
        if (radio) radio.checked = idx === 0;
      });
    }

    if (modal) modal.style.display = 'flex';
  },

  closePopupModal() {
    const modal = document.getElementById('personalPopupModal');
    if (modal) modal.style.display = 'none';
    this.stopVoiceRecording();
  },

  // Image Upload / Preview Handling
  async handleImageSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('media', file);

      const token = localStorage.getItem('heartly_token');
      const res = await fetch('/api/personal/upload-attachment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.url) {
        this.setAttachedImage(data.url, file.name);
      } else {
        // Fallback to data URL
        const reader = new FileReader();
        reader.onload = (e) => this.setAttachedImage(e.target.result, file.name);
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.warn('[PersonalSpaceManager] Image upload error:', err);
    }
  },

  setAttachedImage(url, name = 'photo.jpg') {
    this.attachedImageUrl = url;
    const previewWrap = document.getElementById('popupImagePreviewWrap');
    const previewImg = document.getElementById('popupImagePreviewImg');
    const nameLabel = document.getElementById('popupImageFileName');

    if (previewImg) previewImg.src = url;
    if (previewWrap) previewWrap.style.display = 'block';
    if (nameLabel) nameLabel.innerText = name;
  },

  clearAttachedImage() {
    this.attachedImageUrl = null;
    const previewWrap = document.getElementById('popupImagePreviewWrap');
    const previewImg = document.getElementById('popupImagePreviewImg');
    const nameLabel = document.getElementById('popupImageFileName');
    const fileInput = document.getElementById('popupImageFileInput');

    if (previewImg) previewImg.src = '';
    if (previewWrap) previewWrap.style.display = 'none';
    if (nameLabel) nameLabel.innerText = 'No photo attached';
    if (fileInput) fileInput.value = '';
  },

  // Audio Upload / Recording Handling
  async handleAudioSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('media', file);

      const token = localStorage.getItem('heartly_token');
      const res = await fetch('/api/personal/upload-attachment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.url) {
        this.setAttachedAudio(data.url, file.name);
      } else {
        const audioUrl = URL.createObjectURL(file);
        this.setAttachedAudio(audioUrl, file.name);
      }
    } catch (err) {
      console.warn('[PersonalSpaceManager] Audio upload error:', err);
    }
  },

  setAttachedAudio(url, label = 'Voice Note') {
    this.attachedAudioUrl = url;
    const previewWrap = document.getElementById('popupAudioPreviewWrap');
    const previewEl = document.getElementById('popupAudioPreviewEl');
    const nameLabel = document.getElementById('popupAudioFileName');

    if (previewEl) previewEl.src = url;
    if (previewWrap) previewWrap.style.display = 'block';
    if (nameLabel) nameLabel.innerText = label;
  },

  clearAttachedAudio() {
    this.attachedAudioUrl = null;
    const previewWrap = document.getElementById('popupAudioPreviewWrap');
    const previewEl = document.getElementById('popupAudioPreviewEl');
    const nameLabel = document.getElementById('popupAudioFileName');
    const fileInput = document.getElementById('popupAudioFileInput');

    if (previewEl) {
      previewEl.pause();
      previewEl.src = '';
    }
    if (previewWrap) previewWrap.style.display = 'none';
    if (nameLabel) nameLabel.innerText = 'No voice note';
    if (fileInput) fileInput.value = '';
  },

  async startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });

        try {
          const formData = new FormData();
          formData.append('media', file);
          const token = localStorage.getItem('heartly_token');
          const res = await fetch('/api/personal/upload-attachment', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          const data = await res.json();
          if (data.success && data.url) {
            this.setAttachedAudio(data.url, '🎙️ Recorded Voice Note');
          } else {
            const blobUrl = URL.createObjectURL(audioBlob);
            this.setAttachedAudio(blobUrl, '🎙️ Recorded Voice Note');
          }
        } catch (err) {
          const blobUrl = URL.createObjectURL(audioBlob);
          this.setAttachedAudio(blobUrl, '🎙️ Recorded Voice Note');
        }

        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
      };

      this.mediaRecorder.start();

      const btnRec = document.getElementById('btnRecordPopupVoice');
      const btnStop = document.getElementById('btnStopPopupVoice');
      if (btnRec) btnRec.style.display = 'none';
      if (btnStop) btnStop.style.display = 'inline-flex';

      this.recStartTime = Date.now();
      const timerEl = document.getElementById('voiceRecTimer');
      if (this.recTimerInterval) clearInterval(this.recTimerInterval);
      this.recTimerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - this.recStartTime) / 1000);
        const mins = Math.floor(elapsedSec / 60);
        const secs = elapsedSec % 60;
        if (timerEl) {
          timerEl.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
      }, 1000);
    } catch (err) {
      console.warn('[PersonalSpaceManager] Microphone access denied or unavailable:', err);
      if (window.HeartlyDialog) {
        HeartlyDialog.alert('Microphone Access', 'Please allow microphone access to record a voice note, or upload an audio file instead! 🎙️');
      }
    }
  },

  stopVoiceRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    if (this.recTimerInterval) {
      clearInterval(this.recTimerInterval);
      this.recTimerInterval = null;
    }

    const btnRec = document.getElementById('btnRecordPopupVoice');
    const btnStop = document.getElementById('btnStopPopupVoice');
    if (btnRec) btnRec.style.display = 'inline-flex';
    if (btnStop) btnStop.style.display = 'none';
  },

  async saveScheduledPopup() {
    const inputDate = document.getElementById('popupTargetDate');
    const inputTitle = document.getElementById('popupTitle');
    const inputMessage = document.getElementById('popupMessage');
    const checkConfetti = document.getElementById('popupConfettiToggle');
    const selectedTheme = document.querySelector('input[name="popupTheme"]:checked')?.value || 'birthday';

    const targetDate = inputDate?.value.trim();
    const title = inputTitle?.value.trim();
    const message = inputMessage?.value.trim();

    if (!targetDate || !title || !message) {
      if (window.HeartlyDialog) {
        HeartlyDialog.toast('Please provide a date, title, and surprise message.', 'error');
      }
      return;
    }

    const payload = {
      targetDate,
      title,
      message,
      theme: selectedTheme,
      hasConfetti: checkConfetti ? checkConfetti.checked : true,
      imageUrl: this.attachedImageUrl || null,
      audioUrl: this.attachedAudioUrl || null,
    };

    try {
      const token = localStorage.getItem('heartly_token');
      const isEdit = Boolean(this.currentPopupEditId);
      const url = isEdit
        ? `/api/personal/scheduled-popups/${this.currentPopupEditId}`
        : '/api/personal/scheduled-popups';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        this.closePopupModal();
        await this.fetchMyScheduledPopups();
        if (window.HeartlyDialog) {
          HeartlyDialog.toast(
            isEdit ? 'Surprise popup updated successfully! ✨' : 'Surprise popup scheduled for your love! 💌',
            'success'
          );
        }
      } else {
        if (window.HeartlyDialog) {
          HeartlyDialog.alert('Could Not Save Popup', data.message || 'Failed to save scheduled popup.');
        }
      }
    } catch (err) {
      console.error('[PersonalSpaceManager] Save popup error:', err);
      if (window.HeartlyDialog) {
        HeartlyDialog.toast('Network error saving surprise popup.', 'error');
      }
    }
  },

  async deletePopup(id) {
    if (!id) return;
    const confirmed = window.HeartlyDialog 
      ? await HeartlyDialog.confirm('Are you sure you want to delete this scheduled surprise popup?', 'Delete Surprise')
      : confirm('Are you sure you want to delete this scheduled surprise popup?');
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('heartly_token');
      const res = await fetch(`/api/personal/scheduled-popups/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        await this.fetchMyScheduledPopups();
        if (window.HeartlyDialog) {
          HeartlyDialog.toast('Scheduled popup deleted.', 'success');
        }
      }
    } catch (err) {
      console.error('[PersonalSpaceManager] Delete popup error:', err);
    }
  },

  // =============================================================
  // SUBVIEW 2: PERSONAL LINED DIARY
  // =============================================================
  initLinedDiary() {
    const btnNew = document.getElementById('btnCreateNewDiary');
    if (btnNew) {
      btnNew.onclick = () => this.createNewDiary();
    }

    const btnSave = document.getElementById('btnSaveLinedDiary');
    if (btnSave) {
      btnSave.onclick = () => this.saveCurrentDiary();
    }

    const btnDelete = document.getElementById('btnDeleteCurrentDiary');
    if (btnDelete) {
      btnDelete.onclick = () => this.deleteCurrentDiary();
    }

    const textarea = document.getElementById('inputLinedDiaryBody');
    if (textarea) {
      textarea.oninput = () => this.updateDiaryWordCount();
    }

    this.renderDiariesShelf();
  },

  renderDiariesShelf() {
    const shelfList = document.getElementById('diaryShelfList');
    const shelfCount = document.getElementById('diaryShelfCount');
    if (!shelfList) return;

    const diaries = this.data.diaries || [];
    if (shelfCount) {
      shelfCount.innerText = `${diaries.length} ${diaries.length === 1 ? 'diary' : 'diaries'}`;
    }

    if (diaries.length === 0) {
      shelfList.innerHTML = `
        <div style="text-align: center; padding: 25px 10px; color: rgba(255,255,255,0.6); font-size: 12.5px;">
          <span>📖</span>
          <p style="margin: 6px 0 0 0;">No saved diaries yet.</p>
          <span style="font-size: 11px; opacity: 0.8;">Click "+ New Lined Diary" to write your first entry!</span>
        </div>
      `;
      // Start with a clean draft if nothing selected
      if (!this.data.currentDiaryId) {
        this.createNewDiary();
      }
      return;
    }

    shelfList.innerHTML = diaries
      .map((d) => {
        const isActive = d.id === this.data.currentDiaryId;
        const dateStr = new Date(d.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const snippet = d.content ? d.content.substring(0, 48) : 'Empty diary page...';

        return `
          <div class="shelf-diary-card ${isActive ? 'active' : ''}" onclick="PersonalSpaceManager.openDiary('${d.id}')">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <h5 class="shelf-diary-name" style="flex: 1;">${this.escapeHtml(d.name || 'Untitled Diary')}</h5>
              <button type="button" class="btn-shelf-diary-del" onclick="PersonalSpaceManager.deleteDiary('${d.id}', event)" title="Delete this diary">🗑️</button>
            </div>
            <div class="shelf-diary-meta-row">
              <span>🗓️ ${dateStr}</span>
              <span>${d.mood || '🌸 Peaceful'}</span>
            </div>
            <p class="shelf-diary-snippet">${this.escapeHtml(snippet)}...</p>
          </div>
        `;
      })
      .join('');

    // If active diary selected, load it; else load first
    if (this.data.currentDiaryId) {
      const selected = diaries.find((d) => d.id === this.data.currentDiaryId);
      if (selected) {
        this.loadDiaryToSheet(selected);
      } else {
        this.openDiary(diaries[0].id);
      }
    } else if (diaries.length > 0) {
      this.openDiary(diaries[0].id);
    }
  },

  openDiary(diaryId) {
    const diary = (this.data.diaries || []).find((d) => d.id === diaryId);
    if (!diary) return;

    this.data.currentDiaryId = diaryId;
    this.saveData();

    // Update active highlight in shelf
    document.querySelectorAll('.shelf-diary-card').forEach((el) => {
      el.classList.remove('active');
    });

    this.loadDiaryToSheet(diary);
    this.renderDiariesShelf();
  },

  loadDiaryToSheet(diary) {
    const inputName = document.getElementById('inputLinedDiaryName');
    const inputBody = document.getElementById('inputLinedDiaryBody');
    const moodSelect = document.getElementById('linedDiaryMoodSelect');
    const dateDisplay = document.getElementById('linedDiaryDateDisplay');
    const btnDelete = document.getElementById('btnDeleteCurrentDiary');
    const savedStatus = document.getElementById('linedDiarySavedStatus');

    if (inputName) inputName.value = diary.name || '';
    if (inputBody) inputBody.value = diary.content || '';
    if (moodSelect && diary.mood) moodSelect.value = diary.mood;

    if (dateDisplay) {
      const dateFormatted = new Date(diary.createdAt).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      dateDisplay.innerText = dateFormatted;
    }

    if (btnDelete) btnDelete.style.display = 'inline-block';
    if (savedStatus) savedStatus.innerText = '🔒 Saved in your private vault';

    this.updateDiaryWordCount();
  },

  createNewDiary() {
    this.data.currentDiaryId = null;

    const inputName = document.getElementById('inputLinedDiaryName');
    const inputBody = document.getElementById('inputLinedDiaryBody');
    const moodSelect = document.getElementById('linedDiaryMoodSelect');
    const dateDisplay = document.getElementById('linedDiaryDateDisplay');
    const btnDelete = document.getElementById('btnDeleteCurrentDiary');
    const savedStatus = document.getElementById('linedDiarySavedStatus');

    if (inputName) {
      inputName.value = '';
      inputName.focus();
    }
    if (inputBody) inputBody.value = '';
    if (moodSelect) moodSelect.value = '🌸 Peaceful';

    if (dateDisplay) {
      const todayFormatted = new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      dateDisplay.innerText = todayFormatted;
    }

    if (btnDelete) btnDelete.style.display = 'none';
    if (savedStatus) savedStatus.innerText = '✨ Fresh Ruled Page';

    this.updateDiaryWordCount();
  },

  saveCurrentDiary() {
    const inputName = document.getElementById('inputLinedDiaryName');
    const inputBody = document.getElementById('inputLinedDiaryBody');
    const moodSelect = document.getElementById('linedDiaryMoodSelect');
    const savedStatus = document.getElementById('linedDiarySavedStatus');

    let name = inputName?.value.trim();
    const content = inputBody?.value || '';
    const mood = moodSelect?.value || '🌸 Peaceful';

    if (!name) {
      const dateShort = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      name = `Diary Note - ${dateShort}`;
      if (inputName) inputName.value = name;
    }

    if (!this.data.diaries) this.data.diaries = [];

    if (this.data.currentDiaryId) {
      // Update existing
      const idx = this.data.diaries.findIndex((d) => d.id === this.data.currentDiaryId);
      if (idx !== -1) {
        this.data.diaries[idx].name = name;
        this.data.diaries[idx].content = content;
        this.data.diaries[idx].mood = mood;
        this.data.diaries[idx].updatedAt = Date.now();
      }
    } else {
      // Create new diary
      const newEntry = {
        id: 'diary_' + Date.now(),
        name,
        content,
        mood,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.data.diaries.unshift(newEntry);
      this.data.currentDiaryId = newEntry.id;
    }

    this.saveData();
    this.renderDiariesShelf();

    if (savedStatus) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      savedStatus.innerText = `🔒 Auto-saved at ${now}`;
    }

    const btnDelete = document.getElementById('btnDeleteCurrentDiary');
    if (btnDelete) btnDelete.style.display = 'inline-block';

    if (window.HeartlyDialog) {
      HeartlyDialog.toast(`"${name}" saved to your personal lined diary 🔒`, 'success');
    }
  },

  async deleteDiary(diaryId, event) {
    if (event) {
      event.stopPropagation();
    }
    if (!diaryId) return;
    const diary = (this.data.diaries || []).find((d) => d.id === diaryId);
    const diaryName = diary ? diary.name : 'this diary';

    const confirmed = window.HeartlyDialog
      ? await HeartlyDialog.confirm(`Are you sure you want to delete "${diaryName}"? This cannot be undone.`, 'Delete Diary')
      : confirm(`Are you sure you want to delete "${diaryName}"? This cannot be undone.`);
    if (!confirmed) return;

    this.data.diaries = (this.data.diaries || []).filter((d) => d.id !== diaryId);
    if (this.data.currentDiaryId === diaryId) {
      this.data.currentDiaryId = null;
    }
    this.saveData();

    if (!this.data.currentDiaryId && this.data.diaries.length > 0) {
      this.openDiary(this.data.diaries[0].id);
    } else if (this.data.diaries.length === 0) {
      this.createNewDiary();
    }
    this.renderDiariesShelf();

    if (window.HeartlyDialog) {
      HeartlyDialog.toast(`"${diaryName}" deleted from your diary shelf.`, 'info');
    }
  },

  deleteCurrentDiary() {
    if (!this.data.currentDiaryId) return;
    this.deleteDiary(this.data.currentDiaryId);
  },

  updateDiaryWordCount() {
    const inputBody = document.getElementById('inputLinedDiaryBody');
    const wordCountEl = document.getElementById('linedDiaryWordCount');
    if (!wordCountEl) return;

    const text = inputBody?.value.trim() || '';
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    wordCountEl.innerText = `${words} ${words === 1 ? 'word' : 'words'} · ${chars} chars`;
  },

  // =============================================================
  // SUBVIEW 3: MOMENTS I NEVER FORGET & CUSTOM CLASSES
  // =============================================================
  currentMomentsClassFilter: null,
  currentMomentEditId: null,
  attachedMomentImageUrl: null,
  attachedMomentAudioUrl: null,
  momentMediaRecorder: null,
  momentAudioChunks: [],
  momentRecTimerInterval: null,
  momentRecStartTime: null,

  initMoments() {
    if (!this.data.momentClasses) {
      this.data.momentClasses = [];
    }
    // Clean up any old preseeded classes if user didn't create them
    if (this.data.momentClasses.some((c) => ['class_firsts', 'class_trips', 'class_talks', 'class_dates'].includes(c.id))) {
      this.data.momentClasses = this.data.momentClasses.filter((c) => !['class_firsts', 'class_trips', 'class_talks', 'class_dates'].includes(c.id));
      this.saveData();
    }
    if (!this.data.moments) {
      this.data.moments = [];
    }

    // Modal open buttons
    const btnOpenAdd = document.getElementById('btnOpenAddMomentModal');
    if (btnOpenAdd) {
      btnOpenAdd.onclick = () => this.openMomentModal();
    }

    const btnOpenClasses = document.getElementById('btnOpenMomentsClassesModal');
    if (btnOpenClasses) {
      btnOpenClasses.onclick = () => this.openMomentsClassesModal();
    }

    // Classes modal controls
    const btnCloseClasses = document.getElementById('btnCloseMomentsClassesModal');
    const btnDoneClasses = document.getElementById('btnDoneMomentsClassesModal');
    if (btnCloseClasses) btnCloseClasses.onclick = () => this.closeMomentsClassesModal();
    if (btnDoneClasses) btnDoneClasses.onclick = () => this.closeMomentsClassesModal();

    const btnShowAll = document.getElementById('btnShowAllMomentsFromClasses');
    if (btnShowAll) {
      btnShowAll.onclick = () => {
        this.selectClassFilter(null);
        this.closeMomentsClassesModal();
      };
    }

    const btnCreateClass = document.getElementById('btnCreateNewClassSubmit');
    if (btnCreateClass) {
      btnCreateClass.onclick = () => this.handleCreateClassFromInput();
    }

    const inputNewClass = document.getElementById('inputNewClassName');
    if (inputNewClass) {
      inputNewClass.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleCreateClassFromInput();
        }
      });
    }

    const btnCreateFromMoment = document.getElementById('btnCreateClassFromMomentModal');
    if (btnCreateFromMoment) {
      btnCreateFromMoment.onclick = () => this.openMomentsClassesModal();
    }

    // Moment modal controls
    const btnCloseMoment = document.getElementById('btnCloseMomentModal');
    const btnCancelMoment = document.getElementById('btnCancelMomentModal');
    if (btnCloseMoment) btnCloseMoment.onclick = () => this.closeMomentModal();
    if (btnCancelMoment) btnCancelMoment.onclick = () => this.closeMomentModal();

    // Moment form submission
    const formMoment = document.getElementById('formPersonalMoment');
    if (formMoment) {
      formMoment.onsubmit = (e) => {
        e.preventDefault();
        this.saveMoment();
      };
    }

    // Moment media bindings
    const btnPickImage = document.getElementById('btnPickMomentImage');
    const inputImage = document.getElementById('momentImageFileInput');
    if (btnPickImage && inputImage) {
      btnPickImage.onclick = () => inputImage.click();
      inputImage.onchange = (e) => this.handleMomentImageSelected(e);
    }

    const btnRemoveImg = document.getElementById('btnRemoveMomentImage');
    if (btnRemoveImg) {
      btnRemoveImg.onclick = () => this.clearAttachedMomentImage();
    }

    const btnPickAudio = document.getElementById('btnPickMomentAudio');
    const inputAudio = document.getElementById('momentAudioFileInput');
    if (btnPickAudio && inputAudio) {
      btnPickAudio.onclick = () => inputAudio.click();
      inputAudio.onchange = (e) => this.handleMomentAudioSelected(e);
    }

    const btnRemoveAudio = document.getElementById('btnRemoveMomentAudio');
    if (btnRemoveAudio) {
      btnRemoveAudio.onclick = () => this.clearAttachedMomentAudio();
    }

    const btnRecordVoice = document.getElementById('btnRecordMomentVoice');
    if (btnRecordVoice) {
      btnRecordVoice.onclick = () => this.startMomentVoiceRecording();
    }

    const btnStopVoice = document.getElementById('btnStopMomentVoice');
    if (btnStopVoice) {
      btnStopVoice.onclick = () => this.stopMomentVoiceRecording();
    }

    this.renderMomentsFilterBar();
    this.renderMomentsGrid();
  },

  renderMomentsFilterBar() {
    const bar = document.getElementById('momentsClassFilterBar');
    if (!bar) return;

    const allMoments = this.data.moments || [];
    const classes = this.data.momentClasses || [];
    const isAllActive = !this.currentMomentsClassFilter;

    let html = `
      <button type="button" class="moments-filter-pill ${isAllActive ? 'active' : ''}" onclick="PersonalSpaceManager.selectClassFilter(null)">
        <span>🌟 All Memories</span>
        <span class="moments-pill-count">${allMoments.length}</span>
      </button>
    `;

    classes.forEach((cls) => {
      const isActive = this.currentMomentsClassFilter === cls.id;
      const count = allMoments.filter((m) => m.classId === cls.id).length;
      html += `
        <button type="button" class="moments-filter-pill ${isActive ? 'active' : ''}" onclick="PersonalSpaceManager.selectClassFilter('${cls.id}')">
          <span>${cls.emoji || '🏷️'} ${this.escapeHtml(cls.name)}</span>
          <span class="moments-pill-count">${count}</span>
        </button>
      `;
    });

    bar.innerHTML = html;
  },

  selectClassFilter(classId) {
    this.currentMomentsClassFilter = classId;
    this.renderMomentsFilterBar();
    this.renderMomentsGrid();
  },

  renderMomentsGrid() {
    const grid = document.getElementById('momentsCardsGrid');
    if (!grid) return;

    let moments = this.data.moments || [];
    if (this.currentMomentsClassFilter) {
      moments = moments.filter((m) => m.classId === this.currentMomentsClassFilter);
    }

    if (moments.length === 0) {
      const isFiltered = Boolean(this.currentMomentsClassFilter);
      const activeClass = (this.data.momentClasses || []).find((c) => c.id === this.currentMomentsClassFilter);
      const className = activeClass ? activeClass.name : 'this category';

      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 45px 20px; background: rgba(25, 15, 24, 0.45); border: 1.5px dashed rgba(255, 255, 255, 0.2); border-radius: 24px; color: rgba(255, 255, 255, 0.7);">
          <span style="font-size: 40px; display: block; margin-bottom: 10px;">✨</span>
          <h4 style="font-size: 17px; font-weight: 800; color: #ffffff; margin: 0 0 6px 0;">
            ${isFiltered ? `No moments saved under "${className}" yet` : 'No unforgettable moments recorded yet'}
          </h4>
          <p style="font-size: 13px; max-width: 480px; margin: 0 auto 18px auto; line-height: 1.5;">
            Capture milestones, secret glances, and memories that had stricken deep into your heart. Store pictures, audio notes, and locations forever.
          </p>
          <button type="button" class="btn-personal-action-main" onclick="PersonalSpaceManager.openMomentModal()">
            ✨ + Add First Unforgettable Moment
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = moments
      .map((m) => {
        const dateStr = m.date
          ? new Date(m.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          : new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const classObj = (this.data.momentClasses || []).find((c) => c.id === m.classId);
        const classBadge = classObj ? `${classObj.emoji || '🏷️'} ${this.escapeHtml(classObj.name)}` : null;

        return `
          <div class="moment-card" id="moment_card_${m.id}" onclick="PersonalSpaceManager.openEnlargedMemory('${m.id}')" title="Click to view & read enlarged memory">
            ${m.imageUrl ? `
              <div class="moment-card-img-wrap">
                <img src="${m.imageUrl}" class="moment-card-img" alt="${this.escapeHtml(m.title)}">
              </div>
            ` : ''}

            <div class="moment-card-body">
              <div class="moment-card-meta-row">
                ${classBadge ? `<span class="moment-card-class-badge">${classBadge}</span>` : '<span></span>'}
                <span class="moment-card-date-badge">🗓️ ${dateStr}</span>
              </div>

              <h4 class="moment-card-title">${this.escapeHtml(m.title)}</h4>

              ${m.location ? `
                <div class="moment-card-location">
                  <span>📍</span>
                  <span>${this.escapeHtml(m.location)}</span>
                </div>
              ` : ''}

              <p class="moment-card-desc">${this.escapeHtml(m.description || '')}</p>

              ${m.audioUrl ? `
                <div class="moment-card-audio-wrap" onclick="event.stopPropagation();">
                  <audio src="${m.audioUrl}" controls></audio>
                </div>
              ` : ''}

              <div class="moment-card-footer">
                <button type="button" class="btn-moment-action" onclick="event.stopPropagation(); PersonalSpaceManager.openMomentModal('${m.id}')" title="Edit moment">
                  ✏️ Edit
                </button>
                <button type="button" class="btn-moment-action btn-moment-delete" onclick="event.stopPropagation(); PersonalSpaceManager.deleteMoment('${m.id}')" title="Delete moment">
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  },

  openMomentModal(momentId = null) {
    this.currentMomentEditId = momentId;
    const modal = document.getElementById('personalMomentModal');
    const modalTitle = document.getElementById('personalMomentModalTitle');
    const inputTitle = document.getElementById('momentTitle');
    const inputDate = document.getElementById('momentDate');
    const inputLocation = document.getElementById('momentLocation');
    const selectClass = document.getElementById('momentClassSelect');
    const inputDesc = document.getElementById('momentDescription');
    const hiddenEditId = document.getElementById('momentEditId');

    this.clearAttachedMomentImage();
    this.clearAttachedMomentAudio();

    // Populate class dropdown
    if (selectClass) {
      const classes = this.data.momentClasses || [];
      selectClass.innerHTML = `
        <option value="">(No specific class / General memory)</option>
        ${classes.map((c) => `<option value="${c.id}">${c.emoji || '🏷️'} ${this.escapeHtml(c.name)}</option>`).join('')}
      `;
    }

    if (momentId) {
      const existing = (this.data.moments || []).find((m) => m.id === momentId);
      if (existing) {
        if (modalTitle) modalTitle.innerText = '✏️ Edit Unforgettable Moment';
        if (hiddenEditId) hiddenEditId.value = existing.id;
        if (inputTitle) inputTitle.value = existing.title || '';
        if (inputDate) inputDate.value = existing.date || '';
        if (inputLocation) inputLocation.value = existing.location || '';
        if (selectClass) selectClass.value = existing.classId || '';
        if (inputDesc) inputDesc.value = existing.description || '';

        if (existing.imageUrl) {
          this.setAttachedMomentImage(existing.imageUrl, 'Attached Photo');
        }
        if (existing.audioUrl) {
          this.setAttachedMomentAudio(existing.audioUrl, 'Attached Voice Note');
        }
      }
    } else {
      if (modalTitle) modalTitle.innerText = '✨ Add Unforgettable Moment';
      if (hiddenEditId) hiddenEditId.value = '';
      if (inputTitle) inputTitle.value = '';
      if (inputDate) inputDate.value = new Date().toISOString().split('T')[0];
      if (inputLocation) inputLocation.value = '';
      if (selectClass) selectClass.value = this.currentMomentsClassFilter || '';
      if (inputDesc) inputDesc.value = '';
    }

    if (modal) modal.style.display = 'flex';
  },

  closeMomentModal() {
    const modal = document.getElementById('personalMomentModal');
    if (modal) modal.style.display = 'none';
    this.stopMomentVoiceRecording();
  },

  saveMoment() {
    const inputTitle = document.getElementById('momentTitle');
    const inputDate = document.getElementById('momentDate');
    const inputLocation = document.getElementById('momentLocation');
    const selectClass = document.getElementById('momentClassSelect');
    const inputDesc = document.getElementById('momentDescription');

    const title = inputTitle?.value.trim();
    const date = inputDate?.value.trim() || new Date().toISOString().split('T')[0];
    const location = inputLocation?.value.trim() || '';
    const classId = selectClass?.value.trim() || null;
    const description = inputDesc?.value.trim();

    if (!title || !description) {
      if (window.HeartlyDialog) {
        HeartlyDialog.toast('Please provide a title and story for your memory.', 'error');
      }
      return;
    }

    if (!this.data.moments) this.data.moments = [];

    if (this.currentMomentEditId) {
      const idx = this.data.moments.findIndex((m) => m.id === this.currentMomentEditId);
      if (idx !== -1) {
        this.data.moments[idx].title = title;
        this.data.moments[idx].date = date;
        this.data.moments[idx].location = location;
        this.data.moments[idx].classId = classId;
        this.data.moments[idx].description = description;
        this.data.moments[idx].imageUrl = this.attachedMomentImageUrl || null;
        this.data.moments[idx].audioUrl = this.attachedMomentAudioUrl || null;
        this.data.moments[idx].updatedAt = Date.now();
      }
    } else {
      const newMoment = {
        id: 'moment_' + Date.now(),
        title,
        date,
        location,
        classId,
        description,
        imageUrl: this.attachedMomentImageUrl || null,
        audioUrl: this.attachedMomentAudioUrl || null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.data.moments.unshift(newMoment);
    }

    this.saveData();
    this.closeMomentModal();
    this.renderMomentsFilterBar();
    this.renderMomentsGrid();

    if (window.HeartlyDialog) {
      HeartlyDialog.toast(`"${title}" saved to your unforgettable moments ✨`, 'success');
    }
  },

  async deleteMoment(momentId) {
    if (!momentId) return;
    const moment = (this.data.moments || []).find((m) => m.id === momentId);
    const momentTitle = moment ? moment.title : 'this moment';

    const confirmed = window.HeartlyDialog
      ? await HeartlyDialog.confirm(`Are you sure you want to delete "${momentTitle}"? This cannot be undone.`, 'Delete Moment')
      : confirm(`Are you sure you want to delete "${momentTitle}"? This cannot be undone.`);
    if (!confirmed) return;

    this.data.moments = (this.data.moments || []).filter((m) => m.id !== momentId);
    this.saveData();
    this.renderMomentsFilterBar();
    this.renderMomentsGrid();

    if (window.HeartlyDialog) {
      HeartlyDialog.toast(`"${momentTitle}" removed.`, 'info');
    }
  },

  // Media attachments for Moments
  async handleMomentImageSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('media', file);
      const token = localStorage.getItem('heartly_token');
      const res = await fetch('/api/personal/upload-attachment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.url) {
        this.setAttachedMomentImage(data.url, file.name);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => this.setAttachedMomentImage(e.target.result, file.name);
        reader.readAsDataURL(file);
      }
    } catch (err) {
      const reader = new FileReader();
      reader.onload = (e) => this.setAttachedMomentImage(e.target.result, file.name);
      reader.readAsDataURL(file);
    }
  },

  setAttachedMomentImage(url, name = 'Attached photo') {
    this.attachedMomentImageUrl = url;
    const wrap = document.getElementById('momentImagePreviewWrap');
    const img = document.getElementById('momentImagePreviewImg');
    const nameLabel = document.getElementById('momentImageFileName');
    if (img) img.src = url;
    if (wrap) wrap.style.display = 'block';
    if (nameLabel) nameLabel.innerText = name;
  },

  clearAttachedMomentImage() {
    this.attachedMomentImageUrl = null;
    const wrap = document.getElementById('momentImagePreviewWrap');
    const img = document.getElementById('momentImagePreviewImg');
    const nameLabel = document.getElementById('momentImageFileName');
    const fileInput = document.getElementById('momentImageFileInput');
    if (img) img.src = '';
    if (wrap) wrap.style.display = 'none';
    if (nameLabel) nameLabel.innerText = 'No photo attached';
    if (fileInput) fileInput.value = '';
  },

  async handleMomentAudioSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('media', file);
      const token = localStorage.getItem('heartly_token');
      const res = await fetch('/api/personal/upload-attachment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.url) {
        this.setAttachedMomentAudio(data.url, file.name);
      } else {
        const audioUrl = URL.createObjectURL(file);
        this.setAttachedMomentAudio(audioUrl, file.name);
      }
    } catch (err) {
      const audioUrl = URL.createObjectURL(file);
      this.setAttachedMomentAudio(audioUrl, file.name);
    }
  },

  setAttachedMomentAudio(url, label = 'Voice Note') {
    this.attachedMomentAudioUrl = url;
    const wrap = document.getElementById('momentAudioPreviewWrap');
    const el = document.getElementById('momentAudioPreviewEl');
    const labelEl = document.getElementById('momentAudioFileName');
    if (el) el.src = url;
    if (wrap) wrap.style.display = 'flex';
    if (labelEl) labelEl.innerText = label;
  },

  clearAttachedMomentAudio() {
    this.attachedMomentAudioUrl = null;
    const wrap = document.getElementById('momentAudioPreviewWrap');
    const el = document.getElementById('momentAudioPreviewEl');
    const labelEl = document.getElementById('momentAudioFileName');
    const fileInput = document.getElementById('momentAudioFileInput');
    if (el) {
      el.pause();
      el.src = '';
    }
    if (wrap) wrap.style.display = 'none';
    if (labelEl) labelEl.innerText = 'No voice note';
    if (fileInput) fileInput.value = '';
  },

  async startMomentVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.momentMediaRecorder = new MediaRecorder(stream);
      this.momentAudioChunks = [];

      this.momentMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.momentAudioChunks.push(e.data);
      };

      this.momentMediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.momentAudioChunks, { type: 'audio/webm' });
        const file = new File([audioBlob], `moment_voice_${Date.now()}.webm`, { type: 'audio/webm' });

        try {
          const formData = new FormData();
          formData.append('media', file);
          const token = localStorage.getItem('heartly_token');
          const res = await fetch('/api/personal/upload-attachment', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          const data = await res.json();
          if (data.success && data.url) {
            this.setAttachedMomentAudio(data.url, '🎙️ Recorded Voice Note');
          } else {
            const blobUrl = URL.createObjectURL(audioBlob);
            this.setAttachedMomentAudio(blobUrl, '🎙️ Recorded Voice Note');
          }
        } catch (err) {
          const blobUrl = URL.createObjectURL(audioBlob);
          this.setAttachedMomentAudio(blobUrl, '🎙️ Recorded Voice Note');
        }

        stream.getTracks().forEach((t) => t.stop());
      };

      this.momentMediaRecorder.start();

      const btnRec = document.getElementById('btnRecordMomentVoice');
      const btnStop = document.getElementById('btnStopMomentVoice');
      if (btnRec) btnRec.style.display = 'none';
      if (btnStop) btnStop.style.display = 'inline-flex';

      this.momentRecStartTime = Date.now();
      const timerEl = document.getElementById('momentVoiceRecTimer');
      if (this.momentRecTimerInterval) clearInterval(this.momentRecTimerInterval);
      this.momentRecTimerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - this.momentRecStartTime) / 1000);
        const mins = Math.floor(elapsedSec / 60);
        const secs = elapsedSec % 60;
        if (timerEl) {
          timerEl.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
      }, 1000);
    } catch (err) {
      console.warn('[PersonalSpaceManager] Mic access warning:', err);
      if (window.HeartlyDialog) {
        HeartlyDialog.alert('Microphone Access', 'Please allow microphone access to record a voice clip! 🎙️');
      }
    }
  },

  stopMomentVoiceRecording() {
    if (this.momentMediaRecorder && this.momentMediaRecorder.state === 'recording') {
      this.momentMediaRecorder.stop();
    }
    if (this.momentRecTimerInterval) {
      clearInterval(this.momentRecTimerInterval);
      this.momentRecTimerInterval = null;
    }

    const btnRec = document.getElementById('btnRecordMomentVoice');
    const btnStop = document.getElementById('btnStopMomentVoice');
    if (btnRec) btnRec.style.display = 'inline-flex';
    if (btnStop) btnStop.style.display = 'none';
  },

  // Floating Classes Modal Methods
  openMomentsClassesModal() {
    const modal = document.getElementById('personalMomentsClassesModal');
    if (!modal) return;
    this.renderMomentsClassesList();
    modal.style.display = 'flex';
  },

  closeMomentsClassesModal() {
    const modal = document.getElementById('personalMomentsClassesModal');
    if (modal) modal.style.display = 'none';
  },

  renderMomentsClassesList() {
    const listEl = document.getElementById('momentsClassesShelfList');
    const countEl = document.getElementById('momentsClassesCount');
    if (!listEl) return;

    const classes = this.data.momentClasses || [];
    const moments = this.data.moments || [];
    if (countEl) countEl.innerText = `${classes.length} ${classes.length === 1 ? 'class' : 'classes'}`;

    if (classes.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">
          <span>🏷️ No custom classes yet.</span>
          <p style="margin: 4px 0 0 0; font-size: 11.5px;">Create your first category above!</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = classes
      .map((c) => {
        const count = moments.filter((m) => m.classId === c.id).length;
        return `
          <div class="class-shelf-item">
            <div class="class-item-info" onclick="PersonalSpaceManager.selectClassFromModal('${c.id}')" title="Click to view ${this.escapeHtml(c.name)} moments">
              <span class="class-item-emoji">${c.emoji || '🏷️'}</span>
              <span class="class-item-name">${this.escapeHtml(c.name)}</span>
              <span class="class-item-count">${count} ${count === 1 ? 'moment' : 'moments'}</span>
            </div>
            <div class="class-item-actions">
              <button type="button" class="btn-class-filter-view" onclick="PersonalSpaceManager.selectClassFromModal('${c.id}')">
                View Moments 🔍
              </button>
              <button type="button" class="btn-class-del" onclick="PersonalSpaceManager.deleteClass('${c.id}', event)" title="Delete class">
                🗑️
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  },

  selectClassFromModal(classId) {
    this.selectClassFilter(classId);
    this.closeMomentsClassesModal();
    if (window.HeartlyDialog) {
      const cls = (this.data.momentClasses || []).find((c) => c.id === classId);
      const name = cls ? cls.name : 'Selected class';
      HeartlyDialog.toast(`Showing moments in "${name}" 📂`, 'info');
    }
  },

  handleCreateClassFromInput() {
    const inputName = document.getElementById('inputNewClassName');
    const selectEmoji = document.getElementById('inputNewClassEmoji');
    const name = inputName?.value.trim();
    const emoji = selectEmoji?.value || '💖';

    if (!name) {
      if (window.HeartlyDialog) {
        HeartlyDialog.toast('Please enter a class name (e.g. Roadtrips, Firsts)', 'error');
      }
      return;
    }

    if (!this.data.momentClasses) this.data.momentClasses = [];
    const newClass = {
      id: 'class_' + Date.now(),
      name,
      emoji,
      createdAt: Date.now(),
    };
    this.data.momentClasses.push(newClass);
    this.saveData();

    if (inputName) inputName.value = '';

    this.renderMomentsClassesList();
    this.renderMomentsFilterBar();

    if (window.HeartlyDialog) {
      HeartlyDialog.toast(`Class "${name}" created! 🏷️`, 'success');
    }
  },

  async deleteClass(classId, event) {
    if (event) event.stopPropagation();
    const cls = (this.data.momentClasses || []).find((c) => c.id === classId);
    const className = cls ? cls.name : 'this class';

    const confirmed = window.HeartlyDialog
      ? await HeartlyDialog.confirm(`Are you sure you want to delete "${className}"? Any moments in this class will become uncategorized.`, 'Delete Class')
      : confirm(`Are you sure you want to delete "${className}"? Any moments in this class will become uncategorized.`);
    if (!confirmed) return;

    this.data.momentClasses = (this.data.momentClasses || []).filter((c) => c.id !== classId);
    // Unlink moments
    (this.data.moments || []).forEach((m) => {
      if (m.classId === classId) m.classId = null;
    });

    if (this.currentMomentsClassFilter === classId) {
      this.currentMomentsClassFilter = null;
    }

    this.saveData();
    this.renderMomentsClassesList();
    this.renderMomentsFilterBar();
    this.renderMomentsGrid();

    if (window.HeartlyDialog) {
      HeartlyDialog.toast(`Class "${className}" deleted.`, 'info');
    }
  },

  // =============================================================
  // MODAL BINDINGS & INCOMING CELEBRATION POPUP CHECK
  // =============================================================
  bindModals() {
    const btnClosePopup = document.getElementById('btnClosePopupModal');
    const btnCancelPopup = document.getElementById('btnCancelPopupModal');
    if (btnClosePopup) btnClosePopup.onclick = () => this.closePopupModal();
    if (btnCancelPopup) btnCancelPopup.onclick = () => this.closePopupModal();

    const btnCloseSurprise = document.getElementById('btnCloseSurpriseModal');
    if (btnCloseSurprise) {
      btnCloseSurprise.onclick = () => this.dismissSurpriseModal();
    }

    const btnCloseEnlarge = document.getElementById('btnCloseMemoryEnlarge');
    if (btnCloseEnlarge) {
      btnCloseEnlarge.onclick = () => this.closeEnlargedMemory();
    }

    const modalEnlarge = document.getElementById('personalMemoryEnlargeModal');
    if (modalEnlarge) {
      modalEnlarge.onclick = (e) => {
        if (e.target === modalEnlarge) {
          this.closeEnlargedMemory();
        }
      };
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const m = document.getElementById('personalMemoryEnlargeModal');
        if (m && m.style.display !== 'none') {
          this.closeEnlargedMemory();
        }
      }
    });
  },

  // =============================================================
  // IMMERSIVE ENLARGED MEMORY READER WITH TYPEWRITER ANIMATION
  // =============================================================
  currentTypewriterTimer: null,
  currentTypingElement: null,
  currentFullTypingText: '',
  currentOnCompleteTyping: null,
  currentEnlargedMomentId: null,

  openEnlargedMemory(momentId) {
    const m = (this.data.moments || []).find((item) => item.id === momentId);
    if (!m) return;

    this.currentEnlargedMomentId = momentId;
    const modal = document.getElementById('personalMemoryEnlargeModal');
    const card = document.getElementById('memoryEnlargeCard');
    const content = document.getElementById('memoryEnlargeContent');
    if (!modal || !content || !card) return;

    if (this.currentTypewriterTimer) {
      clearInterval(this.currentTypewriterTimer);
      this.currentTypewriterTimer = null;
    }

    const hasImage = Boolean(m.imageUrl && m.imageUrl.trim());
    const hasAudio = Boolean(m.audioUrl && m.audioUrl.trim());

    const dateStr = m.date
      ? new Date(m.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      : new Date(m.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const classObj = (this.data.momentClasses || []).find((c) => c.id === m.classId);
    const classBadge = classObj ? `${classObj.emoji || '🏷️'} ${this.escapeHtml(classObj.name)}` : null;

    card.className = 'memory-enlarge-card';

    if (hasImage) {
      card.classList.add('layout-has-image');
      content.innerHTML = `
        <div class="memory-enlarge-grid">
          <!-- Left: Written Text with Typewriter Animation -->
          <div class="memory-text-column" onclick="PersonalSpaceManager.skipTypewriter()">
            <div class="memory-enlarge-meta-row">
              <span class="memory-enlarge-date-badge">🗓️ ${dateStr}</span>
              ${classBadge ? `<span class="memory-enlarge-class-badge">${classBadge}</span>` : ''}
              ${m.location ? `<span class="memory-enlarge-loc-badge">📍 ${this.escapeHtml(m.location)}</span>` : ''}
            </div>

            <h2 class="memory-enlarge-title">${this.escapeHtml(m.title)}</h2>

            <div class="memory-enlarge-story" id="memoryEnlargeStoryText"></div>

            <div class="typewriter-hint-row">
              <span class="typewriter-skip-hint">✦ Click text to reveal fully</span>
            </div>

            <div class="memory-enlarge-actions-row">
              <button type="button" class="btn-enlarge-action" onclick="PersonalSpaceManager.openMomentModal('${m.id}'); PersonalSpaceManager.closeEnlargedMemory();">
                ✏️ Edit Memory
              </button>
              <button type="button" class="btn-enlarge-action btn-enlarge-delete" onclick="PersonalSpaceManager.deleteMoment('${m.id}'); PersonalSpaceManager.closeEnlargedMemory();">
                🗑️ Delete
              </button>
            </div>
          </div>

          <!-- Right: Enlarged Image and Voice Note Just Below It -->
          <div class="memory-media-column">
            <div class="memory-enlarge-img-frame">
              <img src="${m.imageUrl}" class="memory-enlarge-img" alt="${this.escapeHtml(m.title)}" />
            </div>

            ${hasAudio ? `
              <div class="memory-enlarge-voice-box">
                <div class="voice-box-label">
                  <span class="voice-icon">🎙️</span>
                  <span>Voice Note</span>
                </div>
                <audio class="memory-enlarge-audio-player" controls src="${m.audioUrl}" preload="metadata"></audio>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    } else if (!hasImage && !hasAudio) {
      // No image and no voice -> "enlarge and introduce the text with a typewrited animation on handwriting font"
      card.classList.add('layout-text-only', 'handwriting-theme');
      content.innerHTML = `
        <div class="memory-handwriting-card" onclick="PersonalSpaceManager.skipTypewriter()">
          <div class="memory-enlarge-meta-row centered">
            <span class="memory-enlarge-date-badge">🗓️ ${dateStr}</span>
            ${classBadge ? `<span class="memory-enlarge-class-badge">${classBadge}</span>` : ''}
            ${m.location ? `<span class="memory-enlarge-loc-badge">📍 ${this.escapeHtml(m.location)}</span>` : ''}
          </div>

          <h2 class="memory-enlarge-title handwriting-title" id="memoryEnlargeTitleText"></h2>

          <div class="handwriting-divider">❦ ─── ♡ ─── ❦</div>

          <div class="memory-enlarge-story handwriting-story" id="memoryEnlargeStoryText"></div>

          <div class="typewriter-hint-row centered">
            <span class="typewriter-skip-hint">✦ Click text to reveal fully</span>
          </div>

          <div class="memory-enlarge-actions-row centered">
            <button type="button" class="btn-enlarge-action" onclick="PersonalSpaceManager.openMomentModal('${m.id}'); PersonalSpaceManager.closeEnlargedMemory();">
              ✏️ Edit Memory
            </button>
            <button type="button" class="btn-enlarge-action btn-enlarge-delete" onclick="PersonalSpaceManager.deleteMoment('${m.id}'); PersonalSpaceManager.closeEnlargedMemory();">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    } else {
      // Voice exists, but NO image
      card.classList.add('layout-voice-only', 'handwriting-theme');
      content.innerHTML = `
        <div class="memory-handwriting-card" onclick="PersonalSpaceManager.skipTypewriter()">
          <div class="memory-enlarge-meta-row centered">
            <span class="memory-enlarge-date-badge">🗓️ ${dateStr}</span>
            ${classBadge ? `<span class="memory-enlarge-class-badge">${classBadge}</span>` : ''}
            ${m.location ? `<span class="memory-enlarge-loc-badge">📍 ${this.escapeHtml(m.location)}</span>` : ''}
          </div>

          <h2 class="memory-enlarge-title handwriting-title" id="memoryEnlargeTitleText"></h2>

          <div class="handwriting-divider">❦ ─── ♡ ─── ❦</div>

          <div class="memory-enlarge-story handwriting-story" id="memoryEnlargeStoryText"></div>

          <div class="memory-enlarge-voice-box centered-voice">
            <div class="voice-box-label">
              <span class="voice-icon">🎙️</span>
              <span>Voice Note</span>
            </div>
            <audio class="memory-enlarge-audio-player" controls src="${m.audioUrl}" preload="metadata"></audio>
          </div>

          <div class="typewriter-hint-row centered">
            <span class="typewriter-skip-hint">✦ Click text to reveal fully</span>
          </div>

          <div class="memory-enlarge-actions-row centered">
            <button type="button" class="btn-enlarge-action" onclick="PersonalSpaceManager.openMomentModal('${m.id}'); PersonalSpaceManager.closeEnlargedMemory();">
              ✏️ Edit Memory
            </button>
            <button type="button" class="btn-enlarge-action btn-enlarge-delete" onclick="PersonalSpaceManager.deleteMoment('${m.id}'); PersonalSpaceManager.closeEnlargedMemory();">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    }

    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('active'));

    const titleEl = document.getElementById('memoryEnlargeTitleText');
    const storyEl = document.getElementById('memoryEnlargeStoryText');
    const fullStory = m.description || 'A timeless memory cherished in the heart...';

    if (titleEl) {
      this.typewriteText(titleEl, m.title || '', 30, () => {
        if (storyEl) {
          this.typewriteText(storyEl, fullStory, 20);
        }
      });
    } else if (storyEl) {
      this.typewriteText(storyEl, fullStory, 20);
    }
  },

  typewriteText(targetEl, fullText, speed = 20, onComplete = null) {
    if (!targetEl) return;
    if (this.currentTypewriterTimer) {
      clearInterval(this.currentTypewriterTimer);
      this.currentTypewriterTimer = null;
    }

    targetEl.innerHTML = '';
    const cursor = document.createElement('span');
    cursor.className = 'typewriter-cursor';
    cursor.innerHTML = '&nbsp;';
    targetEl.appendChild(cursor);

    let charIndex = 0;
    this.currentFullTypingText = fullText;
    this.currentTypingElement = targetEl;
    this.currentOnCompleteTyping = onComplete;

    this.currentTypewriterTimer = setInterval(() => {
      if (charIndex < fullText.length) {
        const char = fullText[charIndex];
        if (char === '\n') {
          const br = document.createElement('br');
          targetEl.insertBefore(br, cursor);
        } else {
          const textNode = document.createTextNode(char);
          targetEl.insertBefore(textNode, cursor);
        }
        charIndex++;
      } else {
        clearInterval(this.currentTypewriterTimer);
        this.currentTypewriterTimer = null;
        setTimeout(() => cursor.classList.add('cursor-fade'), 1000);
        if (onComplete) onComplete();
      }
    }, speed);
  },

  skipTypewriter() {
    if (this.currentTypewriterTimer && this.currentTypingElement && this.currentFullTypingText) {
      clearInterval(this.currentTypewriterTimer);
      this.currentTypewriterTimer = null;
      this.currentTypingElement.innerHTML = this.escapeHtml(this.currentFullTypingText).replace(/\n/g, '<br>');
      const cb = this.currentOnCompleteTyping;
      this.currentOnCompleteTyping = null;
      if (cb) cb();
    }
  },

  closeEnlargedMemory() {
    const modal = document.getElementById('personalMemoryEnlargeModal');
    if (this.currentTypewriterTimer) {
      clearInterval(this.currentTypewriterTimer);
      this.currentTypewriterTimer = null;
    }
    if (modal) {
      const audios = modal.querySelectorAll('audio');
      audios.forEach((a) => {
        try { a.pause(); } catch (e) {}
      });
      modal.classList.remove('active');
      setTimeout(() => { modal.style.display = 'none'; }, 220);
    }
  },

  /**
   * Check if today matches any surprise popup scheduled by partner!
   * Called on app launch.
   */
  async checkTodayPopup() {
    try {
      const token = localStorage.getItem('heartly_token');
      if (!token) return;

      const clientDate = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/personal/today-popup?date=${clientDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success && data.popup) {
        const popup = data.popup;
        const dismissalKey = `heartly_popup_dismissed_${popup._id}_${clientDate}`;

        // If the user already checked "Do not show again today", don't show
        if (localStorage.getItem(dismissalKey) === 'true') {
          return;
        }

        this.showSurpriseCelebrationModal(popup);
      }
    } catch (err) {
      console.warn('[PersonalSpaceManager] Check today popup warning:', err);
    }
  },

  showSurpriseCelebrationModal(popup) {
    this.currentActiveTodayPopup = popup;
    const modal = document.getElementById('scheduledSurpriseModal');
    const titleEl = document.getElementById('surpriseDisplayTitle');
    const senderEl = document.getElementById('surpriseDisplaySender');
    const messageEl = document.getElementById('surpriseDisplayMessage');
    const imageWrap = document.getElementById('surpriseDisplayImageWrap');
    const imageEl = document.getElementById('surpriseDisplayImage');
    const audioWrap = document.getElementById('surpriseDisplayAudioWrap');
    const audioEl = document.getElementById('surpriseDisplayAudio');
    const audioSender = document.getElementById('surpriseAudioSender');
    const ribbonTitle = document.getElementById('surpriseRibbonTitle');
    const themeIcon = document.getElementById('surpriseThemeIcon');

    const themeTitles = {
      birthday: 'HAPPY BIRTHDAY CELEBRATION!',
      anniversary: 'HAPPY ANNIVERSARY LOVE!',
      love: 'SPECIAL ROMANTIC GREETING!',
      celebration: 'SPECIAL CELEBRATION FOR TODAY!',
      custom: 'A SURPRISE GREETING FOR YOU!',
    };
    const themeIcons = {
      birthday: '🎂',
      anniversary: '💍',
      love: '💖',
      celebration: '🎉',
      custom: '✨',
    };

    if (ribbonTitle) ribbonTitle.innerText = themeTitles[popup.theme] || 'SPECIAL CELEBRATION FOR TODAY!';
    if (themeIcon) themeIcon.innerText = themeIcons[popup.theme] || '🎂';
    if (titleEl) titleEl.innerText = popup.title;
    if (senderEl) senderEl.innerText = popup.creatorName || 'Your Love';
    if (messageEl) messageEl.innerText = popup.message;

    // Photo
    if (popup.imageUrl && imageWrap && imageEl) {
      imageEl.src = popup.imageUrl;
      imageWrap.style.display = 'block';
    } else if (imageWrap) {
      imageWrap.style.display = 'none';
    }

    // Audio
    if (popup.audioUrl && audioWrap && audioEl) {
      audioEl.src = popup.audioUrl;
      audioWrap.style.display = 'flex';
      if (audioSender) audioSender.innerText = popup.creatorName || 'Your Love';
    } else if (audioWrap) {
      audioWrap.style.display = 'none';
    }

    if (modal) modal.style.display = 'flex';

    if (popup.hasConfetti !== false) {
      this.launchCelebrationConfetti();
    }
  },

  dismissSurpriseModal() {
    const modal = document.getElementById('scheduledSurpriseModal');
    const checkbox = document.getElementById('checkDoNotShowAgainToday');
    const audioEl = document.getElementById('surpriseDisplayAudio');

    if (audioEl) audioEl.pause();

    if (checkbox && checkbox.checked && this.currentActiveTodayPopup) {
      const clientDate = new Date().toISOString().split('T')[0];
      const dismissalKey = `heartly_popup_dismissed_${this.currentActiveTodayPopup._id}_${clientDate}`;
      localStorage.setItem(dismissalKey, 'true');
    }

    if (modal) modal.style.display = 'none';
  },

  launchCelebrationConfetti() {
    const canvas = document.getElementById('surpriseConfettiCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confettiPieces = [];
    const colors = ['#ff4d6d', '#ff758f', '#ffccd5', '#ffd166', '#06d6a0', '#118ab2', '#c77dff', '#ffffff'];

    for (let i = 0; i < 120; i++) {
      confettiPieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedY: Math.random() * 3 + 2,
        speedX: Math.random() * 2 - 1,
        rotation: Math.random() * 360,
        rotSpeed: Math.random() * 6 - 3,
      });
    }

    let frames = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      confettiPieces.forEach((p) => {
        p.y += p.speedY;
        p.x += p.speedX;
        p.rotation += p.rotSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.4);
        ctx.restore();

        if (p.y > canvas.height) {
          p.y = -10;
          p.x = Math.random() * canvas.width;
        }
      });

      frames++;
      if (frames < 360) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    animate();
  },

  // =============================================================
  // MIDNIGHT 12:00 AM TRANSITION WATCHER (Zero Lag / Ultra-Low Overhead)
  // Runs high-precision check strictly between 11:58 PM and 12:01 AM
  // =============================================================
  initMidnightWatcher() {
    this.lastCheckedDate = new Date().toISOString().split('T')[0];
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
    }

    const checkMidnightTick = () => {
      try {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const currentDateStr = now.toISOString().split('T')[0];

        // If date has rolled over (transitioned through midnight 12:00 AM or woke from sleep)
        if (currentDateStr !== this.lastCheckedDate) {
          console.log('[PersonalSpaceManager] Midnight transition detected! Date changed to:', currentDateStr);
          this.lastCheckedDate = currentDateStr;
          // Immediately check for partner's scheduled popups for today
          this.checkTodayPopup();
          // Also refresh current user's scheduled popups list if personal space is active
          this.fetchMyScheduledPopups();
        }

        // Lightweight window: high frequency (4s) strictly between 11:58 PM (23:58) and 12:01 AM (00:01)
        const inWindow = (hours === 23 && minutes >= 58) || (hours === 0 && minutes <= 1);

        // Within 11:58 PM - 12:01 AM: checks every 4s to trigger at 12:00:00 immediately with 0 lag
        // Outside the window: checks once every 30s (0 lag, virtually 0 CPU)
        const delay = inWindow ? 4000 : 30000;
        this.midnightTimer = setTimeout(checkMidnightTick, delay);
      } catch (err) {
        console.warn('[PersonalSpaceManager] Midnight watcher tick error:', err);
        this.midnightTimer = setTimeout(checkMidnightTick, 30000);
      }
    };

    // Start ticker
    checkMidnightTick();
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  },
};

window.PersonalSpaceManager = PersonalSpaceManager;
