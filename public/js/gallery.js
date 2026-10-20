const GalleryManager = {
  items: [],
  currentLightboxIndex: 0,
  hasInitializedLightbox: false,
  currentFilter: 'all', // 'all' or specific genre
  activeContextMenuCardId: null,

  async loadGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    if (!this.hasInitializedLightbox) {
      this.initLightbox();
      this.initContextMenu();
      this.hasInitializedLightbox = true;
    }

    try {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">Loading our cherished memories... ❤️</div>';
      const data = await API.getGallery();
      this.items = data.items || [];
      this.render();
    } catch (err) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: #e74c3c;">Failed to load gallery: ${err.message}</div>`;
    }
  },

  renderGenreFilterBar() {
    const scrollContainer = document.getElementById('genreFilterScroll');
    if (!scrollContainer) return;

    // Extract unique non-empty genres
    const genreMap = {};
    this.items.forEach((item) => {
      const g = (item.genre || '').trim();
      if (g) {
        genreMap[g] = (genreMap[g] || 0) + 1;
      }
    });

    const uniqueGenres = Object.keys(genreMap).sort();

    let html = `
      <button type="button" class="genre-filter-chip ${this.currentFilter === 'all' ? 'active' : ''}" onclick="GalleryManager.setFilter('all')">
        ✨ All Memories (${this.items.length})
      </button>
    `;

    uniqueGenres.forEach((genre) => {
      const isActive = this.currentFilter.toLowerCase() === genre.toLowerCase();
      html += `
        <button type="button" class="genre-filter-chip ${isActive ? 'active' : ''}" onclick="GalleryManager.setFilter('${this.escapeHtml(genre)}')">
          🏷️ ${this.escapeHtml(genre)} (${genreMap[genre]})
        </button>
      `;
    });

    scrollContainer.innerHTML = html;
  },

  setFilter(genre) {
    this.currentFilter = genre;
    this.render();
  },

  render() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    this.renderGenreFilterBar();

    // Filter items based on current genre filter
    const displayItems = this.currentFilter === 'all'
      ? this.items
      : this.items.filter((i) => (i.genre || '').trim().toLowerCase() === this.currentFilter.toLowerCase());

    if (this.items.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 60px 20px; background: white; border-radius: 16px; border: 1px dashed var(--border);">
          <div style="font-size: 48px; margin-bottom: 12px;">📸</div>
          <h3 style="font-size: 18px; color: var(--primary); margin-bottom: 6px;">Your Shared Gallery is Empty</h3>
          <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 16px;">Add your first photo memory with a date and caption!</p>
          <button class="btn-primary" style="max-width: 200px; margin: 0 auto;" onclick="document.getElementById('btnOpenUploadModal').click()">➕ Add Memory</button>
        </div>
      `;
      return;
    }

    if (displayItems.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 50px 20px; background: white; border-radius: 16px; border: 1px dashed var(--border);">
          <div style="font-size: 38px; margin-bottom: 10px;">🏷️</div>
          <h3 style="font-size: 17px; color: var(--primary); margin-bottom: 6px;">No photos under "${this.escapeHtml(this.currentFilter)}"</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">Right-click any photo to assign it to this genre, or view all memories.</p>
          <button class="btn-secondary" style="max-width: 180px; margin: 0 auto;" onclick="GalleryManager.setFilter('all')">Show All Photos</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = displayItems.map((item) => this.renderMemoryCard(item)).join('');
  },

  renderMemoryCard(item) {
    const formattedDate = new Date(item.memoryDate).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const heartCount = (item.reactions || []).filter((r) => r.reactionType === '❤️').length;
    const originalIndex = this.items.findIndex((i) => i._id === item._id);

    const commentsHtml = (item.comments || [])
      .map(
        (c) => `
        <div class="comment-row">
          <span class="comment-author">${this.escapeHtml(c.authorName)}:</span>
          <span>${this.escapeHtml(c.text)}</span>
        </div>
      `
      )
      .join('');

    const genreBadgeHtml = item.genre
      ? `<div class="memory-genre-tag" title="Filter by ${this.escapeHtml(item.genre)}" onclick="event.stopPropagation(); GalleryManager.setFilter('${this.escapeHtml(item.genre)}')">🏷️ ${this.escapeHtml(item.genre)}</div>`
      : '';

    return `
      <div class="memory-card" id="card-${item._id}" 
           oncontextmenu="GalleryManager.openCardContextMenu(event, '${item._id}')"
           ondblclick="GalleryManager.handleCardDoubleClick(event, '${item._id}')"
           title="Double-click to enlarge • Hover to view comments">
        
        <!-- Photo Media Area -->
        <div class="memory-img-wrap" onclick="GalleryManager.openLightbox(${originalIndex}, this.querySelector('img'))" title="Double click or click to enlarge">
          <img class="memory-img" src="/api/gallery/media/${item.gridFSFileId}" alt="${this.escapeHtml(item.caption)}" loading="lazy">
          <div class="memory-enlarge-hint">
            🔍 Double-click to enlarge
          </div>
        </div>
        
        <!-- Resting Initial Bar: Shows Image and Uploaded Date (+ Genre tag) -->
        <div class="memory-initial-bar">
          <div class="memory-date">📅 ${formattedDate}</div>
          ${genreBadgeHtml}
        </div>

        <!-- Expand-Up Drawer: Expands on hover / focus-within -->
        <div class="memory-hover-drawer">
          <p class="memory-caption" style="cursor: pointer;" onclick="GalleryManager.openLightbox(${originalIndex})">${this.escapeHtml(item.caption || 'A beautiful memory together ❤️')}</p>
          <div class="memory-author">Added by ${this.escapeHtml(item.authorName)} ${item.location ? `• 📍 ${this.escapeHtml(item.location)}` : ''}</div>
          
          <!-- Comments Container -->
          <div class="comments-container" id="comments-${item._id}">
            ${commentsHtml || '<div style="font-size:12px; color:#aaa; font-style:italic;">No comments yet. Say something sweet!</div>'}
          </div>

          <!-- Add Comment Form -->
          <form class="comment-input-row" onsubmit="GalleryManager.handleCommentSubmit(event, '${item._id}')">
            <input type="text" class="comment-input" placeholder="Write a comment..." required>
            <button type="submit" class="comment-submit">Send</button>
          </form>

          <div class="memory-footer">
            <div style="display:flex; align-items:center; gap:8px;">
              <button class="reaction-btn" onclick="GalleryManager.handleReaction('${item._id}')" title="Like memory">
                ❤️ <span>${heartCount || 0}</span>
              </button>
              <button class="reaction-btn" style="color: #e74c3c; border-color: #ffd1d8;" onclick="GalleryManager.handleDelete('${item._id}')" title="Delete memory">
                🗑️
              </button>
            </div>
            <button class="btn-secondary" style="margin-top:0; padding:4px 10px; font-size:11px; border-radius:12px;" onclick="GalleryManager.openCardContextMenu(event, '${item._id}')" title="Add / Edit Genre">
              🏷️ Genre
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // ==================== DOUBLE CLICK ENLARGED VIEWER ====================
  handleCardDoubleClick(event, galleryId) {
    // Prevent double clicking on comment inputs or buttons from triggering enlarge
    if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName)) return;
    event.preventDefault();
    event.stopPropagation();

    const originalIndex = this.items.findIndex((i) => i._id === galleryId);
    if (originalIndex !== -1) {
      const card = document.getElementById(`card-${galleryId}`);
      const img = card ? card.querySelector('.memory-img') : null;
      this.openLightbox(originalIndex, img);
    }
  },

  // ==================== RIGHT CLICK GENRE CONTEXT MENU ====================
  initContextMenu() {
    const menu = document.getElementById('galleryContextMenu');
    const input = document.getElementById('genreInputField');
    const btnSave = document.getElementById('btnSaveGenre');
    const suggestions = document.getElementById('genreSuggestions');
    const grid = document.getElementById('galleryGrid');

    if (!menu) return;

    // Event delegation on gallery grid to catch all right-clicks on any part of memory cards
    grid?.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('.memory-card');
      if (card) {
        e.preventDefault();
        e.stopPropagation();
        const cardId = card.id.replace('card-', '');
        this.openCardContextMenu(e, cardId);
      }
    });

    btnSave?.addEventListener('click', () => {
      if (this.activeContextMenuCardId) {
        this.saveCardGenre(this.activeContextMenuCardId, input.value.trim());
      }
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (this.activeContextMenuCardId) {
          this.saveCardGenre(this.activeContextMenuCardId, input.value.trim());
        }
      }
    });

    suggestions?.querySelectorAll('.genre-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const selectedGenre = chip.getAttribute('data-genre');
        if (input) input.value = selectedGenre;
        if (this.activeContextMenuCardId) {
          this.saveCardGenre(this.activeContextMenuCardId, selectedGenre);
        }
      });
    });

    // Close context menu on outside click or escape
    window.addEventListener('mousedown', (e) => {
      if (menu.style.display !== 'none' && !menu.contains(e.target)) {
        menu.style.display = 'none';
        this.activeContextMenuCardId = null;
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.style.display !== 'none') {
        menu.style.display = 'none';
        this.activeContextMenuCardId = null;
      }
    });
  },

  openCardContextMenu(event, galleryId) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    this.activeContextMenuCardId = galleryId;
    const item = this.items.find((i) => i._id === galleryId);
    const menu = document.getElementById('galleryContextMenu');
    const input = document.getElementById('genreInputField');

    if (!menu) return;

    if (input) {
      input.value = item?.genre || '';
    }

    menu.style.display = 'block';

    // Position menu near cursor using fixed viewport coordinates
    const menuWidth = 270;
    const menuHeight = 240;
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

    setTimeout(() => {
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
  },

  async saveCardGenre(galleryId, genre) {
    try {
      const res = await API.updateMemoryGenre(galleryId, genre);
      const menu = document.getElementById('galleryContextMenu');
      if (menu) menu.style.display = 'none';

      // Update local item
      const item = this.items.find((i) => i._id === galleryId);
      if (item) {
        item.genre = res.item?.genre || genre;
      }

      this.render();
      this.activeContextMenuCardId = null;
      window.SocketManager?.emitGalleryGenreUpdated(galleryId, genre);
    } catch (err) {
      HeartlyDialog.alert('Failed to update genre: ' + err.message, 'Genre');
    }
  },

  // ==================== LIGHTBOX ENLARGED VIEWER ====================
  initLightbox() {
    const modal = document.getElementById('lightboxModal');
    const closeBtn = document.getElementById('lightboxCloseBtn');
    const prevBtn = document.getElementById('lightboxPrevBtn');
    const nextBtn = document.getElementById('lightboxNextBtn');
    const deleteBtn = document.getElementById('lightboxDeleteBtn');

    closeBtn?.addEventListener('click', () => this.closeLightbox());
    prevBtn?.addEventListener('click', () => this.prevLightbox());
    nextBtn?.addEventListener('click', () => this.nextLightbox());

    deleteBtn?.addEventListener('click', () => {
      const item = this.items[this.currentLightboxIndex];
      if (item) {
        this.handleDelete(item._id);
      }
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeLightbox();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (!modal?.classList.contains('active')) return;
      if (e.key === 'Escape') this.closeLightbox();
      if (e.key === 'ArrowLeft') this.prevLightbox();
      if (e.key === 'ArrowRight') this.nextLightbox();
    });
  },

  openLightbox(index, sourceImgElement = null) {
    if (!this.items || this.items.length === 0) return;
    this.currentLightboxIndex = index;
    const item = this.items[index];
    if (!item) return;

    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImg');
    const dateBadge = document.getElementById('lightboxDateBadge');
    const captionText = document.getElementById('lightboxCaptionText');
    const authorText = document.getElementById('lightboxAuthorText');
    const locText = document.getElementById('lightboxLocationText');

    const formattedDate = new Date(item.memoryDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const updateDOM = () => {
      img.src = `/api/gallery/media/${item.gridFSFileId}`;
      dateBadge.innerText = `📅 ${formattedDate}${item.genre ? ` • 🏷️ ${item.genre}` : ''}`;
      this.typewriteCaption(captionText, item.caption || 'A beautiful memory together ❤️', 22);
      authorText.innerText = `Added by ${item.authorName}`;

      if (item.location) {
        locText.style.display = 'inline';
        locText.innerText = `📍 ${item.location}`;
      } else {
        locText.style.display = 'none';
      }

      modal?.classList.remove('chat-photo-mode');
      if (modal) modal.style.display = 'flex';
      modal?.classList.add('active');
    };

    if (document.startViewTransition) {
      if (sourceImgElement) sourceImgElement.style.viewTransitionName = 'hero-lightbox';
      if (img) img.style.viewTransitionName = 'hero-lightbox';
      const transition = document.startViewTransition(updateDOM);
      transition.finished.finally(() => {
        if (sourceImgElement) sourceImgElement.style.viewTransitionName = '';
        if (img) img.style.viewTransitionName = '';
      });
    } else {
      updateDOM();
    }
  },

  currentTypewriterTimer: null,

  typewriteCaption(targetEl, fullText, speed = 22) {
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
      }
    }, speed);
  },

  closeLightbox() {
    if (this.currentTypewriterTimer) {
      clearInterval(this.currentTypewriterTimer);
      this.currentTypewriterTimer = null;
    }
    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImg');
    if (!modal) return;

    const updateDOM = () => {
      modal.classList.remove('active');
      modal.classList.remove('chat-photo-mode');
      modal.style.display = 'none';
    };

    if (document.startViewTransition) {
      if (img) img.style.viewTransitionName = 'hero-lightbox';
      const transition = document.startViewTransition(updateDOM);
      transition.finished.finally(() => {
        if (img) img.style.viewTransitionName = '';
      });
    } else {
      updateDOM();
    }
  },

  nextLightbox() {
    if (this.items.length <= 1) return;
    this.currentLightboxIndex = (this.currentLightboxIndex + 1) % this.items.length;
    this.openLightbox(this.currentLightboxIndex);
  },

  prevLightbox() {
    if (this.items.length <= 1) return;
    this.currentLightboxIndex = (this.currentLightboxIndex - 1 + this.items.length) % this.items.length;
    this.openLightbox(this.currentLightboxIndex);
  },

  // ==================== DELETE MEMORY ====================
  async handleDelete(galleryId) {
    const item = this.items.find((i) => i._id === galleryId);
    const captionPreview = item?.caption ? `"${item.caption.substring(0, 30)}..."` : 'this photo';

    const confirmed = await HeartlyDialog.confirm(
      `Are you sure you want to delete ${captionPreview} from our shared gallery? This will permanently remove it for both of you.`,
      'Delete Memory'
    );

    if (confirmed) {
      try {
        await API.deleteMemory(galleryId);
        this.items = this.items.filter((i) => i._id !== galleryId);

        const modal = document.getElementById('lightboxModal');
        if (modal?.classList.contains('active')) {
          if (this.items.length === 0) {
            this.closeLightbox();
          } else {
            this.currentLightboxIndex = Math.min(this.currentLightboxIndex, this.items.length - 1);
            this.openLightbox(this.currentLightboxIndex);
          }
        }

        this.render();
        window.SocketManager?.emitGalleryDeleted(galleryId);
      } catch (err) {
        HeartlyDialog.alert('Failed to delete memory: ' + err.message, 'Heartly');
      }
    }
  },

  async handleCommentSubmit(event, galleryId) {
    event.preventDefault();
    const input = event.target.querySelector('input');
    const text = input.value.trim();
    if (!text) return;

    try {
      const res = await API.addComment(galleryId, text);
      input.value = '';
      input.focus();
      const item = this.items.find((i) => i._id === galleryId);
      if (item) {
        item.comments = res.comments;
        const container = document.getElementById(`comments-${galleryId}`);
        if (container) {
          container.innerHTML = item.comments
            .map(
              (c) => `
              <div class="comment-row">
                <span class="comment-author">${this.escapeHtml(c.authorName)}:</span>
                <span>${this.escapeHtml(c.text)}</span>
              </div>
            `
            )
            .join('');
        }
      }
      if (res?.comment && window.SocketManager) {
        window.SocketManager.emitGalleryCommentAdded(galleryId, res.comment);
      }
    } catch (err) {
      HeartlyDialog.alert('Error adding comment: ' + err.message, 'Heartly');
    }
  },

  async handleReaction(galleryId) {
    try {
      const res = await API.toggleReaction(galleryId, '❤️');
      const item = this.items.find((i) => i._id === galleryId);
      if (item) {
        item.reactions = res.reactions;
        const card = document.getElementById(`card-${galleryId}`);
        if (card) {
          const btn = card.querySelector('.reaction-btn span');
          if (btn) {
            const count = (res.reactions || []).filter((r) => r.reactionType === '❤️').length;
            btn.innerText = count;
          }
        }
      }
      if (res?.reactions && window.SocketManager) {
        window.SocketManager.emitGalleryReaction(galleryId, res.reactions);
      }
    } catch (err) {
      console.error('Reaction failed:', err);
    }
  },

  // ==================== REAL-TIME REMOTE SOCKET HANDLERS ====================
  handleRemoteMemoryCreated(memory) {
    if (!memory) return;
    const exists = this.items.some((i) => i._id === memory._id);
    if (!exists) {
      this.items.unshift(memory);
      this.render();
    }
  },

  handleRemoteMemoryDeleted(galleryId) {
    if (!galleryId) return;
    this.items = this.items.filter((i) => i._id !== galleryId);
    const modal = document.getElementById('lightboxModal');
    if (modal?.classList.contains('active')) {
      if (this.items.length === 0) {
        this.closeLightbox();
      } else {
        this.currentLightboxIndex = Math.min(this.currentLightboxIndex, this.items.length - 1);
        this.openLightbox(this.currentLightboxIndex);
      }
    }
    this.render();
  },

  handleRemoteCommentAdded(galleryId, comment) {
    if (!galleryId || !comment) return;
    const item = this.items.find((i) => i._id === galleryId);
    if (item) {
      if (!item.comments) item.comments = [];
      const exists = item.comments.some((c) => (c._id && c._id === comment._id) || (c.createdAt === comment.createdAt && c.text === comment.text));
      if (!exists) {
        item.comments.push(comment);
        const container = document.getElementById(`comments-${galleryId}`);
        if (container) {
          container.innerHTML = item.comments
            .map(
              (c) => `
              <div class="comment-row">
                <span class="comment-author">${this.escapeHtml(c.authorName)}:</span>
                <span>${this.escapeHtml(c.text)}</span>
              </div>
            `
            )
            .join('');
        }
      }
    }
  },

  handleRemoteReaction(galleryId, reactions) {
    if (!galleryId || !reactions) return;
    const item = this.items.find((i) => i._id === galleryId);
    if (item) {
      item.reactions = reactions;
      const card = document.getElementById(`card-${galleryId}`);
      if (card) {
        const btn = card.querySelector('.reaction-btn span');
        if (btn) {
          const count = reactions.filter((r) => r.reactionType === '❤️').length;
          btn.innerText = count;
        }
      }
    }
  },

  handleRemoteGenreUpdated(galleryId, genre) {
    if (!galleryId) return;
    const item = this.items.find((i) => i._id === galleryId);
    if (item) {
      item.genre = genre;
      this.render();
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  },
};

window.GalleryManager = GalleryManager;
