const API = {
  baseUrl: '/api',

  getToken() {
    let token = localStorage.getItem('heartly_token');
    if (!token) {
      // Fallback: Check persistent cookie
      const match = document.cookie.match(new RegExp('(^| )heartly_token=([^;]+)'));
      if (match) {
        token = decodeURIComponent(match[2]);
        localStorage.setItem('heartly_token', token);
      }
    }
    return token;
  },

  setToken(token) {
    if (!token) return;
    localStorage.setItem('heartly_token', token);
    // Double-layer persistence: set long-lived cookie (365 days)
    document.cookie = `heartly_token=${encodeURIComponent(token)}; max-age=31536000; path=/; SameSite=Lax`;
  },

  clearToken() {
    localStorage.removeItem('heartly_token');
    document.cookie = 'heartly_token=; max-age=0; path=/; SameSite=Lax';
    sessionStorage.removeItem('heartly_space_unlocked');
    localStorage.removeItem('heartly_space_unlocked');
  },

  isSpaceUnlocked() {
    return sessionStorage.getItem('heartly_space_unlocked') === 'true';
  },

  setSpaceUnlocked(unlocked) {
    if (unlocked) {
      sessionStorage.setItem('heartly_space_unlocked', 'true');
    } else {
      sessionStorage.removeItem('heartly_space_unlocked');
    }
    localStorage.removeItem('heartly_space_unlocked');
  },

  getUserId() {
    return window.App?.currentUser?.id || window.App?.currentUser?._id || '';
  },

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = this.getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'API Request failed');
      error.status = response.status;
      throw error;
    }
    return data;
  },

  // Auth & Space API
  async register(name, email, password) {
    const res = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    this.setToken(res.token);
    return res;
  },

  async login(email, password) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(res.token);
    this.setSpaceUnlocked(false);
    return res;
  },

  async getMe() {
    return await this.request('/auth/me');
  },

  async createSpace(spaceName, masterPassword) {
    const res = await this.request('/auth/space/create', {
      method: 'POST',
      body: JSON.stringify({ spaceName, masterPassword }),
    });
    this.setToken(res.token);
    this.setSpaceUnlocked(true);
    return res;
  },

  async joinSpace(pairingCode, masterPassword) {
    const res = await this.request('/auth/space/join', {
      method: 'POST',
      body: JSON.stringify({ pairingCode, masterPassword }),
    });
    this.setToken(res.token);
    this.setSpaceUnlocked(true);
    return res;
  },

  async unlockSpace(masterPassword) {
    const res = await this.request('/auth/space/unlock', {
      method: 'POST',
      body: JSON.stringify({ masterPassword }),
    });
    if (res.unlocked) {
      this.setSpaceUnlocked(true);
    }
    return res;
  },

  // Avatar API
  async uploadAvatar(formData) {
    return await this.request('/auth/avatar', {
      method: 'POST',
      body: formData,
    });
  },

  // Gallery API (MongoDB GridFS)
  async uploadMemory(formData) {
    return await this.request('/gallery/upload', {
      method: 'POST',
      body: formData,
    });
  },

  async getGallery() {
    return await this.request('/gallery');
  },

  async addComment(galleryId, text) {
    return await this.request(`/gallery/${galleryId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  async toggleReaction(galleryId, reactionType = '❤️') {
    return await this.request(`/gallery/${galleryId}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ reactionType }),
    });
  },

  async deleteMemory(galleryId) {
    return await this.request(`/gallery/${galleryId}`, {
      method: 'DELETE',
    });
  },

  async updateMemoryGenre(galleryId, genre) {
    return await this.request(`/gallery/${galleryId}/genre`, {
      method: 'PATCH',
      body: JSON.stringify({ genre }),
    });
  },

  // Scratchbook API
  async getScratchbook(id = null) {
    const url = id ? `/scratchbook?id=${encodeURIComponent(id)}` : '/scratchbook';
    return await this.request(url);
  },

  async getScratchbookList() {
    return await this.request('/scratchbook/list');
  },

  async createScratchbook(title, backgroundColor = '#ffffff') {
    return await this.request('/scratchbook/new', {
      method: 'POST',
      body: JSON.stringify({ title, backgroundColor }),
    });
  },

  async getScratchbookById(id) {
    return await this.request(`/scratchbook/${id}`);
  },

  async updateScratchbookBg(id, backgroundColor) {
    return await this.request(`/scratchbook/${id}/background`, {
      method: 'PUT',
      body: JSON.stringify({ backgroundColor }),
    });
  },

  async renameScratchbook(id, title) {
    return await this.request(`/scratchbook/${id}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    });
  },

  async deleteScratchbook(id) {
    return await this.request(`/scratchbook/${id}`, {
      method: 'DELETE',
    });
  },

  async syncScratchElement(element, scratchbookId = null) {
    return await this.request('/scratchbook/element', {
      method: 'PUT',
      body: JSON.stringify({ ...element, scratchbookId }),
    });
  },

  async deleteScratchElement(elementId, scratchbookId = null) {
    const url = scratchbookId
      ? `/scratchbook/element/${elementId}?scratchbookId=${encodeURIComponent(scratchbookId)}`
      : `/scratchbook/element/${elementId}`;
    return await this.request(url, {
      method: 'DELETE',
    });
  },

  async clearScratchbook(scratchbookId = null) {
    return await this.request('/scratchbook/clear', {
      method: 'POST',
      body: JSON.stringify({ scratchbookId }),
    });
  },

  async uploadScratchMedia(formData) {
    return await this.request('/scratchbook/upload-media', {
      method: 'POST',
      body: formData,
    });
  },

  // Private Couple Chat API
  async getChatMessages() {
    return await this.request('/chat');
  },

  async sendChatMessage(text, replyTo = null) {
    return await this.request('/chat', {
      method: 'POST',
      body: JSON.stringify({ text, replyTo }),
    });
  },

  async sendChatImage(formData) {
    return await this.request('/chat/upload-image', {
      method: 'POST',
      body: formData,
    });
  },

  async sendChatAudio(formData) {
    return await this.request('/chat/upload-audio', {
      method: 'POST',
      body: formData,
    });
  },

  async markChatRead() {
    return await this.request('/chat/read', {
      method: 'PUT',
    });
  },

  async deleteChatMessage(messageId, type = 'everyone') {
    return await this.request(`/chat/${messageId}?type=${type}`, {
      method: 'DELETE',
    });
  },

  async reactToChatMessage(messageId, emoji) {
    return await this.request(`/chat/${messageId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  },

  // Pinned Messages API
  async getPinnedMessages() {
    return await this.request('/chat/pinned');
  },

  async togglePinMessage(messageId) {
    return await this.request(`/chat/${messageId}/pin`, {
      method: 'PATCH',
    });
  },

  // Shared Chat Wallpaper API
  async getChatWallpaper() {
    return await this.request('/chat/wallpaper');
  },

  async updateChatWallpaper(wallpaperData) {
    return await this.request('/chat/wallpaper', {
      method: 'PUT',
      body: JSON.stringify(wallpaperData),
    });
  },

  async uploadChatWallpaper(formData) {
    return await this.request('/chat/wallpaper/upload', {
      method: 'POST',
      body: formData,
    });
  },

  // Magic Words & Love Triggers API
  async getMagicWords() {
    return await this.request('/chat/magic-words');
  },

  async addMagicWord(phrase, effect) {
    return await this.request('/chat/magic-words', {
      method: 'POST',
      body: JSON.stringify({ phrase, effect }),
    });
  },

  async deleteMagicWord(id) {
    return await this.request(`/chat/magic-words/${id}`, {
      method: 'DELETE',
    });
  },

  // Date Planner & Calendar API
  async getDates() {
    return await this.request('/dates');
  },

  async requestDate(dateData) {
    return await this.request('/dates/request', {
      method: 'POST',
      body: JSON.stringify(dateData),
    });
  },

  async respondDate(id, action) {
    return await this.request(`/dates/${id}/respond`, {
      method: 'PUT',
      body: JSON.stringify({ action }),
    });
  },

  async deleteDate(id) {
    return await this.request(`/dates/${id}`, {
      method: 'DELETE',
    });
  },

  // Shared Dreams & Clothesline API
  async getDreams() {
    return await this.request('/dreams');
  },

  async uploadDreamPhoto(formData) {
    const token = this.getToken();
    const res = await fetch(`${this.baseUrl}/dreams/upload-photo`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload dream photo');
    }
    return await res.json();
  },

  async createDream(dreamData) {
    return await this.request('/dreams', {
      method: 'POST',
      body: JSON.stringify(dreamData),
    });
  },

  async updateDream(id, updateData) {
    return await this.request(`/dreams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  },

  async toggleDreamCompleted(id) {
    return await this.request(`/dreams/${id}/toggle-completed`, {
      method: 'POST',
    });
  },

  async toggleDreamFavorite(id) {
    return await this.request(`/dreams/${id}/toggle-favorite`, {
      method: 'POST',
    });
  },

  async deleteDream(id) {
    return await this.request(`/dreams/${id}`, {
      method: 'DELETE',
    });
  },

  // FreeLLMAPI AI Muse & Assistant (Ema)
  async requestAiAssistance({ prompt = '', command = '', userName = '', partnerName = '', spaceName = '' } = {}) {
    return await this.request('/ai/assist', {
      method: 'POST',
      body: JSON.stringify({ prompt, command, userName, partnerName, spaceName }),
    });
  },
};
