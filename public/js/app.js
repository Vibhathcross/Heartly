const App = {
  currentUser: null,
  currentSpace: null,

  avatarCropState: {
    imageSrc: '',
    zoom: 100,
    panX: 0,
    panY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
    naturalWidth: 0,
    naturalHeight: 0,
  },

  async init() {
    // When app is launched or opened, Master Passcode is always required
    API.setSpaceUnlocked(false);
    this.initIntroScreen();
    this.bindEvents();
    this.initAvatarCropper();
    await this.checkAuthStatus();
  },

  initIntroScreen() {
    const overlay = document.getElementById('heartlyIntroOverlay');
    if (!overlay) return;

    // Fetch dynamic app version from server/version.json
    fetch('/version.json')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.version) {
          const vEl = document.getElementById('introAppVersion');
          if (vEl) vEl.innerText = 'v' + data.version;
        }
      })
      .catch(() => {
        fetch('/api/version')
          .then((res) => res.json())
          .then((data) => {
            if (data && data.version) {
              const vEl = document.getElementById('introAppVersion');
              if (vEl) vEl.innerText = 'v' + data.version;
            }
          })
          .catch(() => {});
      });

    let dismissed = false;
    const dismissIntro = () => {
      if (dismissed) return;
      dismissed = true;
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 700);
    };

    // Auto dismiss after 2.8 seconds of romantic presentation
    const introTimer = setTimeout(dismissIntro, 2800);

    // Click anywhere to immediately enter
    overlay.addEventListener('click', () => {
      clearTimeout(introTimer);
      dismissIntro();
    });

    document.getElementById('btnSkipIntro')?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(introTimer);
      dismissIntro();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        clearTimeout(introTimer);
        dismissIntro();
      }
    });
  },

  bindEvents() {
    // Auth Tab switching (Login vs Register)
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    tabLogin?.addEventListener('click', () => {
      tabLogin.style.fontWeight = '700';
      tabRegister.style.fontWeight = '400';
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
    });

    tabRegister?.addEventListener('click', () => {
      tabRegister.style.fontWeight = '700';
      tabLogin.style.fontWeight = '400';
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
    });

    // Quick toggle between Login & Register via buttons
    document.getElementById('btnGoToRegister')?.addEventListener('click', () => {
      tabRegister?.click();
    });

    document.getElementById('btnBackToLoginFromReg')?.addEventListener('click', () => {
      tabLogin?.click();
    });

    // Space Setup switching (Create vs Join)
    const btnShowCreate = document.getElementById('btnShowCreateSpace');
    const btnShowJoin = document.getElementById('btnShowJoinSpace');
    const createForm = document.getElementById('createSpaceForm');
    const joinForm = document.getElementById('joinSpaceForm');

    btnShowCreate?.addEventListener('click', () => {
      createForm.style.display = 'block';
      joinForm.style.display = 'none';
      btnShowCreate.style.fontWeight = '700';
      btnShowJoin.style.fontWeight = '400';
    });

    btnShowJoin?.addEventListener('click', () => {
      createForm.style.display = 'none';
      joinForm.style.display = 'block';
      btnShowJoin.style.fontWeight = '700';
      btnShowCreate.style.fontWeight = '400';
    });

    document.getElementById('btnSwitchToJoin')?.addEventListener('click', () => {
      btnShowJoin?.click();
    });

    document.getElementById('btnSwitchToCreate')?.addEventListener('click', () => {
      btnShowCreate?.click();
    });

    // Logout / Switch Account from Space Setup
    document.getElementById('btnLogoutFromSpaceSetup')?.addEventListener('click', () => {
      API.clearToken();
      document.getElementById('spaceSetupSection').style.display = 'none';
      document.getElementById('authTabs').style.display = 'flex';
      tabLogin?.click();
      this.showScreen('auth');
    });

    // Setup Enter key navigation so textboxes never freeze or block on Enter
    this.setupFormEnterNavigation();

    // Login Form Submit
    loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearAuthFeedback();
      const email = document.getElementById('loginEmail').value.trim();
      const pass = document.getElementById('loginPassword').value;
      if (!email || !pass) {
        this.showAuthFeedback('loginFeedback', 'Please enter both your email and password 💌', 'error');
        HeartlyDialog.alert('Please enter both your email and password 💌', 'Heartly Login');
        return;
      }
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Logging in...'; }
      try {
        localStorage.setItem('heartly_saved_email', email);
        await API.login(email, pass);
        await this.checkAuthStatus();
      } catch (err) {
        this.showAuthFeedback('loginFeedback', err.message || 'Invalid email or password', 'error');
        HeartlyDialog.alert(err.message || 'Invalid email or password', 'Heartly Login');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Log In'; }
      }
    });

    // Register Form Submit
    registerForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearAuthFeedback();
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const pass = document.getElementById('regPassword').value;
      if (!name || !email || !pass) {
        this.showAuthFeedback('registerFeedback', 'Please fill in all registration fields 💖', 'error');
        HeartlyDialog.alert('Please fill in all registration fields 💖', 'Heartly Join');
        return;
      }
      if (pass.length < 6) {
        this.showAuthFeedback('registerFeedback', 'Password must be at least 6 characters long', 'error');
        HeartlyDialog.alert('Password must be at least 6 characters long', 'Heartly Join');
        return;
      }
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Creating Account...'; }
      try {
        await API.register(name, email, pass);
        await HeartlyDialog.alert(`Welcome to Heartly, ${name}! Your account has been created. Next, let's create or join your couple sanctuary! 💖`, 'Account Created');
        await this.checkAuthStatus();
        this.showAuthFeedback('spaceSetupNotice', `Account created! Welcome, ${name}. Next, create or join your couple space ♡`, 'success');
      } catch (err) {
        this.showAuthFeedback('registerFeedback', err.message || 'Failed to create account', 'error');
        HeartlyDialog.alert(err.message || 'Failed to create account', 'Heartly Join');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Create Personal Account'; }
      }
    });

    // Create Space Submit
    createForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearAuthFeedback();
      const name = document.getElementById('newSpaceName').value.trim();
      const pass = document.getElementById('newSpacePasscode').value;
      if (!name || !pass) {
        this.showAuthFeedback('createSpaceFeedback', 'Please provide a name and passcode for your space ❤️', 'error');
        HeartlyDialog.alert('Please provide a name and passcode for your space ❤️', 'Create Space');
        return;
      }
      const submitBtn = createForm.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Creating Space...'; }
      try {
        const res = await API.createSpace(name, pass);
        const pairingCode = res?.space?.pairingCode;
        if (pairingCode) {
          await HeartlyDialog.showPairingCode(pairingCode, name);
        }
        await this.checkAuthStatus();
      } catch (err) {
        this.showAuthFeedback('createSpaceFeedback', err.message || 'Failed to create space', 'error');
        HeartlyDialog.alert(err.message || 'Failed to create space', 'Create Space');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Create Our Space'; }
      }
    });

    // Join Space Submit
    joinForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearAuthFeedback();
      const code = document.getElementById('joinPairingCode').value.trim();
      const pass = document.getElementById('joinSpacePasscode').value;
      if (!code || !pass) {
        this.showAuthFeedback('joinSpaceFeedback', 'Please provide the 6-character partner code and space passcode ❤️', 'error');
        HeartlyDialog.alert('Please provide the 6-character partner code and space passcode ❤️', 'Join Space');
        return;
      }
      const submitBtn = joinForm.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Joining Space...'; }
      try {
        await API.joinSpace(code, pass);
        await HeartlyDialog.alert('You have joined your couple sanctuary! 👩‍❤️‍👨', 'Joined Space');
        await this.checkAuthStatus();
      } catch (err) {
        this.showAuthFeedback('joinSpaceFeedback', err.message || 'Failed to join space', 'error');
        HeartlyDialog.alert(err.message || 'Failed to join space', 'Join Space');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = "Join Partner's Space"; }
      }
    });

    // Master Passcode Unlock Form Submit (App Opening)
    document.getElementById('unlockForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearAuthFeedback();
      const passcode = document.getElementById('unlockPasscode').value;
      const submitBtn = document.querySelector('#unlockForm button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Unlocking...'; }
      try {
        await API.unlockSpace(passcode);
        document.getElementById('unlockPasscode').value = '';
        await this.checkAuthStatus();
      } catch (err) {
        this.showAuthFeedback('unlockFeedback', err.message || 'Incorrect Space Master Passcode', 'error');
        HeartlyDialog.alert(err.message || 'Incorrect Space Master Passcode', 'Unlock Space');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '❤️ Unlock Sanctuary'; }
      }
    });

    // Switch Account / Log Out button on Master Key page (Unlock Space)
    document.getElementById('btnSwitchAccount')?.addEventListener('click', async () => {
      let confirmed = true;
      if (window.HeartlyDialog) {
        confirmed = await HeartlyDialog.confirm(
          'Log out of your account on this device? You will need to enter your email and password next time.',
          'Log Out of Account'
        );
      } else {
        confirmed = confirm('Log out of your account on this device?');
      }
      if (confirmed) {
        API.clearToken();
        window.HeartlyAiAssistant?.hideFloatingButton();
        const savedEmail = localStorage.getItem('heartly_saved_email');
        const loginEmailInput = document.getElementById('loginEmail');
        if (savedEmail && loginEmailInput) loginEmailInput.value = savedEmail;
        this.showScreen('auth');
      }
    });

    // App Lock Button
    document.getElementById('btnLockApp')?.addEventListener('click', () => {
      API.setSpaceUnlocked(false);
      window.HeartlyAiAssistant?.hideFloatingButton();
      if (this.currentSpace?.spaceName) {
        const unlockNameEl = document.getElementById('unlockSpaceName');
        if (unlockNameEl) unlockNameEl.innerText = `Unlock ${this.currentSpace.spaceName}`;
      }
      const passcodeEl = document.getElementById('unlockPasscode');
      if (passcodeEl) passcodeEl.value = '';
      this.showScreen('unlock');
    });

    // Send Heartbeat Button
    document.getElementById('btnSendHeartbeat')?.addEventListener('click', () => {
      window.SocketManager.sendHeartbeat();
    });

    // Tabs switching with dynamic sidebar branding
    const tabs = [
      {
        id: 'dreams',
        btn: document.getElementById('tabDreams'),
        section: document.getElementById('dreamsSection'),
        icon: '💖',
        cursive: 'Shared',
        serif: 'Dreams',
        onLoad: () => window.DreamsManager?.loadDreams(),
      },
      {
        id: 'gallery',
        btn: document.getElementById('tabGallery'),
        section: document.getElementById('gallerySection'),
        icon: '📸',
        cursive: 'Our',
        serif: 'Gallery',
        onLoad: () => window.GalleryManager.loadGallery(),
      },
      {
        id: 'chat',
        btn: document.getElementById('tabChat'),
        section: document.getElementById('chatSection'),
        icon: '💌',
        cursive: 'Private',
        serif: 'Whispers',
        onLoad: () => {
          window.ChatManager.loadMessages();
          window.ChatManager.scrollToBottom();
        },
      },
      {
        id: 'scratchbook',
        btn: document.getElementById('tabScratchbook'),
        section: document.getElementById('scratchbookSection'),
        icon: '🎨',
        cursive: 'Shared',
        serif: 'Scratchbook',
        onLoad: () => {
          window.ScratchbookManager.resizeCanvas();
          window.ScratchbookManager.loadScratchbook(window.ScratchbookManager.currentBookId);
        },
      },
      {
        id: 'dates',
        btn: document.getElementById('tabDates'),
        section: document.getElementById('datesSection'),
        icon: '🗓️',
        cursive: 'Date',
        serif: 'Calendar',
        onLoad: () => window.DatesManager.loadDates(),
      },
      {
        id: 'personal',
        btn: document.getElementById('tabPersonal'),
        section: document.getElementById('personalSpaceSection'),
        icon: '🔒',
        cursive: 'Personal',
        serif: 'Space',
        onLoad: () => window.PersonalSpaceManager?.init(),
      },
    ];

    tabs.forEach((tab) => {
      tab.btn?.addEventListener('click', () => {
        const updateDOM = () => {
          tabs.forEach((t) => {
            t.btn?.classList.remove('active');
            if (t.section) t.section.style.display = 'none';
          });
          tab.btn?.classList.add('active');
          if (tab.section) tab.section.style.display = (tab.id === 'personal' || tab.id === 'dreams') ? 'flex' : 'block';

          // Update Top-Left Sidebar Title & Icon dynamically
          const iconEl = document.getElementById('sidebarBrandIcon');
          const cursiveEl = document.getElementById('sidebarBrandCursive');
          const serifEl = document.getElementById('sidebarBrandSerif');
          if (iconEl && tab.icon) iconEl.innerText = tab.icon;
          if (cursiveEl && tab.cursive) cursiveEl.innerText = tab.cursive;
          if (serifEl && tab.serif) serifEl.innerText = tab.serif;

          if (tab.onLoad) tab.onLoad();

          // Control Ema floating button visibility: visible on all tabs except personal space
          if (window.HeartlyAiAssistant) {
            window.HeartlyAiAssistant.updateTabVisibility(tab.id);
          }

          // Switch realistic section wallpaper
          const backdrop = document.querySelector('.sunset-window-backdrop');
          if (backdrop) {
            backdrop.classList.remove('wp-dreams', 'wp-gallery', 'wp-chat', 'wp-scratchbook', 'wp-dates', 'wp-personal');
            backdrop.classList.add(`wp-${tab.id}`);
          }
        };

        if (document.startViewTransition) {
          const transition = document.startViewTransition(updateDOM);
          transition.finished.finally(() => {
            if (tab.section?.id === 'scratchbookSection') {
              window.ScratchbookManager?.resizeCanvas();
            }
          });
        } else {
          updateDOM();
        }
      });
    });

    // Personal Profile Picture View Area & Framing (Only current user can edit their own from their device)
    const avatarYouBtn = document.getElementById('avatarYouBtn');
    const avatarFileInput = document.getElementById('userAvatarFileInput');
    const avatarPartnerBtn = document.getElementById('avatarPartnerBtn');

    avatarYouBtn?.addEventListener('click', () => {
      // Always open file input so the user can select their new original photo
      if (avatarFileInput) {
        avatarFileInput.value = '';
        avatarFileInput.click();
      }
    });

    avatarFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result;
        if (dataUrl) {
          this.openAvatarCropModal(dataUrl);
        }
      };
      reader.readAsDataURL(file);
      avatarFileInput.value = '';
    });

    // Partner Profile Picture Click (View-only for partner)
    avatarPartnerBtn?.addEventListener('click', () => {
      const partnerName = this.partner?.displayName || this.partner?.name || 'your partner';
      HeartlyDialog.alert(
        `This is ${partnerName}'s profile photo. Only they can change it from their own device ❤️`,
        `${partnerName}'s Profile`
      );
    });

    // Upload Modal events
    const modal = document.getElementById('uploadModal');
    document.getElementById('btnOpenUploadModal')?.addEventListener('click', () => {
      modal.style.display = 'flex';
      // Default to today's date
      document.getElementById('memoryDate').value = new Date().toISOString().split('T')[0];
    });

    document.getElementById('btnCloseUploadModal')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    document.getElementById('uploadMemoryForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('memoryFile');
      const dateInput = document.getElementById('memoryDate');
      const captionInput = document.getElementById('memoryCaption');
      const locationInput = document.getElementById('memoryLocation');
      const genreInput = document.getElementById('memoryGenre');
      const submitBtn = document.getElementById('btnUploadSubmit');

      if (!fileInput.files[0]) {
        HeartlyDialog.alert('Please select a photo to upload ❤️', 'Add Memory');
        return;
      }

      const formData = new FormData();
      formData.append('photo', fileInput.files[0]);
      formData.append('memoryDate', dateInput.value);
      formData.append('caption', captionInput.value);
      formData.append('location', locationInput ? locationInput.value : '');
      if (genreInput && genreInput.value.trim()) {
        formData.append('genre', genreInput.value.trim());
      }

      try {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Uploading photo... ❤️';

        const res = await API.uploadMemory(formData);
        modal.style.display = 'none';
        document.getElementById('uploadMemoryForm').reset();
        await window.GalleryManager.loadGallery();

        const createdItem = res?.item || res?.memory;
        if (createdItem && window.SocketManager) {
          window.SocketManager.emitGalleryCreated(createdItem);
        }
      } catch (err) {
        HeartlyDialog.alert('Upload failed: ' + err.message, 'Add Memory');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Save to Our Gallery ❤️';
      }
    });
  },

  showAuthFeedback(elementId, message, type = 'error') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `auth-feedback-banner ${type}`;
    el.style.display = 'flex';
  },

  clearAuthFeedback() {
    document.querySelectorAll('.auth-feedback-banner').forEach((el) => {
      el.textContent = '';
      el.style.display = 'none';
    });
  },

  setupFormEnterNavigation() {
    // Intercept Enter key across all forms to prevent input freezing and advance focus naturally
    const enterNavRules = [
      { from: 'loginEmail', to: 'loginPassword' },
      { from: 'regName', to: 'regEmail' },
      { from: 'regEmail', to: 'regPassword' },
      { from: 'newSpaceName', to: 'newSpacePasscode' },
      { from: 'joinPairingCode', to: 'joinSpacePasscode' },
      { from: 'dateInputTitle', to: 'dateInputDate' },
      { from: 'dateInputDate', to: 'dateInputTime' },
      { from: 'dateInputTime', to: 'dateInputLocation' },
      { from: 'dateInputLocation', to: 'dateInputNotes' },
      { from: 'memoryLocation', to: 'memoryGenre' },
    ];

    enterNavRules.forEach(({ from, to }) => {
      const fromEl = document.getElementById(from);
      const toEl = document.getElementById(to);
      if (fromEl && toEl) {
        fromEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            toEl.focus();
            if (typeof toEl.select === 'function') toEl.select();
          }
        });
      }
    });

    // General fallback for all inputs inside forms: prevent accidental blocking or submit freezing
    document.querySelectorAll('input:not([type="submit"]):not([type="button"])').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          // If this input has no specific rule and isn't the final submit field of a form
          const form = input.closest('form');
          if (form) {
            const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]), textarea'));
            const idx = inputs.indexOf(input);
            if (idx > -1 && idx < inputs.length - 1) {
              const nextEl = inputs[idx + 1];
              if (nextEl && typeof nextEl.focus === 'function') {
                e.preventDefault();
                e.stopPropagation();
                nextEl.focus();
              }
            }
          }
        }
      });
    });
  },

  async checkAuthStatus(retryCount = 0) {
    const token = API.getToken();
    if (!token) {
      const savedEmail = localStorage.getItem('heartly_saved_email');
      const loginEmailInput = document.getElementById('loginEmail');
      if (savedEmail && loginEmailInput) loginEmailInput.value = savedEmail;
      this.showScreen('auth');
      return;
    }

    try {
      const data = await API.getMe();
      this.currentUser = data.user;
      this.currentSpace = data.space;

      if (this.currentUser?.email) {
        localStorage.setItem('heartly_saved_email', this.currentUser.email);
      }

      // Check if user has a space
      if (!this.currentUser.spaceId || !this.currentSpace) {
        this.showScreen('auth');
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('authTabs').style.display = 'none';
        document.getElementById('spaceSetupSection').style.display = 'block';
        return;
      }

      // Check if space is locked (requires Master Passcode)
      if (!API.isSpaceUnlocked()) {
        const unlockNameEl = document.getElementById('unlockSpaceName');
        if (unlockNameEl) {
          unlockNameEl.innerText = `Unlock ${this.currentSpace.spaceName}`;
        }
        this.showScreen('unlock');
        return;
      }

      // Space unlocked! Launch main app
      this.launchMainApp();
    } catch (err) {
      console.warn('Auth check error:', err);

      // If server is starting up (network error) and we have retries left:
      // DO NOT clear token! Wait and retry smoothly.
      const isNetworkError = !err.status || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
      if (isNetworkError && retryCount < 12) {
        console.log(`[Heartly] Backend connecting... retry ${retryCount + 1}/12`);
        setTimeout(() => this.checkAuthStatus(retryCount + 1), 500);
        return;
      }

      // ONLY clear token if server explicitly rejected the token (401 Unauthorized or 403 Forbidden)
      if (err.status === 401 || err.status === 403) {
        console.warn('[Heartly] Token expired or invalid. Requiring re-login.');
        API.clearToken();
        const savedEmail = localStorage.getItem('heartly_saved_email');
        const loginEmailInput = document.getElementById('loginEmail');
        if (savedEmail && loginEmailInput) loginEmailInput.value = savedEmail;
        this.showScreen('auth');
      } else {
        // Any other non-auth error (e.g. temporary DB hiccup) - do NOT wipe token!
        if (!API.isSpaceUnlocked()) {
          this.showScreen('unlock');
        }
      }
    }
  },

  launchMainApp() {
    this.showScreen('main');

    // Update Header Badges & Space Title
    this.updateHeaderBadges();

    // Init Socket.IO
    window.SocketManager.init(API.getToken());

    // Init Scratchbook, Gallery, Chat, Dates & Dreams
    window.DreamsManager?.init();
    window.ScratchbookManager.init();
    window.GalleryManager.loadGallery();
    window.ChatManager.init();
    window.DatesManager.init();
    window.FloatingChatPreview?.init();
    window.PersonalSpaceManager?.init();
    window.PersonalSpaceManager?.checkTodayPopup();

    // Init Ema AI Floating Assistant (Visible on all tabs except Personal Space)
    window.HeartlyAiAssistant?.init();
    window.HeartlyAiAssistant?.updateTabVisibility('chat');
  },

  updateHeaderBadges() {
    if (!this.currentSpace) return;

    // Update Space Name
    const titleEl = document.getElementById('headerSpaceTitle');
    if (titleEl) titleEl.innerText = this.currentSpace.spaceName;

    const pairingBadge = document.getElementById('pairingCodeBadge');
    const combinedBadge = document.getElementById('coupleCombinedBadge');
    const combinedNames = document.getElementById('coupleCombinedNames');

    const members = this.currentSpace.members || [];
    const isTwoMembers = members.length >= 2 || this.currentSpace.isFullyPaired || this.currentSpace.isReserved;

    // Find Partner
    const partner = members.find((m) => String(m.userId) !== String(this.currentUser?.id || this.currentUser?._id));
    if (partner) {
      this.partner = partner;
      const partnerName = partner.displayName || partner.name || 'Partner';
      const statusText = document.getElementById('partnerStatusText');
      if (statusText && statusText.innerText.includes('Partner')) {
        statusText.innerText = statusText.innerText.replace('Partner', partnerName);
      }
    }

    // Populate User's own Avatar Circle
    const youImg = document.getElementById('headerAvatarYouImg');
    const youFallback = document.getElementById('headerAvatarYouFallback');
    const youCircle = document.getElementById('headerAvatarCircleYou');
    const userInitial = (this.currentUser?.name || 'You').trim().charAt(0).toUpperCase() || '👤';
    if (this.currentUser?.avatarUrl) {
      if (youImg) {
        youImg.src = this.currentUser.avatarUrl;
        youImg.style.display = 'block';
      }
      if (youFallback) youFallback.style.display = 'none';
      youCircle?.classList.add('has-image');
    } else {
      if (youImg) {
        youImg.src = '';
        youImg.style.display = 'none';
      }
      if (youFallback) {
        youFallback.innerText = userInitial;
        youFallback.style.display = 'flex';
      }
      youCircle?.classList.remove('has-image');
    }

    // Populate Partner's Avatar Circle
    const partnerImg = document.getElementById('headerAvatarPartnerImg');
    const partnerFallback = document.getElementById('headerAvatarPartnerFallback');
    const partnerCircle = document.getElementById('headerAvatarCirclePartner');
    const partnerName = partner?.displayName || partner?.name || 'Partner';
    const partnerInitial = partnerName.trim().charAt(0).toUpperCase() || '👧';
    if (partner?.avatarUrl) {
      if (partnerImg) {
        partnerImg.src = partner.avatarUrl;
        partnerImg.style.display = 'block';
      }
      if (partnerFallback) partnerFallback.style.display = 'none';
      partnerCircle?.classList.add('has-image');
    } else {
      if (partnerImg) {
        partnerImg.src = '';
        partnerImg.style.display = 'none';
      }
      if (partnerFallback) {
        partnerFallback.innerText = partnerInitial;
        partnerFallback.style.display = 'flex';
      }
      partnerCircle?.classList.remove('has-image');
    }

    if (isTwoMembers) {
      // 1. Two persons entered: Show golden metallic reserved badge!
      if (pairingBadge) pairingBadge.style.display = 'none';

      const userDisplayName = this.currentUser?.name || 'You';
      const partnerDisplayName = partner?.displayName || partner?.name || 'Partner';
      const combinedText = `${userDisplayName} & ${partnerDisplayName}`;

      if (combinedNames) {
        combinedNames.innerText = combinedText;
      }

      if (combinedBadge) {
        combinedBadge.style.display = 'inline-flex';
        combinedBadge.title = `Permanently reserved for ${combinedText} only. This space is closed to any additional members.`;
      }
    } else {
      // 2. Single member: Show invite pairing code
      if (combinedBadge) combinedBadge.style.display = 'none';

      if (pairingBadge && this.currentSpace.pairingCode) {
        pairingBadge.style.display = 'inline-block';
        pairingBadge.style.cursor = 'pointer';
        pairingBadge.innerText = `💌 Partner Code: ${this.currentSpace.pairingCode} (Click to Copy)`;
        pairingBadge.title = 'Click to view and copy your partner connection code!';
        pairingBadge.onclick = () => {
          HeartlyDialog.showPairingCode(this.currentSpace.pairingCode, this.currentSpace.spaceName);
        };
      } else if (pairingBadge) {
        pairingBadge.style.display = 'none';
        pairingBadge.onclick = null;
      }
    }
  },

  handleAvatarUpdated(data) {
    if (!data) return;
    const currentId = String(this.currentUser?.id || this.currentUser?._id || '');
    if (String(data.userId) === currentId) {
      if (this.currentUser) this.currentUser.avatarUrl = data.avatarUrl;
      const youImg = document.getElementById('headerAvatarYouImg');
      const youFallback = document.getElementById('headerAvatarYouFallback');
      if (youImg) {
        youImg.src = data.avatarUrl;
        youImg.style.display = 'block';
      }
      if (youFallback) youFallback.style.display = 'none';
    } else {
      if (this.partner) this.partner.avatarUrl = data.avatarUrl;
      const partnerImg = document.getElementById('headerAvatarPartnerImg');
      const partnerFallback = document.getElementById('headerAvatarPartnerFallback');
      if (partnerImg) {
        partnerImg.src = data.avatarUrl;
        partnerImg.style.display = 'block';
      }
      if (partnerFallback) partnerFallback.style.display = 'none';
      HeartlyDialog.alert(`${data.name || 'Your partner'} updated their profile photo! ❤️`, 'Partner Profile');
    }
  },

  async refreshSpaceInfo() {
    try {
      const data = await API.getMe();
      if (data.user) this.currentUser = data.user;
      if (data.space) {
        this.currentSpace = data.space;
        this.updateHeaderBadges();
      }
    } catch (err) {
      console.warn('Failed to refresh space info:', err);
    }
  },

  handleSpacePaired(data) {
    if (this.currentSpace) {
      this.currentSpace.isFullyPaired = true;
      this.currentSpace.isReserved = true;
      if (data.members) this.currentSpace.members = data.members;
      this.updateHeaderBadges();

      // Celebration effect when partner joins
      window.SocketManager.triggerHeartbeatEffect('Partner Joined!');
    }
  },

  openAvatarCropModal(imageSrc) {
    const modal = document.getElementById('avatarCropModal');
    const cropImg = document.getElementById('avatarCropImg');
    const zoomSlider = document.getElementById('avatarZoomSlider');
    const zoomVal = document.getElementById('avatarZoomVal');
    if (!modal || !cropImg) return;

    modal.style.display = 'flex';

    this.avatarCropState.imageSrc = imageSrc;
    this.avatarCropState.zoom = 110;
    this.avatarCropState.panX = 0;
    this.avatarCropState.panY = 0;

    const STAGE_SIZE = 270;

    cropImg.onload = () => {
      const nw = cropImg.naturalWidth || 400;
      const nh = cropImg.naturalHeight || 400;
      this.avatarCropState.naturalWidth = nw;
      this.avatarCropState.naturalHeight = nh;

      let baseW = STAGE_SIZE;
      let baseH = STAGE_SIZE;
      if (nw >= nh) {
        baseH = STAGE_SIZE;
        baseW = STAGE_SIZE * (nw / nh);
      } else {
        baseW = STAGE_SIZE;
        baseH = STAGE_SIZE * (nh / nw);
      }

      this.avatarCropState.baseW = baseW;
      this.avatarCropState.baseH = baseH;

      cropImg.style.top = '50%';
      cropImg.style.left = '50%';
      cropImg.style.width = `${baseW}px`;
      cropImg.style.height = `${baseH}px`;
      cropImg.style.objectFit = 'fill';

      this.updateAvatarCropTransform();
    };
    cropImg.src = imageSrc;

    if (zoomSlider) zoomSlider.value = 110;
    if (zoomVal) zoomVal.innerText = '110%';
  },

  closeAvatarCropModal() {
    const modal = document.getElementById('avatarCropModal');
    if (modal) modal.style.display = 'none';
  },

  updateAvatarCropTransform() {
    const cropImg = document.getElementById('avatarCropImg');
    if (!cropImg) return;
    const { zoom, panX, panY } = this.avatarCropState;
    const scale = zoom / 100;
    cropImg.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
  },

  initAvatarCropper() {
    const modal = document.getElementById('avatarCropModal');
    const closeBtn = document.getElementById('btnCloseAvatarCrop');
    const stageContainer = document.querySelector('.avatar-crop-stage-container');
    const zoomSlider = document.getElementById('avatarZoomSlider');
    const zoomVal = document.getElementById('avatarZoomVal');
    const btnChangePhoto = document.getElementById('btnChangeAvatarPhoto');
    const btnSaveCrop = document.getElementById('btnSaveAvatarCrop');
    const btnResetCrop = document.getElementById('btnResetAvatarCrop');
    const avatarFileInput = document.getElementById('userAvatarFileInput');

    closeBtn?.addEventListener('click', () => {
      this.closeAvatarCropModal();
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) this.closeAvatarCropModal();
    });

    btnChangePhoto?.addEventListener('click', () => {
      avatarFileInput?.click();
    });

    btnResetCrop?.addEventListener('click', () => {
      this.avatarCropState.zoom = 130;
      this.avatarCropState.panX = 0;
      this.avatarCropState.panY = 0;
      if (zoomSlider) zoomSlider.value = 130;
      if (zoomVal) zoomVal.innerText = '130%';
      this.updateAvatarCropTransform();
    });

    // Quick zoom preset pills
    document.querySelectorAll('.btn-quick-zoom').forEach((btn) => {
      btn.addEventListener('click', () => {
        const z = parseInt(btn.getAttribute('data-zoom') || '130', 10);
        this.avatarCropState.zoom = z;
        if (zoomSlider) zoomSlider.value = z;
        if (zoomVal) zoomVal.innerText = `${z}%`;
        this.updateAvatarCropTransform();
      });
    });

    zoomSlider?.addEventListener('input', (e) => {
      this.avatarCropState.zoom = parseInt(e.target.value, 10);
      if (zoomVal) zoomVal.innerText = `${this.avatarCropState.zoom}%`;
      this.updateAvatarCropTransform();
    });

    // Drag to pan handling (mouse + touch)
    if (stageContainer) {
      const startDrag = (clientX, clientY) => {
        this.avatarCropState.isDragging = true;
        this.avatarCropState.startX = clientX;
        this.avatarCropState.startY = clientY;
        this.avatarCropState.origPanX = this.avatarCropState.panX;
        this.avatarCropState.origPanY = this.avatarCropState.panY;
      };

      const moveDrag = (clientX, clientY) => {
        if (!this.avatarCropState.isDragging) return;
        const dx = clientX - this.avatarCropState.startX;
        const dy = clientY - this.avatarCropState.startY;
        this.avatarCropState.panX = this.avatarCropState.origPanX + dx;
        this.avatarCropState.panY = this.avatarCropState.origPanY + dy;
        this.updateAvatarCropTransform();
      };

      const endDrag = () => {
        this.avatarCropState.isDragging = false;
      };

      stageContainer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
      });

      window.addEventListener('mousemove', (e) => {
        if (this.avatarCropState.isDragging) {
          moveDrag(e.clientX, e.clientY);
        }
      });

      window.addEventListener('mouseup', () => {
        if (this.avatarCropState.isDragging) endDrag();
      });

      stageContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (this.avatarCropState.isDragging && e.touches.length === 1) {
          moveDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      window.addEventListener('touchend', () => {
        if (this.avatarCropState.isDragging) endDrag();
      });
    }

    // Save and export cropped circle
    btnSaveCrop?.addEventListener('click', async () => {
      await this.saveCroppedAvatar();
    });
  },

  async saveCroppedAvatar() {
    const cropImg = document.getElementById('avatarCropImg');
    const stage = document.getElementById('avatarCropStage');
    const saveBtn = document.getElementById('btnSaveAvatarCrop');
    if (!cropImg || !stage) return;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = 'Framing & Saving... ❤️';
    }

    try {
      const canvas = document.createElement('canvas');
      const size = 512; // High-resolution sharp square avatar
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const STAGE_SIZE = 270;
      const scaleMultiplier = size / STAGE_SIZE;

      const { zoom, panX, panY, baseW, baseH } = this.avatarCropState;
      const currentScale = ((zoom || 110) / 100);

      const bW = baseW || STAGE_SIZE;
      const bH = baseH || STAGE_SIZE;

      // Draw onto canvas matching exact circular viewport transform
      ctx.save();
      // Clip to circle so exported avatar is perfectly framed
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      ctx.translate(size / 2 + (panX * scaleMultiplier), size / 2 + (panY * scaleMultiplier));
      ctx.scale(currentScale * scaleMultiplier, currentScale * scaleMultiplier);
      ctx.drawImage(cropImg, -bW / 2, -bH / 2, bW, bH);
      ctx.restore();

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not process avatar image');

      const formData = new FormData();
      formData.append('avatar', blob, 'avatar.png');

      const youImg = document.getElementById('headerAvatarYouImg');
      const fallback = document.getElementById('headerAvatarYouFallback');
      if (youImg) youImg.style.opacity = '0.5';

      const res = await API.uploadAvatar(formData);
      if (res?.avatarUrl) {
        if (this.currentUser) this.currentUser.avatarUrl = res.avatarUrl;
        if (youImg) {
          youImg.src = res.avatarUrl;
          youImg.style.display = 'block';
          youImg.style.opacity = '1';
        }
        if (fallback) fallback.style.display = 'none';

        // Broadcast real-time avatar update to partner
        if (window.SocketManager) {
          window.SocketManager.emitAvatarUpdated({
            userId: this.currentUser?.id || this.currentUser?._id,
            name: this.currentUser?.name,
            avatarUrl: res.avatarUrl,
          });
        }

        this.closeAvatarCropModal();
        if (window.HeartlyDialog) {
          HeartlyDialog.toast('Your profile picture has been framed & updated! ❤️', 'success');
        }
      }
    } catch (err) {
      console.error('Failed to save cropped avatar:', err);
      if (window.HeartlyDialog) {
        HeartlyDialog.alert('Failed to save profile picture: ' + err.message, 'Profile Picture');
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Save Profile Photo ❤️';
      }
    }
  },

  showScreen(screen) {
    const authEl = document.getElementById('authScreen');
    const unlockEl = document.getElementById('unlockScreen');
    const mainEl = document.getElementById('mainApp');

    if (authEl) {
      authEl.style.setProperty('display', screen === 'auth' ? 'flex' : 'none', 'important');
    }
    if (unlockEl) {
      unlockEl.style.setProperty('display', screen === 'unlock' ? 'flex' : 'none', 'important');
      if (screen === 'unlock') {
        setTimeout(() => document.getElementById('unlockPasscode')?.focus(), 80);
      }
    }
    if (mainEl) {
      mainEl.style.setProperty('display', screen === 'main' ? 'flex' : 'none', 'important');
    }

    if (screen !== 'main') {
      window.scrollTo(0, 0);
    }
  },
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
