/**
 * DreamsManager - Interactive Clothesline of Dreams & Shared Bucket List
 * Real-time synchronization across partner devices with physics-based hanging cards
 */
const DreamsManager = {
  dreams: [],
  currentFilter: 'all',
  selectedColor: 'pink',
  selectedCategory: 'romantic',
  selectedAuthorType: 'Both',
  selectedPhotoFile: null,
  isInitialized: false,
  isSubmitting: false,

  async init() {
    if (!this.isInitialized) {
      this.bindEvents();
      this.isInitialized = true;
    }
    await this.loadDreams();
  },

  bindEvents() {
    // Open / Close Hang a Dream Modal
    document.getElementById('btnHangADream')?.addEventListener('click', () => {
      this.openHangModal();
    });

    document.getElementById('btnCloseHangModal')?.addEventListener('click', () => {
      this.closeHangModal();
    });

    document.getElementById('btnCancelHangModal')?.addEventListener('click', () => {
      this.closeHangModal();
    });

    // Close on overlay click
    document.getElementById('hangDreamModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'hangDreamModal') {
        this.closeHangModal();
      }
    });

    // Form submit
    document.getElementById('formHangDream')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveNewDream();
    });

    // Custom Dream Photo file input handler
    const photoInput = document.getElementById('inputDreamPhotoFile');
    photoInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        if (!file.type.startsWith('image/')) {
          if (window.HeartlyDialog) {
            HeartlyDialog.alert('Please choose an image file (PNG, JPG, WebP)', 'Shared Dreams');
          } else {
            alert('Please choose an image file');
          }
          return;
        }
        this.selectedPhotoFile = file;
        const previewImg = document.getElementById('dreamPhotoPreview');
        const previewWrap = document.getElementById('dreamPhotoPreviewWrap');
        const placeholder = document.getElementById('dreamPhotoPlaceholder');
        if (previewImg) previewImg.src = URL.createObjectURL(file);
        if (previewWrap) previewWrap.style.display = 'inline-block';
        if (placeholder) placeholder.style.display = 'none';
      }
    });

    document.getElementById('btnRemoveDreamPhoto')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetPhotoUploader();
    });

    // Color Selector Pills in Modal
    document.querySelectorAll('.dream-color-option').forEach((opt) => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.dream-color-option').forEach((c) => c.classList.remove('active'));
        opt.classList.add('active');
        this.selectedColor = opt.getAttribute('data-color') || 'pink';
      });
    });

    // Category Selector
    document.querySelectorAll('.dream-category-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.dream-category-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.selectedCategory = chip.getAttribute('data-category') || 'romantic';
      });
    });

    // Author type selector
    document.querySelectorAll('.dream-author-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.dream-author-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        this.selectedAuthorType = pill.getAttribute('data-author') || 'Both';
      });
    });

    // Filter Chips on Lower Deck
    document.querySelectorAll('.dream-deck-filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.dream-deck-filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.currentFilter = chip.getAttribute('data-filter') || 'all';
        this.renderAll();
      });
    });

    // Add dream card trigger in deck
    document.getElementById('btnAddDreamSlot')?.addEventListener('click', () => {
      this.openHangModal();
    });
  },

  async loadDreams() {
    try {
      const res = await API.getDreams();
      this.dreams = res?.dreams || [];
      this.renderAll();
    } catch (err) {
      console.warn('Failed to load shared dreams:', err);
    }
  },

  renderAll() {
    this.renderClothesline();
    this.renderLowerDeck();
  },

  getFilteredDreams() {
    const currentUserId = (typeof API.getUserId === 'function' ? API.getUserId() : (window.App?.currentUser?.id || window.App?.currentUser?._id || ''));
    if (this.currentFilter === 'completed') {
      return this.dreams.filter((d) => d.isCompleted);
    }
    if (this.currentFilter === 'mine') {
      return this.dreams.filter((d) => d.authorType === 'You' || (d.createdBy && String(d.createdBy) === String(currentUserId)));
    }
    if (this.currentFilter === 'hers') {
      return this.dreams.filter((d) => d.authorType === 'Her' || (d.createdBy && String(d.createdBy) !== String(currentUserId) && d.authorType !== 'You'));
    }
    return this.dreams;
  },

  renderClothesline() {
    const stringContainer = document.getElementById('clotheslineCardsContainer');
    if (!stringContainer) return;

    if (this.dreams.length === 0) {
      stringContainer.innerHTML = `
        <div class="clothesline-empty-state">
          <span>✨</span>
          <p>No dreams on the line yet. Click <strong>"+ Hang a Dream"</strong> to hang your first wish!</p>
        </div>
      `;
      return;
    }

    // Natural random physical rotations for each card to create authentic hanging feel
    const ROTATIONS = [-2.2, 1.4, -1.2, 2.5, -1.8, 1.8, -2.5, 1.2];

    stringContainer.innerHTML = this.dreams
      .map((dream, index) => {
        const rot = ROTATIONS[index % ROTATIONS.length];
        const isCompleted = !!dream.isCompleted;
        const authorLabel = dream.authorType || 'Both';
        const colorClass = `card-color-${dream.color || 'pink'}`;

        let authorAvatarIcon = '👤';
        if (authorLabel === 'You') authorAvatarIcon = '👦';
        else if (authorLabel === 'Her') authorAvatarIcon = '👧';
        else if (authorLabel === 'Both') authorAvatarIcon = '👩‍❤️‍👨';

        return `
          <div class="hanging-card-wrapper ${isCompleted ? 'is-completed' : ''}" 
               style="--card-rot: ${rot}deg;" 
               data-dream-id="${dream._id}">
            <!-- Wooden Clothespin Peg -->
            <div class="wooden-clothespin">
              <div class="peg-spring"></div>
            </div>

            <!-- Pastel Paper Card -->
            <div class="hanging-paper-card ${colorClass}" title="${isCompleted ? 'Completed Dream! Tap to uncheck' : 'Tap to mark completed'}">
              <div class="card-icon-badge">${this.escapeHtml(dream.icon || '✨')}</div>
              
              <div class="card-title-text">${this.escapeHtml(dream.title)}</div>

              ${dream.imageUrl ? `
                <div class="card-photo-polaroid">
                  <img src="${this.escapeHtml(dream.imageUrl)}" class="polaroid-img" alt="${this.escapeHtml(dream.title)}">
                </div>
              ` : ''}
              
              <div class="card-desc-text">${this.escapeHtml(dream.description || '')}</div>
              
              <div class="card-footer-meta">
                <div class="card-author-pill">
                  <span class="author-icon">${authorAvatarIcon}</span>
                  <span class="author-name">${this.escapeHtml(authorLabel)}</span>
                </div>
                <div class="card-date-badge">
                  ${this.escapeHtml(dream.targetDateFormatted || dream.targetDate || 'Ongoing')}
                </div>
              </div>

              ${isCompleted ? '<div class="completed-ribbon">✓ Fulfilled</div>' : ''}

              <!-- Card Hover Actions -->
              <div class="card-hover-actions">
                <button type="button" class="btn-card-action btn-card-toggle" data-action="toggle" title="${isCompleted ? 'Mark uncompleted' : 'Mark fulfilled'}">
                  ${isCompleted ? '↩️' : '✓'}
                </button>
                <button type="button" class="btn-card-action btn-card-delete" data-action="delete" title="Unpin from clothesline">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    // Attach card event listeners
    stringContainer.querySelectorAll('.hanging-card-wrapper').forEach((wrap) => {
      const id = wrap.getAttribute('data-dream-id');

      wrap.querySelector('.hanging-paper-card')?.addEventListener('click', (e) => {
        if (e.target.closest('.card-hover-actions')) return;
        this.toggleComplete(id);
      });

      wrap.querySelector('.btn-card-toggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleComplete(id);
      });

      wrap.querySelector('.btn-card-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteDream(id);
      });
    });
  },

  renderLowerDeck() {
    const list = document.getElementById('dreamDeckCardsList');
    if (!list) return;

    const filtered = this.getFilteredDreams();

    const cardsHtml = filtered
      .map((dream) => {
        const isCompleted = !!dream.isCompleted;
        const isFav = !!dream.isFavorite;
        const authorLabel = dream.authorType || 'Both';
        const hasImage = !!dream.imageUrl;

        let authorAvatarIcon = '👤';
        if (authorLabel === 'You') authorAvatarIcon = '👦';
        else if (authorLabel === 'Her') authorAvatarIcon = '👧';
        else if (authorLabel === 'Both') authorAvatarIcon = '👩‍❤️‍👨';

        const imageHeaderHtml = hasImage
          ? `
            <div class="deck-card-image-wrap">
              <img src="${this.escapeHtml(dream.imageUrl)}" alt="${this.escapeHtml(dream.title)}" class="deck-card-img">
              <button type="button" class="deck-card-fav-btn ${isFav ? 'active' : ''}" title="Favorite Dream" data-action="favorite">
                ${isFav ? '❤️' : '🤍'}
              </button>
              <div class="deck-card-category-tag">${this.escapeHtml(dream.category || 'romantic')}</div>
            </div>
          `
          : `
            <div class="deck-card-no-image card-color-${this.escapeHtml(dream.color || 'pink')}">
              <span class="deck-card-custom-icon">${this.escapeHtml(dream.icon || '✨')}</span>
              <button type="button" class="deck-card-fav-btn ${isFav ? 'active' : ''}" title="Favorite Dream" data-action="favorite">
                ${isFav ? '❤️' : '🤍'}
              </button>
              <div class="deck-card-category-tag">${this.escapeHtml(dream.category || 'romantic')}</div>
            </div>
          `;

        return `
          <div class="dream-deck-card ${isCompleted ? 'is-completed' : ''}" data-dream-id="${dream._id}">
            ${imageHeaderHtml}
            
            <div class="deck-card-body">
              <h4 class="deck-card-title">${this.escapeHtml(dream.title)}</h4>
              <p class="deck-card-desc">${this.escapeHtml(dream.description || '')}</p>
              
              <div class="deck-card-footer">
                <div class="deck-card-author">
                  <span>${authorAvatarIcon}</span>
                  <strong>${this.escapeHtml(authorLabel)}</strong>
                </div>
                <div class="deck-card-date">
                  ${this.escapeHtml(dream.targetDateFormatted || dream.targetDate || 'Ongoing')}
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const addSlotHtml = `
      <div class="dream-deck-add-slot" id="btnAddDreamSlot" title="Hang a new dream">
        <div class="add-slot-content">
          <span class="add-slot-icon">✨</span>
          <span class="add-slot-text">Add your dream here</span>
          <span class="add-slot-sub">♡</span>
        </div>
      </div>
    `;

    list.innerHTML = cardsHtml + addSlotHtml;

    // Attach favorites click
    list.querySelectorAll('.deck-card-fav-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.dream-deck-card');
        const id = card?.getAttribute('data-dream-id');
        if (id) this.toggleFavorite(id);
      });
    });

    list.querySelector('#btnAddDreamSlot')?.addEventListener('click', () => {
      this.openHangModal();
    });
  },

  openHangModal() {
    const modal = document.getElementById('hangDreamModal');
    if (!modal) return;
    document.getElementById('inputDreamTitle').value = '';
    document.getElementById('inputDreamDesc').value = '';
    document.getElementById('inputDreamDate').value = '';
    this.selectedColor = 'pink';
    this.selectedCategory = 'romantic';
    this.selectedAuthorType = 'Both';

    document.querySelectorAll('.dream-color-option').forEach((c) => c.classList.remove('active'));
    document.querySelector('.dream-color-option[data-color="pink"]')?.classList.add('active');

    document.querySelectorAll('.dream-category-chip').forEach((c) => c.classList.remove('active'));
    document.querySelector('.dream-category-chip[data-category="romantic"]')?.classList.add('active');

    document.querySelectorAll('.dream-author-pill').forEach((p) => p.classList.remove('active'));
    document.querySelector('.dream-author-pill[data-author="Both"]')?.classList.add('active');

    this.resetPhotoUploader();

    modal.style.display = 'flex';
  },

  resetPhotoUploader() {
    this.selectedPhotoFile = null;
    const photoInput = document.getElementById('inputDreamPhotoFile');
    if (photoInput) photoInput.value = '';
    const previewImg = document.getElementById('dreamPhotoPreview');
    if (previewImg) previewImg.src = '';
    const previewWrap = document.getElementById('dreamPhotoPreviewWrap');
    if (previewWrap) previewWrap.style.display = 'none';
    const placeholder = document.getElementById('dreamPhotoPlaceholder');
    if (placeholder) placeholder.style.display = 'flex';
  },

  closeHangModal() {
    const modal = document.getElementById('hangDreamModal');
    if (modal) modal.style.display = 'none';
    this.resetPhotoUploader();
  },

  async saveNewDream() {
    if (this.isSubmitting) return;

    const title = document.getElementById('inputDreamTitle').value.trim();
    const desc = document.getElementById('inputDreamDesc').value.trim();
    const dateVal = document.getElementById('inputDreamDate').value.trim();
    const icon = document.getElementById('inputDreamIcon')?.value.trim() || '✨';

    if (!title) {
      if (window.HeartlyDialog) {
        await HeartlyDialog.alert('Please give your dream a title ♡', 'Shared Dreams');
      } else {
        alert('Please give your dream a title ♡');
      }
      return;
    }

    this.isSubmitting = true;
    const submitBtn = document.getElementById('btnSaveHangDream');
    const originalText = submitBtn ? submitBtn.innerHTML : 'Pin to Clothesline 🪢';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Hanging Dream...';
    }

    try {
      let uploadedImageUrl = '';
      if (this.selectedPhotoFile) {
        if (submitBtn) submitBtn.innerText = 'Uploading Photo...';
        const formData = new FormData();
        formData.append('photo', this.selectedPhotoFile);
        const uploadRes = await API.uploadDreamPhoto(formData);
        if (uploadRes?.imageUrl || uploadRes?.url) {
          uploadedImageUrl = uploadRes.imageUrl || uploadRes.url;
        }
      }

      let dateFormatted = dateVal;
      if (dateVal) {
        try {
          const d = new Date(dateVal);
          if (!isNaN(d.getTime())) {
            dateFormatted = d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
          }
        } catch (e) {}
      }

      const dreamData = {
        title,
        description: desc,
        category: this.selectedCategory,
        color: this.selectedColor,
        icon,
        authorType: this.selectedAuthorType,
        targetDate: dateVal,
        targetDateFormatted: dateFormatted || 'Someday ♡',
        imageUrl: uploadedImageUrl || '',
      };

      const res = await API.createDream(dreamData);
      if (res?.dream) {
        const exists = this.dreams.some((d) => String(d._id) === String(res.dream._id));
        if (!exists) {
          this.dreams.push(res.dream);
          this.renderAll();
          window.SocketManager?.emitDreamCreated(res.dream);
        }
      }
      this.closeHangModal();
    } catch (err) {
      console.error('Failed to create dream:', err);
      if (window.HeartlyDialog) {
        await HeartlyDialog.alert('Failed to hang dream: ' + err.message, 'Shared Dreams');
      } else {
        alert('Failed to hang dream: ' + err.message);
      }
    } finally {
      this.isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    }
  },

  async toggleComplete(id) {
    const dream = this.dreams.find((d) => String(d._id) === String(id));
    if (!dream) return;

    try {
      const res = await API.toggleDreamCompleted(id);
      if (res?.dream) {
        dream.isCompleted = res.dream.isCompleted;
        dream.completedAt = res.dream.completedAt;
        this.renderAll();
        window.SocketManager?.emitDreamUpdated(dream);

        // Celebration chime & particle burst if just completed
        if (dream.isCompleted && window.ChatManager) {
          window.ChatManager.playMagicChime('fireworks');
          window.ChatManager.launchCanvasFireworks();
        }
      }
    } catch (err) {
      console.error('Failed to toggle dream completion:', err);
    }
  },

  async toggleFavorite(id) {
    const dream = this.dreams.find((d) => String(d._id) === String(id));
    if (!dream) return;

    try {
      const res = await API.toggleDreamFavorite(id);
      if (res?.dream) {
        dream.isFavorite = res.dream.isFavorite;
        this.renderAll();
        window.SocketManager?.emitDreamUpdated(dream);
      }
    } catch (err) {
      console.error('Failed to toggle dream favorite:', err);
    }
  },

  async deleteDream(id) {
    let confirmed = false;
    if (window.HeartlyDialog) {
      confirmed = await HeartlyDialog.confirm('Unpin this dream from the clothesline?', 'Shared Dreams');
    } else {
      confirmed = confirm('Unpin this dream from the clothesline?');
    }
    if (!confirmed) return;

    try {
      await API.deleteDream(id);
      this.dreams = this.dreams.filter((d) => String(d._id) !== String(id));
      this.renderAll();
      window.SocketManager?.emitDreamDeleted(id);
    } catch (err) {
      console.error('Failed to delete dream:', err);
    }
  },

  // Socket handlers for real-time partner sync
  handleRemoteDreamCreated(dream) {
    if (!dream) return;
    const exists = this.dreams.some((d) => String(d._id) === String(dream._id));
    if (!exists) {
      this.dreams.push(dream);
      this.renderAll();
    }
  },

  handleRemoteDreamUpdated(dream) {
    if (!dream) return;
    const idx = this.dreams.findIndex((d) => String(d._id) === String(dream._id));
    if (idx !== -1) {
      this.dreams[idx] = dream;
      this.renderAll();
    }
  },

  handleRemoteDreamDeleted(dreamId) {
    if (!dreamId) return;
    this.dreams = this.dreams.filter((d) => String(d._id) !== String(dreamId));
    this.renderAll();
  },

  handleRemoteDreamsCleared() {
    this.dreams = [];
    this.renderAll();
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  },
};

window.DreamsManager = DreamsManager;
