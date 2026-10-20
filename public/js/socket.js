const SocketManager = {
  socket: null,

  init(token) {
    if (this.socket) {
      this.socket.disconnect();
    }

    if (!token) return;

    this.socket = io({
      auth: { token },
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to real-time sync server');
      // Query partner status immediately upon connect/reconnect
      this.socket.emit('presence:query');
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });

    // Partner presence
    this.socket.on('partner:presence', (data) => {
      this.updatePartnerPresenceUI(data);

      // If app is open and not yet marked fully paired, refresh space info
      if (window.App && (!window.App.currentSpace || !window.App.currentSpace.isFullyPaired)) {
        window.App.refreshSpaceInfo();
      }
    });

    // Space Fully Paired & Reserved Broadcast
    this.socket.on('space:paired', (data) => {
      if (window.App) {
        window.App.handleSpacePaired(data);
      }
    });

    // Heartbeat pulse received
    this.socket.on('presence:heartbeat', (data) => {
      this.triggerHeartbeatEffect(data.fromName);
    });

    // Real-time Scratchbook updates
    this.socket.on('scratch:stroke_live', (data) => {
      if (window.ScratchbookManager) {
        window.ScratchbookManager.renderLiveStroke(data);
      }
    });

    this.socket.on('scratch:element_upsert', (data) => {
      if (window.ScratchbookManager) {
        const element = data.element || data;
        const bookId = data.scratchbookId;
        window.ScratchbookManager.applyRemoteElement(element, bookId);
      }
    });

    this.socket.on('scratch:element_delete', (data) => {
      if (window.ScratchbookManager) {
        const elementId = data.elementId || data;
        const bookId = data.scratchbookId;
        window.ScratchbookManager.removeElementFromDOM(elementId, bookId);
      }
    });

    this.socket.on('scratch:background_change', (data) => {
      if (window.ScratchbookManager) {
        window.ScratchbookManager.applyRemoteBackground(data.scratchbookId, data.backgroundColor);
      }
    });

    this.socket.on('scratch:book_rename', (data) => {
      if (window.ScratchbookManager) {
        window.ScratchbookManager.applyRemoteRename(data.scratchbookId, data.title);
      }
    });

    this.socket.on('scratch:book_switched', (data) => {
      if (window.ScratchbookManager) {
        window.ScratchbookManager.handlePartnerSwitchedBook(data);
      }
    });

    this.socket.on('scratch:clear', (data) => {
      if (window.ScratchbookManager) {
        window.ScratchbookManager.handlePartnerClearedCanvas(data.scratchbookId);
      }
    });

    // Partner activity - keep status cleanly as online (avoid showing "is drawing...")
    this.socket.on('partner:activity', (data) => {
      this.updatePartnerPresenceUI({ name: data.name, status: 'online' });
    });

    // Real-Time Chat Message Received
    this.socket.on('chat:message', (message) => {
      if (window.ChatManager) {
        window.ChatManager.appendMessage(message);
      }
      this.updatePartnerPresenceUI({ name: message.senderName, status: 'online' });
      if (window.FloatingChatPreview) {
        window.FloatingChatPreview.showIncomingMessage(message);
      }
    });

    // Partner Chat Typing Indicator
    this.socket.on('chat:typing', (data) => {
      if (window.ChatManager) {
        window.ChatManager.setPartnerTyping(data.isTyping, data.name);
      }
      if (data.isTyping) {
        this.updatePartnerPresenceUI({ name: data.name, status: 'online' });
      }
    });

    // Partner Chat Message Reaction
    this.socket.on('chat:reaction', (data) => {
      if (window.ChatManager) {
        window.ChatManager.handleReactionUpdate(data);
      }
      this.updatePartnerPresenceUI({ status: 'online' });
    });

    // Partner Read Receipts (Seen 💗💗)
    this.socket.on('chat:read', (data) => {
      if (window.ChatManager) {
        window.ChatManager.handlePartnerRead(data);
      }
    });

    // Partner Message Deleted (Unsend / Delete for Everyone)
    this.socket.on('chat:message_deleted', (data) => {
      if (window.ChatManager) {
        window.ChatManager.handleMessageDeleted(data);
      }
    });

    // Partner Pinned/Unpinned Message
    this.socket.on('chat:pin_toggled', (data) => {
      if (window.ChatManager) {
        window.ChatManager.handlePinToggled(data);
      }
    });

    // Partner Wallpaper Changed
    this.socket.on('chat:wallpaper_change', (data) => {
      if (window.ChatManager) {
        window.ChatManager.handleWallpaperChange(data);
      }
    });

    // Partner Magic Words Updated
    this.socket.on('chat:magic_words_update', (data) => {
      if (window.ChatManager) {
        window.ChatManager.handleMagicWordsUpdate(data);
      }
    });

    // Partner Triggered Particle Burst
    this.socket.on('chat:trigger_burst', (data) => {
      if (window.ChatManager) {
        window.ChatManager.triggerParticleBurst(data.effect, data.phrase, data.senderName);
      }
    });

    // Date Proposed by Partner
    this.socket.on('date:proposed', (datePlan) => {
      if (window.DatesManager) {
        window.DatesManager.handleIncomingDateProposal(datePlan);
      }
    });

    // Date Responded (Accepted / Declined)
    this.socket.on('date:responded', (data) => {
      if (window.DatesManager) {
        window.DatesManager.handleDateResponse(data);
      }
    });

    // Date Deleted / Cancelled by Partner
    this.socket.on('date:deleted', (data) => {
      if (window.DatesManager) {
        window.DatesManager.handleDateDeleted(data.dateId);
      }
    });

    // Real-time Shared Dreams Events
    this.socket.on('dream:created', (data) => {
      if (window.DreamsManager) {
        window.DreamsManager.handleRemoteDreamCreated(data.dream);
      }
    });

    this.socket.on('dream:updated', (data) => {
      if (window.DreamsManager) {
        window.DreamsManager.handleRemoteDreamUpdated(data.dream);
      }
    });

    this.socket.on('dream:deleted', (data) => {
      if (window.DreamsManager) {
        window.DreamsManager.handleRemoteDreamDeleted(data.dreamId);
      }
    });

    this.socket.on('dreams:cleared', () => {
      if (window.DreamsManager) {
        window.DreamsManager.handleRemoteDreamsCleared();
      }
    });

    // Real-time Avatar Update (Broadcast when partner updates their photo)
    this.socket.on('user:avatar_updated', (data) => {
      if (window.App) {
        window.App.handleAvatarUpdated(data);
      }
    });

    // Real-Time Memory Gallery Events
    this.socket.on('gallery:created', (data) => {
      if (window.GalleryManager) {
        window.GalleryManager.handleRemoteMemoryCreated(data.memory);
      }
    });

    this.socket.on('gallery:deleted', (data) => {
      if (window.GalleryManager) {
        window.GalleryManager.handleRemoteMemoryDeleted(data.galleryId);
      }
    });

    this.socket.on('gallery:comment_added', (data) => {
      if (window.GalleryManager) {
        window.GalleryManager.handleRemoteCommentAdded(data.galleryId, data.comment);
      }
    });

    this.socket.on('gallery:reaction', (data) => {
      if (window.GalleryManager) {
        window.GalleryManager.handleRemoteReaction(data.galleryId, data.reactions);
      }
    });

    this.socket.on('gallery:genre_updated', (data) => {
      if (window.GalleryManager) {
        window.GalleryManager.handleRemoteGenreUpdated(data.galleryId, data.genre);
      }
    });
  },

  sendChatMessage(message) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat:send', message);
    }
  },

  sendChatReaction(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat:reaction', data);
    }
  },

  sendChatTyping(isTyping) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat:typing', isTyping);
    }
  },

  sendChatRead(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat:read', data);
    }
  },

  sendChatMessageDeleted(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat:message_deleted', data);
    }
  },

  sendChatPinToggled(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat:pin_toggled', data);
    }
  },

  sendChatWallpaperChange(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat:wallpaper_change', data);
    }
  },

  sendMagicWordsUpdate(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat:magic_words_update', data);
    }
  },

  sendTriggerBurst(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat:trigger_burst', data);
    }
  },

  emitDateProposed(datePlan) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('date:proposed', datePlan);
    }
  },

  emitDateResponded(datePlan, action, responderName) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('date:responded', { datePlan, action, responderName });
    }
  },

  emitDateDeleted(dateId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('date:deleted', { dateId });
    }
  },

  sendHeartbeat() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('presence:heartbeat');
      this.triggerHeartbeatEffect('You');
    }
  },

  sendActivity(action) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('partner:activity', { action });
    }
  },

  emitStrokeLive(points, color, strokeWidth, scratchbookId = null) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('scratch:stroke_live', { points, color, strokeWidth, scratchbookId });
    }
  },

  emitScratchClear(scratchbookId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('scratch:clear', { scratchbookId });
    }
  },

  emitElementUpsert(element, scratchbookId = null) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('scratch:element_upsert', { element, scratchbookId });
    }
  },

  emitElementDelete(elementId, scratchbookId = null) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('scratch:element_delete', { elementId, scratchbookId });
    }
  },

  emitScratchBackgroundChange(scratchbookId, backgroundColor) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('scratch:background_change', { scratchbookId, backgroundColor });
    }
  },

  emitScratchBookRename(scratchbookId, title) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('scratch:book_rename', { scratchbookId, title });
    }
  },

  emitScratchBookSwitched(scratchbookId, title) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('scratch:book_switched', { scratchbookId, title });
    }
  },

  // Avatar Emitter
  emitAvatarUpdated(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('user:avatar_updated', data);
    }
  },

  // Dreams Emitters
  emitDreamCreated(dream) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('dream:created', { dream });
    }
  },

  emitDreamUpdated(dream) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('dream:updated', { dream });
    }
  },

  emitDreamDeleted(dreamId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('dream:deleted', { dreamId });
    }
  },

  emitDreamsCleared() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('dreams:cleared');
    }
  },

  // Gallery Emitters
  emitGalleryCreated(memory) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('gallery:created', { memory });
    }
  },

  emitGalleryDeleted(galleryId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('gallery:deleted', { galleryId });
    }
  },

  emitGalleryCommentAdded(galleryId, comment) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('gallery:comment_added', { galleryId, comment });
    }
  },

  emitGalleryReaction(galleryId, reactions) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('gallery:reaction', { galleryId, reactions });
    }
  },

  emitGalleryGenreUpdated(galleryId, genre) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('gallery:genre_updated', { galleryId, genre });
    }
  },

  playHeartbeatSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this._audioCtx || this._audioCtx.state === 'closed') {
        this._audioCtx = new AudioCtx();
      }
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Function to synthesize an authentic cardiac sound pulse (with lowpass resonance)
      const playPulse = (startTime, startFreq, endFreq, peakGain, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(120, startTime);
        filter.Q.setValueAtTime(3, startTime);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, startTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // --- Cycle 1: "Thump-thump" ---
      // S1 "lub" (deep resonant chest thump)
      playPulse(now, 65, 38, 0.85, 0.16);
      // S2 "dub" (crisper second thump after ~0.14s)
      playPulse(now + 0.14, 82, 45, 0.72, 0.13);

      // --- Cycle 2: "Thump-thump" (after 0.46s delay) ---
      const cycle2 = now + 0.46;
      playPulse(cycle2, 65, 38, 0.88, 0.16);
      playPulse(cycle2 + 0.14, 82, 45, 0.75, 0.13);

      // Mobile/Trackpad haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate([70, 50, 90, 280, 70, 50, 90]);
      }
    } catch (e) {
      console.warn('Web Audio Heartbeat error:', e);
    }
  },

  triggerHeartbeatEffect(senderName) {
    this.playHeartbeatSound();

    const overlay = document.getElementById('heartbeatOverlay');
    if (!overlay) return;

    overlay.innerHTML = `
      <div class="send-love-stage">
        <div class="send-love-aura"></div>
        <div class="send-love-heart-3d">
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="loveGrad3D" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ea51ff" />
                <stop offset="50%" stop-color="#ff4d6d" />
                <stop offset="100%" stop-color="#a955ff" />
              </linearGradient>
            </defs>
            <path d="M16 28.5C15.4 28.5 14.8 28.3 14.3 27.8C8.2 22.3 2 16.7 2 9.8C2 5.5 5.5 2 9.8 2C12.3 2 14.6 3.2 16 5.1C17.4 3.2 19.7 2 22.2 2C26.5 2 30 5.5 30 9.8C30 16.7 23.8 22.3 17.7 27.8C17.2 28.3 16.6 28.5 16 28.5Z" fill="url(#loveGrad3D)" />
          </svg>
        </div>
        <div class="send-love-sender-badge">
          <span class="sender-heart">💖</span> ${this.escapeHtml(senderName || 'Your Love')} sent love!
        </div>
      </div>
    `;

    overlay.style.display = 'flex';
    overlay.classList.remove('active');
    void overlay.offsetWidth; // trigger reflow
    overlay.classList.add('active');

    setTimeout(() => {
      overlay.classList.remove('active');
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 450);
    }, 2400);
  },

  updatePartnerPresenceUI(data) {
    if (!data) return;
    const partnerStatusDot = document.getElementById('partnerStatusDot');
    const partnerStatusText = document.getElementById('partnerStatusText');

    const partner = window.App?.partner;
    const partnerName = data.name || partner?.displayName || partner?.name || 'Partner';
    const isOnline = data.status === 'online';

    if (partnerStatusDot) {
      if (isOnline) {
        partnerStatusDot.style.background = '#2ed573';
        partnerStatusDot.style.boxShadow = '0 0 10px rgba(46, 213, 115, 0.8), 0 0 4px #2ed573';
      } else {
        partnerStatusDot.style.background = '#a0969a';
        partnerStatusDot.style.boxShadow = 'none';
      }
    }

    if (partnerStatusText) {
      if (isOnline) {
        partnerStatusText.innerText = `${partnerName} online ❤️`;
        partnerStatusText.style.color = '#2ed573';
        partnerStatusText.style.fontWeight = '600';
      } else {
        partnerStatusText.innerText = `${partnerName} offline`;
        partnerStatusText.style.color = 'var(--text-muted, #94a3b8)';
        partnerStatusText.style.fontWeight = 'normal';
      }
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  },
};

window.SocketManager = SocketManager;
