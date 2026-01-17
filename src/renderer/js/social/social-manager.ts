class SocialManager {
  constructor() {
    this.API_URL =
      'https://fightplannersocialapi.nathancarlos19100.workers.dev';
    this.authToken = null;
    this.userData = null;
    this.autoDownloadInterval = null;
    this.autoDownloadEnabled = true;
    this.autoDownloadIntervalMs = 5 * 60 * 1000;
    this.installingMods = new Set();
    this.serviceUnavailableShown = false;

    // Cache pour réduire les requêtes
    this.cache = {
      links: { data: null, timestamp: 0, ttl: 2 * 60 * 1000 }, // 2 minutes
      friends: { data: null, timestamp: 0, ttl: 2 * 60 * 1000 }, // 2 minutes
      notifications: { data: null, timestamp: 0, ttl: 1 * 60 * 1000 }, // 1 minute
    };
    this.pendingRequests = new Map(); // Éviter les requêtes simultanées
  }

  // Vérifier si le cache est valide
  isCacheValid(key) {
    const cached = this.cache[key];
    if (!cached || !cached.data) return false;
    return Date.now() - cached.timestamp < cached.ttl;
  }

  // Obtenir les données du cache
  getCached(key) {
    if (this.isCacheValid(key)) {
      return this.cache[key].data;
    }
    return null;
  }

  // Mettre à jour le cache
  setCache(key, data) {
    if (this.cache[key]) {
      this.cache[key].data = data;
      this.cache[key].timestamp = Date.now();
    }
  }

  // Invalider le cache
  invalidateCache(key = null) {
    if (key) {
      if (this.cache[key]) {
        this.cache[key].data = null;
        this.cache[key].timestamp = 0;
      }
    } else {
      // Invalider tout le cache
      Object.keys(this.cache).forEach((k) => {
        this.cache[k].data = null;
        this.cache[k].timestamp = 0;
      });
    }
    console.log('[Social] Cache invalidated:', key || 'all');
  }

  // Faire une requête avec cache et évitement de doublons
  async fetchWithCache(url, options = {}, cacheKey = null) {
    // Vérifier le cache d'abord
    if (cacheKey && this.isCacheValid(cacheKey)) {
      console.log('[Social] Using cached data for:', cacheKey);
      return this.getCached(cacheKey);
    }

    // Éviter les requêtes simultanées identiques
    if (this.pendingRequests.has(url)) {
      console.log('[Social] Request already pending, waiting...');
      return await this.pendingRequests.get(url);
    }

    // Créer la promesse
    const requestPromise = fetch(url, options)
      .then(async (response) => {
        const data = await response.json();

        // Mettre en cache si cacheKey fourni
        if (cacheKey && response.ok) {
          this.setCache(cacheKey, data);
        }

        return data;
      })
      .finally(() => {
        // Nettoyer la requête en attente
        this.pendingRequests.delete(url);
      });

    // Stocker la promesse
    this.pendingRequests.set(url, requestPromise);

    return await requestPromise;
  }

  async initialize() {
    try {
      setTimeout(() => {
        this.hideRegisterModal();
        this.hideForgotPasswordModal();
        this.hideRemoveFriendModal();
      }, 10);

      if (window.electronAPI && window.electronAPI.store) {
        const storedToken =
          await window.electronAPI.store.get('social.authToken');
        const storedUserData =
          await window.electronAPI.store.get('social.userData');

        if (storedToken && storedUserData) {
          this.authToken = storedToken;
          this.userData = storedUserData;

          await this.showProfileScreen();

          this.startAutoDownloadCheck();

          this.setupProtocolListeners();
          return;
        }
      }

      const needsOnboarding = await this.checkOnboarding();

      if (needsOnboarding) {
        this.startOnboarding();
      } else {
        this.showLoginScreen();
      }
    } catch (e) {
      console.error('Failed to init social tab:', e);

      this.showLoginScreen();
    }
  }

  async checkOnboarding() {
    try {
      if (
        window.electronAPI &&
        window.electronAPI.store &&
        window.electronAPI.store.get
      ) {
        const done = await window.electronAPI.store.get(
          'social.onboardingDone',
        );
        return !done;
      }
      return true;
    } catch (e) {
      return true;
    }
  }

  async markOnboardingDone() {
    try {
      if (
        window.electronAPI &&
        window.electronAPI.store &&
        window.electronAPI.store.set
      ) {
        await window.electronAPI.store.set('social.onboardingDone', true);
      }
    } catch (e) {
      console.warn('Failed to save onboarding status:', e);
    }
  }

  startOnboarding() {
    this.hideChrome();

    setTimeout(() => {
      const onboarding = document.getElementById('social-onboarding');
      if (onboarding) {
        onboarding.style.display = 'flex';

        setTimeout(() => {
          this.loadOnboardingAnimation();
        }, 50);
      }
    }, 500);
  }

  loadOnboardingAnimation() {
    const onboarding = document.getElementById('social-onboarding');
    if (!onboarding) return;

    const lottieContainer = document.getElementById('social-onboarding-lottie');
    if (lottieContainer && window.lottie) {
      const anim = window.lottie.loadAnimation({
        container: lottieContainer,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        path: '../assets/images/social1.json',
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid slice',
          className: 'lottie-animation-fullscreen',
          clearCanvas: true,
        },
      });

      anim.addEventListener('DOMLoaded', () => {
        const svg = lottieContainer.querySelector('svg');
        if (svg) {
          svg.style.position = 'absolute';
          svg.style.top = '0';
          svg.style.left = '0';
          svg.style.width = '100%';
          svg.style.height = '100%';
          svg.style.maxWidth = 'none';
          svg.style.maxHeight = 'none';
          svg.style.margin = '0';
          svg.style.padding = '0';
          svg.style.overflow = 'visible';
          svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        }
      });

      let overlayShown = false;
      let paused = false;
      anim.addEventListener('enterFrame', () => {
        if (anim.totalFrames && anim.currentFrame !== undefined) {
          const frameRate = anim.frameRate || 30;
          const currentTime = anim.currentFrame / frameRate;

          if (!overlayShown && currentTime >= 3.73) {
            overlayShown = true;
            setTimeout(() => {
              const overlay = document.querySelector(
                '.social-onboarding-overlay',
              );
              if (overlay) {
                overlay.style.opacity = '1';
                overlay.style.pointerEvents = 'auto';
              }

              const button = document.getElementById('social-get-started');
              if (button) {
                button.style.pointerEvents = 'auto';
                button.style.cursor = 'pointer';
              }
            }, 100);
          }

          if (!paused && currentTime >= 4.35) {
            anim.pause();
            paused = true;
          }
        }
      });

      this.onboardingAnim = anim;
    }

    const getStartedBtn = document.getElementById('social-get-started');
    if (getStartedBtn) {
      getStartedBtn.addEventListener(
        'click',
        () => {
          this.finishOnboarding();
        },
        { once: true },
      );
    }
  }

  finishOnboarding() {
    if (this.onboardingAnim) {
      try {
        this.onboardingAnim.destroy();
      } catch (e) {}
      this.onboardingAnim = null;
    }

    const onboarding = document.getElementById('social-onboarding');
    if (onboarding) {
      onboarding.style.display = 'none';
    }

    this.markOnboardingDone();

    this.showChrome();

    this.showLoginScreen();
  }

  showLoginScreen() {
    const loginContainer = document.getElementById('social-login-container');
    if (loginContainer) {
      loginContainer.style.display = 'flex';

      const container = document.getElementById('social-lottie');
      if (container && window.lottie) {
        if (this.loginAnim) {
          try {
            this.loginAnim.destroy();
          } catch (e) {
            console.warn('Error destroying login animation:', e);
          }
          this.loginAnim = null;
        }

        container.innerHTML = '';

        this.loginAnim = window.lottie.loadAnimation({
          container,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: '../assets/images/social.json',
        });
      }

      this.setupButtons();
    }
  }

  hideChrome() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.style.transform = 'translateX(-100%)';
      sidebar.style.transition = 'transform 0.5s ease-out';
    }

    const bottomBar = document.querySelector('.bottom-bar');
    if (bottomBar) {
      bottomBar.style.transform = 'translateY(100%)';
      bottomBar.style.transition = 'transform 0.5s ease-out';
    }
  }

  showChrome() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.style.transform = 'translateX(0)';
      sidebar.style.transition = 'transform 0.5s ease-out';
    }

    const bottomBar = document.querySelector('.bottom-bar');
    if (bottomBar) {
      bottomBar.style.transform = 'translateY(0)';
      bottomBar.style.transition = 'transform 0.5s ease-out';
    }
  }

  async login(email, password) {
    try {
      const response = await fetch(`${this.API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const rawText = await response.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        this.showServiceErrorModal(
          'modals.socialServiceUnavailable.title',
          'modals.socialServiceUnavailable.invalidResponse',
        );
        throw new Error('Invalid JSON response from social API');
      }

      if (!response.ok || data.error) {
        if (
          await this.handleServiceUnavailable(
            data?.error?.message || JSON.stringify(data),
            response.status,
          )
        ) {
          throw new Error('Service temporarily unavailable');
        }

        if (response.status === 429 || response.status === 404) {
          this.showServiceErrorModal(
            'modals.socialServiceUnavailable.title',
            'modals.socialServiceUnavailable.rateLimited',
          );
          throw new Error(`Social service error ${response.status}`);
        }

        let errorMessage = 'Login failed';

        if (data.error) {
          if (data.error.message === 'USER_DISABLED') {
            const disableReason =
              data.error.disableReason || 'Account has been disabled';
            errorMessage = `Account disabled: ${disableReason}`;
          } else if (data.error.message) {
            const errorMessages = {
              EMAIL_NOT_FOUND: 'Email not found',
              INVALID_PASSWORD: 'Invalid password',
              INVALID_EMAIL: 'Invalid email address',
              USER_DISABLED: 'Account disabled',
              TOO_MANY_ATTEMPTS_TRY_LATER:
                'Too many attempts, please try again later',
            };
            errorMessage =
              errorMessages[data.error.message] || data.error.message;
          }
        }

        throw new Error(errorMessage);
      }

      this.authToken = data.idToken;
      this.userData = {
        localId: data.localId,
        email: data.email,
        displayName: data.displayName || '',
        refreshToken: data.refreshToken,
      };

      if (window.electronAPI && window.electronAPI.store) {
        try {
          await window.electronAPI.store.set(
            'social.authToken',
            this.authToken,
          );
          await window.electronAPI.store.set('social.userData', this.userData);
        } catch (e) {
          console.warn('Failed to save auth data:', e);
        }
      }

      return { success: true, data };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  setupButtons() {
    const form = document.getElementById('social-login-form');
    const emailInput = document.getElementById('social-email');
    const passInput = document.getElementById('social-password');
    const remember = document.getElementById('social-remember');
    const forgot = document.getElementById('social-forgot');
    const create = document.getElementById('social-create');
    const submitButton = form
      ? form.querySelector('button[type="submit"]')
      : null;

    if (form && emailInput && passInput) {
      if (
        window.electronAPI &&
        window.electronAPI.store &&
        window.electronAPI.store.get
      ) {
        window.electronAPI.store
          .get('social.rememberEmail')
          .then((val) => {
            if (val && !emailInput.value) emailInput.value = val;
          })
          .catch(() => {});
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const password = passInput.value;

        if (!email || !password) {
          if (window.toastManager)
            window.toastManager.error('toasts.pleaseEnterEmailAndPassword');
          return;
        }

        const originalButtonText = submitButton ? submitButton.innerHTML : '';
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.innerHTML =
            '<i class="bi bi-hourglass-split"></i> Signing in...';
        }
        emailInput.disabled = true;
        passInput.disabled = true;

        try {
          if (window.toastManager) window.toastManager.info('toasts.signingIn');

          await this.login(email, password);

          if (window.toastManager)
            window.toastManager.success('toasts.signedInSuccessfully');

          if (remember && remember.checked && window.electronAPI) {
            try {
              await window.electronAPI.store.set('social.rememberEmail', email);
            } catch (e) {}
          }

          await this.showProfileScreen();

          this.startAutoDownloadCheck();

          this.setupProtocolListeners();
        } catch (err) {
          const errorMsg = err.message || 'toasts.loginFailed';
          if (window.toastManager) {
            // Si c'est une clé de traduction, utiliser directement, sinon utiliser le message d'erreur
            if (errorMsg.startsWith('toasts.')) {
              window.toastManager.error(errorMsg);
            } else {
              // Message d'erreur personnalisé, on le garde tel quel
              window.toastManager.error(errorMsg);
            }
          }
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
          }
          emailInput.disabled = false;
          passInput.disabled = false;
        }
      });
    }

    if (forgot) {
      forgot.addEventListener('click', (e) => {
        e.preventDefault();
        this.showForgotPasswordModal();
      });
    }

    if (create) {
      create.addEventListener('click', (e) => {
        e.preventDefault();
        this.showRegisterModal();
      });
    }

    this.setupForgotPasswordModal();

    this.setupRegisterModal();

    this.setupRemoveFriendModal();
  }

  showForgotPasswordModal() {
    if (this.authToken && this.userData) {
      console.log(
        '[Social] Cannot show forgot password modal: user is already logged in',
      );
      return;
    }

    const modal = document.getElementById('social-forgot-modal');
    if (modal) {
      modal.style.display = 'flex';
      modal.style.opacity = '1';

      const emailInput = document.getElementById('social-email');
      const forgotEmailInput = document.getElementById('social-forgot-email');
      if (emailInput && forgotEmailInput && emailInput.value) {
        forgotEmailInput.value = emailInput.value;
      }
    }
  }

  hideForgotPasswordModal() {
    const modal = document.getElementById('social-forgot-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.style.opacity = '0';
      const form = document.getElementById('social-forgot-form');
      if (form) form.reset();
    }
  }

  setupForgotPasswordModal() {
    const modal = document.getElementById('social-forgot-modal');
    const closeBtn = document.getElementById('social-forgot-close');
    const form = document.getElementById('social-forgot-form');
    const emailInput = document.getElementById('social-forgot-email');
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideForgotPasswordModal();
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideForgotPasswordModal();
        }
      });
    }

    if (form && emailInput) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();

        if (!email) {
          if (window.toastManager)
            window.toastManager.error('toasts.pleaseEnterEmail');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML =
            '<i class="bi bi-hourglass-split"></i> Sending...';
        }

        try {
          const response = await fetch(`${this.API_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });

          const data = await response.json();

          if (response.ok && !data.error) {
            if (window.toastManager) {
              window.toastManager.success(
                'Password reset email sent! Check your inbox.',
              );
            }
            this.hideForgotPasswordModal();
          } else {
            const errorMsg =
              data.error?.message || 'Failed to send reset email';
            let userMessage = 'Failed to send reset email';

            if (errorMsg.includes('EMAIL_NOT_FOUND')) {
              userMessage = 'toasts.emailNotFound';
            } else if (errorMsg.includes('INVALID_EMAIL')) {
              userMessage = 'toasts.invalidEmail';
            } else {
              userMessage = 'toasts.failedToSendResetEmail';
            }

            if (window.toastManager) window.toastManager.error(userMessage);
          }
        } catch (error) {
          console.error('Password reset error:', error);
          if (window.toastManager)
            window.toastManager.error('toasts.failedToSendResetEmail');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML =
              '<i class="bi bi-envelope"></i> Send Reset Link';
          }
        }
      });
    }
  }

  showRegisterModal() {
    if (this.authToken && this.userData) {
      console.log(
        '[Social] Cannot show register modal: user is already logged in',
      );
      return;
    }

    const modal = document.getElementById('social-register-modal');
    if (modal) {
      modal.style.display = 'flex';
      modal.style.opacity = '1';

      const emailInput = document.getElementById('social-email');
      const registerEmailInput = document.getElementById(
        'social-register-email',
      );
      if (emailInput && registerEmailInput && emailInput.value) {
        registerEmailInput.value = emailInput.value;
      }
    }
  }

  hideRegisterModal() {
    const modal = document.getElementById('social-register-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.style.opacity = '0';
      const form = document.getElementById('social-register-form');
      if (form) form.reset();
    }
  }

  setupRegisterModal() {
    const modal = document.getElementById('social-register-modal');
    const closeBtn = document.getElementById('social-register-close');
    const form = document.getElementById('social-register-form');
    const usernameInput = document.getElementById('social-register-username');
    const emailInput = document.getElementById('social-register-email');
    const passwordInput = document.getElementById('social-register-password');
    const passwordConfirmInput = document.getElementById(
      'social-register-password-confirm',
    );
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideRegisterModal();
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideRegisterModal();
        }
      });
    }

    if (
      form &&
      usernameInput &&
      emailInput &&
      passwordInput &&
      passwordConfirmInput
    ) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const passwordConfirm = passwordConfirmInput.value;

        if (!username || !email || !password || !passwordConfirm) {
          if (window.toastManager)
            window.toastManager.error('toasts.pleaseFillAllFields');
          return;
        }

        if (password.length < 6) {
          if (window.toastManager)
            window.toastManager.error('toasts.passwordMinLength');
          return;
        }

        if (password !== passwordConfirm) {
          if (window.toastManager)
            window.toastManager.error('toasts.passwordsDoNotMatch');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML =
            '<i class="bi bi-hourglass-split"></i> Creating account...';
        }

        try {
          const response = await fetch(`${this.API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, username }),
          });

          const data = await response.json();

          if (response.ok && !data.error && data.localId) {
            if (window.toastManager) {
              window.toastManager.success('toasts.accountCreated');
            }

            try {
              await this.login(email, password);

              if (window.toastManager)
                window.toastManager.success('toasts.signedInSuccessfully');

              this.hideRegisterModal();

              await this.showProfileScreen();

              this.startAutoDownloadCheck();

              this.setupProtocolListeners();
            } catch (loginError) {
              if (window.toastManager) {
                window.toastManager.error(
                  'toasts.accountCreatedButFailedToSignIn',
                );
              }
            }
          } else {
            const errorMsg = data.error?.message || 'Failed to create account';
            let userMessage = 'Failed to create account';

            if (errorMsg.includes('EMAIL_EXISTS')) {
              userMessage = 'toasts.emailAlreadyExists';
            } else if (errorMsg.includes('INVALID_EMAIL')) {
              userMessage = 'toasts.invalidEmail';
            } else if (errorMsg.includes('WEAK_PASSWORD')) {
              userMessage = 'toasts.weakPassword';
            } else {
              userMessage = 'toasts.failedToCreateAccount';
            }

            if (window.toastManager) window.toastManager.error(userMessage);
          }
        } catch (error) {
          console.error('Registration error:', error);
          if (window.toastManager)
            window.toastManager.error('toasts.failedToCreateAccount');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML =
              '<i class="bi bi-person-plus"></i> Create Account';
          }
        }
      });
    }
  }

  async showProfileScreen() {
    const loginContainer = document.getElementById('social-login-container');
    if (loginContainer) {
      loginContainer.style.display = 'none';
    }

    const onboarding = document.getElementById('social-onboarding');
    if (onboarding) {
      onboarding.style.display = 'none';
    }

    this.hideRegisterModal();
    this.hideForgotPasswordModal();
    this.hideRemoveFriendModal();

    const profileContainer = document.getElementById(
      'social-profile-container',
    );
    if (profileContainer) {
      profileContainer.style.display = 'flex';

      await this.loadUserProfile();
      this.setupProfileButtons();
      this.setupNavigation();
    }
  }

  setupNavigation() {
    const navItems = document.querySelectorAll('.social-nav-item');
    navItems.forEach((item) => {
      item.addEventListener('click', () => {
        const section = item.getAttribute('data-section');
        this.switchSection(section);
      });
    });
  }

  switchSection(sectionName) {
    const currentSections = document.querySelectorAll('.social-section.active');
    currentSections.forEach((section) => {
      section.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      section.style.opacity = '0';
      section.style.transform = 'translateX(-10px)';
    });

    const navItems = document.querySelectorAll('.social-nav-item');
    navItems.forEach((item) => {
      if (item.getAttribute('data-section') === sectionName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    setTimeout(() => {
      const sections = document.querySelectorAll('.social-section');
      sections.forEach((section) => {
        if (section.id === `social-section-${sectionName}`) {
          section.classList.add('active');
          section.style.opacity = '0';
          section.style.transform = 'translateX(10px)';

          setTimeout(() => {
            section.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            section.style.opacity = '1';
            section.style.transform = 'translateX(0)';
          }, 10);
        } else {
          section.classList.remove('active');
          section.style.opacity = '';
          section.style.transform = '';
          section.style.transition = '';
        }
      });
    }, 200);

    switch (sectionName) {
      case 'feed':
        setTimeout(() => this.loadFeed(), 250);
        break;
      case 'my-mods':
        setTimeout(() => this.loadMyMods(), 250);
        break;
      case 'friends':
        setTimeout(() => this.loadFriends(), 250);
        break;
      case 'profile':
        break;
      case 'user-profile':
        break;
    }
  }

  async loadFeed() {
    const feedContent = document.getElementById('social-feed-content');
    if (!feedContent || !this.authToken) return;

    feedContent.innerHTML =
      '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading mods...</p></div>';

    try {
      const modsData = await this.fetchWithCache(
        `${this.API_URL}/list/links?idToken=${this.authToken}`,
        {},
        'links',
      );

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      if (Array.isArray(mods) && mods.length > 0) {
        const userId = this.userData?.localId;
        const usernameEl = document.getElementById('social-profile-username');
        const username = usernameEl ? usernameEl.textContent : null;

        feedContent.innerHTML =
          '<div class="social-mods-grid">' +
          mods
            .map((mod) => {
              const modUserId = mod.userId;
              const modPseudo = mod.pseudo;
              const isOwn =
                modUserId === userId || (username && modPseudo === username);
              return this.renderModCard(mod, isOwn);
            })
            .join('') +
          '</div>';

        setTimeout(() => {
          const cards = feedContent.querySelectorAll('.social-mod-card');
          cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px) scale(0.95)';
            setTimeout(() => {
              card.style.transition = 'all 0.3s ease';
              card.style.opacity = '1';
              card.style.transform = 'translateY(0) scale(1)';
            }, index * 30);
          });
        }, 50);
      } else {
        feedContent.innerHTML =
          '<div class="social-empty-state"><i class="bi bi-inbox"></i><p>No mods to discover yet</p></div>';
      }
    } catch (error) {
      console.error('[Social] Error loading feed:', error);
      feedContent.innerHTML =
        '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load mods</p></div>';
    }
  }

  async loadMyMods() {
    const myModsContent = document.getElementById('social-my-mods-content');
    if (!myModsContent || !this.userData) return;

    myModsContent.innerHTML =
      '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading your mods...</p></div>';

    try {
      const userId = this.userData.localId;
      const usernameEl = document.getElementById('social-profile-username');
      const username = usernameEl ? usernameEl.textContent : null;

      const modsData = await this.fetchWithCache(
        `${this.API_URL}/list/links?idToken=${this.authToken}`,
        {},
        'links',
      );

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      if (Array.isArray(mods)) {
        const myMods = mods.filter((mod) => {
          const modUserId = mod.userId;
          const modPseudo = mod.pseudo;
          return modUserId === userId || (username && modPseudo === username);
        });

        if (myMods.length > 0) {
          myModsContent.innerHTML =
            '<div class="social-mods-grid">' +
            myMods.map((mod) => this.renderModCard(mod, true)).join('') +
            '</div>';

          setTimeout(() => {
            const cards = myModsContent.querySelectorAll('.social-mod-card');
            cards.forEach((card, index) => {
              card.style.opacity = '0';
              card.style.transform = 'translateY(20px) scale(0.95)';
              setTimeout(() => {
                card.style.transition = 'all 0.3s ease';
                card.style.transform = 'translateY(0) scale(1)';
                card.style.opacity = '1';
              }, index * 30);
            });
          }, 50);
        } else {
          myModsContent.innerHTML =
            '<div class="social-empty-state"><i class="bi bi-collection"></i><p>You haven\'t shared any mods yet</p></div>';
        }
      }
    } catch (error) {
      console.error('[Social] Error loading my mods:', error);
      myModsContent.innerHTML =
        '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load your mods</p></div>';
    }
  }

  async loadFriends() {
    const friendsContent = document.getElementById('social-friends-content');
    const friendsListContainer = document.getElementById(
      'social-friends-list-container',
    );
    const friendRequestsSection = document.getElementById(
      'social-friend-requests-section',
    );
    const friendRequestsList = document.getElementById(
      'social-friend-requests-list',
    );

    if (!friendsContent || !this.authToken) return;

    if (friendsListContainer) {
      friendsListContainer.innerHTML =
        '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading friends...</p></div>';
    }
    if (friendRequestsList) {
      friendRequestsList.innerHTML = '';
    }

    try {
      const data = await this.fetchWithCache(
        `${this.API_URL}/links-friends`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: this.authToken }),
        },
        'friends',
      );

      if (data.friends && Array.isArray(data.friends)) {
        const currentUserId = this.userData?.localId;
        const acceptedFriends = data.friends.filter(
          (f) => f.status === 'accepted',
        );
        const pendingRequests = data.friends.filter((f) => {
          if (f.status !== 'pending') return false;
          const user1 = f.user_1 || f.user1;
          const user2 = f.user_2 || f.user2;

          return user2 === currentUserId;
        });

        if (
          pendingRequests.length > 0 &&
          friendRequestsList &&
          friendRequestsSection
        ) {
          const requestPromises = pendingRequests.map((req) =>
            this.renderFriendRequest(req),
          );
          const renderedRequests = await Promise.all(requestPromises);
          friendRequestsList.innerHTML = renderedRequests.join('');
          friendRequestsSection.style.display = 'block';

          setTimeout(() => {
            const cards = friendRequestsList.querySelectorAll(
              '.social-friend-request-card',
            );
            cards.forEach((card, index) => {
              card.style.opacity = '0';
              card.style.transform = 'translateY(-10px)';
              setTimeout(() => {
                card.style.transition = 'all 0.3s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
              }, index * 50);
            });
          }, 50);
        } else if (friendRequestsSection) {
          friendRequestsSection.style.display = 'none';
        }

        if (acceptedFriends.length > 0 && friendsListContainer) {
          const friendPromises = acceptedFriends.map((friend) =>
            this.renderFriendCard(friend),
          );
          const renderedFriends = await Promise.all(friendPromises);

          friendsListContainer.innerHTML =
            '<div class="social-friends-list">' +
            renderedFriends.join('') +
            '</div>';

          setTimeout(() => {
            const cards = friendsListContainer.querySelectorAll(
              '.social-friend-card',
            );
            cards.forEach((card, index) => {
              card.style.opacity = '0';
              card.style.transform = 'translateX(-20px)';
              setTimeout(() => {
                card.style.transition = 'all 0.3s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateX(0)';
              }, index * 50);
            });
          }, 50);
        } else if (friendsListContainer) {
          friendsListContainer.innerHTML =
            '<div class="social-empty-state"><i class="bi bi-people"></i><p>No friends yet</p></div>';
        }
      }
    } catch (error) {
      console.error('[Social] Error loading friends:', error);
      if (friendsListContainer) {
        friendsListContainer.innerHTML =
          '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load friends</p></div>';
      }
    }
  }

  async renderFriendRequest(request) {
    const senderId = request.user_1 || request.user1;
    let senderUsername =
      request.senderUsername || request.username || 'Unknown';

    if (senderId && senderUsername === 'Unknown') {
      try {
        const userResponse = await fetch(
          `${this.API_URL}/read/users/${senderId}`,
        );
        const userData = await userResponse.json();
        if (userData.fields && userData.fields.username) {
          senderUsername = userData.fields.username.stringValue || 'Unknown';
        }
      } catch (e) {
        console.warn('Failed to fetch sender username:', e);
      }
    }

    return `
            <div class="social-friend-request-card">
                <div class="social-friend-avatar">
                    <i class="bi bi-person-circle"></i>
                </div>
                <div class="social-friend-info">
                    <h3 class="social-friend-name">${senderUsername}</h3>
                    <p class="social-friend-status">Wants to be your friend</p>
                </div>
                <div class="social-friend-request-actions">
                    <button class="social-btn social-btn-success social-accept-friend-btn" data-request-id="${request.id}">
                        <i class="bi bi-check-lg"></i> Accept
                    </button>
                    <button class="social-btn social-btn-danger social-reject-friend-btn" data-request-id="${request.id}">
                        <i class="bi bi-x-lg"></i> Reject
                    </button>
                </div>
            </div>
        `;
  }

  renderModCard(mod, isOwn = false) {
    const installedClass = mod.modInstalled ? 'installed' : '';
    const installedBadge = mod.modInstalled
      ? '<span class="social-mod-badge installed"><i class="bi bi-check-circle"></i> Installed</span>'
      : '';
    const creator = mod.pseudo || mod.creator || 'Unknown';
    const creatorClass = isOwn ? '' : 'social-creator-link';

    return `
            <div class="social-mod-card ${installedClass}">
                ${
                  mod.image_url
                    ? `<img src="${mod.image_url}" alt="${
                        mod.mod_name || 'Mod'
                      }" class="social-mod-image">`
                    : '<div class="social-mod-image-placeholder"><i class="bi bi-image"></i></div>'
                }
                <div class="social-mod-info">
                    <h3 class="social-mod-name">${
                      mod.mod_name || 'Unknown Mod'
                    }</h3>
                    <p class="social-mod-creator">
                        by <span class="${creatorClass}" data-username="${creator}" data-userid="${
                          mod.userId || ''
                        }">${creator}</span>
                    </p>
                    ${installedBadge}
                    ${
                      isOwn && mod.link && mod.link.startsWith('fightplanner:')
                        ? `<button class="social-mod-download-btn" data-link="${
                            mod.link
                          }"><i class="bi bi-download"></i> ${
                            mod.modInstalled ? 'Re-download' : 'Download'
                          }</button>`
                        : ''
                    }
                </div>
            </div>
        `;
  }

  async renderFriendCard(friend) {
    const friendId =
      friend.friendId || friend.userId || friend.user_1 || friend.user_2 || '';
    const friendRelationId = friend.id || '';
    let friendUsername = friend.username || friend.friendUsername || 'Unknown';
    const photoURL = friend.photoURL || '';

    if (
      friendUsername === 'Unknown' &&
      friendId &&
      friendId !== this.userData?.localId
    ) {
      try {
        const userResponse = await fetch(
          `${this.API_URL}/read/users/${friendId}`,
        );
        const userData = await userResponse.json();
        if (userData.fields && userData.fields.username) {
          friendUsername = userData.fields.username.stringValue || 'Unknown';
        }
      } catch (e) {
        console.warn('Failed to fetch friend username:', e);
      }
    }

    return `
            <div class="social-friend-card social-creator-link" data-username="${friendUsername}" data-userid="${friendId}">
                <div class="social-friend-avatar">
                    ${
                      photoURL
                        ? `<img src="${photoURL}" alt="${friendUsername}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">`
                        : '<i class="bi bi-person-circle"></i>'
                    }
                </div>
                <div class="social-friend-info">
                    <h3 class="social-friend-name">${friendUsername}</h3>
                    <p class="social-friend-status">Friend</p>
                </div>
                <button class="social-remove-friend-btn" data-relation-id="${friendRelationId}" data-friend-id="${friendId}" title="Remove Friend">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        `;
  }

  async loadUserProfile() {
    if (!this.authToken || !this.userData) {
      console.error('No auth token or user data available');
      return;
    }

    try {
      const userId = this.userData.localId;

      const response = await fetch(`${this.API_URL}/read/users/${userId}`);
      const data = await response.json();

      if (response.ok && data.fields) {
        const userFields = {};
        Object.entries(data.fields).forEach(([key, value]) => {
          userFields[key] = Object.values(value)[0];
        });

        const usernameEl = document.getElementById('social-profile-username');
        const emailEl = document.getElementById('social-profile-email');
        const avatarEl = document.getElementById('social-profile-avatar');
        const usernameInput = document.getElementById('social-edit-username');
        const privacyVisibility = document.getElementById(
          'social-privacy-visibility',
        );
        const privacySync = document.getElementById('social-privacy-sync');

        if (usernameEl) usernameEl.textContent = userFields.username || 'User';
        if (emailEl) emailEl.textContent = this.userData.email || '';
        if (avatarEl)
          avatarEl.src =
            userFields.photoURL || 'https://files.catbox.moe/xry0hs.png';
        if (usernameInput) usernameInput.value = userFields.username || '';

        if (
          userFields.privacySettings &&
          typeof userFields.privacySettings === 'object'
        ) {
          const privacy = userFields.privacySettings;
          if (privacyVisibility) {
            privacyVisibility.value = privacy.modsVisibility || 'global';
          }
          if (privacySync) {
            privacySync.checked = privacy.allowSync !== false;
          }
        } else {
          if (privacyVisibility) privacyVisibility.value = 'global';
          if (privacySync) privacySync.checked = true;
        }

        await this.loadAutoDownloadSettingsToUI();

        await this.loadUserStats();

        setTimeout(() => {
          if (
            document
              .querySelector('.social-nav-item[data-section="feed"]')
              ?.classList.contains('active')
          ) {
            this.loadFeed();
          }
        }, 100);
      } else {
        console.error('Failed to load user profile:', data);
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToLoadProfileData');
        }
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToLoadProfile');
      }
    }
  }

  async loadUserStats() {
    if (!this.authToken || !this.userData) return;

    try {
      const userId = this.userData.localId;

      const usernameEl = document.getElementById('social-profile-username');
      const username = usernameEl ? usernameEl.textContent : null;

      const modsData = await this.fetchWithCache(
        `${this.API_URL}/list/links?idToken=${this.authToken}`,
        {},
        'links',
      );

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      let modsCount = 0;
      if (Array.isArray(mods)) {
        modsCount = mods.filter((mod) => {
          const modUserId = mod.userId;
          const modPseudo = mod.pseudo;
          return modUserId === userId || (username && modPseudo === username);
        }).length;
      }

      const friendsData = await this.fetchWithCache(
        `${this.API_URL}/links-friends`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: this.authToken }),
        },
        'friends',
      );

      let friendsCount = 0;
      if (friendsData.friends && Array.isArray(friendsData.friends)) {
        friendsCount = friendsData.friends.filter(
          (f) => f.status === 'accepted',
        ).length;
      }

      const modsStatEl = document.getElementById('social-stat-mods');
      const friendsStatEl = document.getElementById('social-stat-friends');

      if (modsStatEl) modsStatEl.textContent = modsCount;
      if (friendsStatEl) friendsStatEl.textContent = friendsCount;
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  }

  setupProfileButtons() {
    const saveUsernameBtn = document.getElementById('social-save-username');
    if (saveUsernameBtn) {
      saveUsernameBtn.addEventListener('click', async () => {
        await this.updateUsername();
      });
    }

    const savePrivacyBtn = document.getElementById('social-save-privacy');
    if (savePrivacyBtn) {
      savePrivacyBtn.addEventListener('click', async () => {
        await this.updatePrivacySettings();
      });
    }

    const saveAutoDownloadBtn = document.getElementById(
      'social-save-auto-download',
    );
    if (saveAutoDownloadBtn) {
      saveAutoDownloadBtn.addEventListener('click', async () => {
        await this.updateAutoDownloadSettings();
      });
    }

    const logoutBtn = document.getElementById('social-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await this.logout();
      });
    }

    document.addEventListener('click', async (e) => {
      const clickedElement = e.target;
      const removeBtn = clickedElement.closest('.social-remove-friend-btn');

      if (
        removeBtn ||
        clickedElement.classList.contains('social-remove-friend-btn') ||
        (clickedElement.tagName === 'I' &&
          clickedElement.closest('.social-remove-friend-btn'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (!this.authToken) {
          console.error('[Social] Cannot remove friend: user not logged in');
          return false;
        }

        this.hideRegisterModal();
        this.hideForgotPasswordModal();

        const btn =
          clickedElement.closest('.social-remove-friend-btn') || clickedElement;
        const relationId = btn.getAttribute('data-relation-id');
        const friendId = btn.getAttribute('data-friend-id');

        console.log('[Social] Remove friend button clicked:', {
          relationId,
          friendId,
          clickedElement: clickedElement.tagName,
          button: btn,
        });

        if (relationId) {
          this.removeFriend(relationId, friendId);
        } else {
          console.error(
            '[Social] No relationId found on remove friend button. Button:',
            btn,
          );
        }
        return false;
      }

      if (this.authToken && this.userData) {
        if (
          e.target.closest('#social-remove-friend-modal') ||
          e.target.closest('#social-register-modal') ||
          e.target.closest('#social-forgot-modal')
        ) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }

      if (e.target.closest('.social-mod-download-btn')) {
        const btn = e.target.closest('.social-mod-download-btn');
        const link = btn.getAttribute('data-link');
        if (
          link &&
          link.startsWith('fightplanner:') &&
          window.electronAPI &&
          window.electronAPI.openFightPlannerLink
        ) {
          window.electronAPI.openFightPlannerLink(link);
        }
      }

      if (
        e.target.closest('.social-creator-link') &&
        !e.target.closest('.social-remove-friend-btn')
      ) {
        const creatorLink = e.target.closest('.social-creator-link');
        const username = creatorLink.getAttribute('data-username');
        const userId = creatorLink.getAttribute('data-userid');
        if (username && !e.target.closest('.social-mod-download-btn')) {
          this.showUserProfile(username, userId);
        }
      }

      if (e.target.closest('#social-back-btn')) {
        this.switchSection('feed');
      }

      if (e.target.closest('#social-add-friend-btn')) {
        const btn = e.target.closest('#social-add-friend-btn');
        let userId = btn.getAttribute('data-userid');
        const username =
          btn.getAttribute('data-username') || this.viewedUsername;

        if (!userId) {
          userId = this.viewedUserId;
          if (!userId && username) {
            const addFriendText = document.getElementById(
              'social-add-friend-text',
            );
            if (addFriendText) addFriendText.textContent = 'Finding user...';
            btn.disabled = true;

            try {
              const modsData = await this.fetchWithCache(
                `${this.API_URL}/list/links?idToken=${this.authToken}`,
                {},
                'links',
              );

              // Handle both array and paginated response
              const mods = Array.isArray(modsData)
                ? modsData
                : modsData.documents || [];

              if (Array.isArray(mods)) {
                const userMod = mods.find(
                  (mod) => (mod.pseudo || mod.creator) === username,
                );
                if (userMod && userMod.userId) {
                  userId = userMod.userId;
                  this.viewedUserId = userId;
                  btn.setAttribute('data-userid', userId);
                  btn.disabled = false;
                  if (addFriendText) addFriendText.textContent = 'Add Friend';
                }
              }
            } catch (err) {
              console.error('[Social] Error finding userId:', err);
              btn.disabled = false;
              if (addFriendText) addFriendText.textContent = 'Add Friend';
            }
          }
        }

        if (userId) {
          this.sendFriendRequest(userId);
        } else {
          if (window.toastManager)
            window.toastManager.error(
              'Could not find user ID. Please try again.',
            );
          const addFriendText = document.getElementById(
            'social-add-friend-text',
          );
          if (addFriendText) addFriendText.textContent = 'Add Friend';
          btn.disabled = false;
        }
      }

      if (e.target.closest('.social-accept-friend-btn')) {
        const btn = e.target.closest('.social-accept-friend-btn');
        const requestId = btn.getAttribute('data-request-id');
        if (requestId) {
          this.acceptFriendRequest(requestId);
        }
      }

      if (e.target.closest('.social-reject-friend-btn')) {
        const btn = e.target.closest('.social-reject-friend-btn');
        const requestId = btn.getAttribute('data-request-id');
        if (requestId) {
          this.rejectFriendRequest(requestId);
        }
      }
    });
  }

  async updateAddFriendButton(username, userId) {
    const addFriendBtn = document.getElementById('social-add-friend-btn');
    const addFriendText = document.getElementById('social-add-friend-text');

    if (!addFriendBtn) return;

    if (!this.userData) {
      addFriendBtn.style.display = 'none';
      return;
    }

    const targetUserId = userId || this.viewedUserId;

    if (targetUserId && targetUserId === this.userData.localId) {
      addFriendBtn.style.display = 'none';
      return;
    }

    addFriendBtn.style.display = 'block';
    addFriendBtn.style.opacity = '0';
    addFriendBtn.style.transform = 'translateY(-10px)';
    addFriendBtn.disabled = true;
    if (addFriendText) addFriendText.textContent = 'Add Friend';

    setTimeout(() => {
      addFriendBtn.style.transition = 'all 0.3s ease';
      addFriendBtn.style.opacity = '1';
      addFriendBtn.style.transform = 'translateY(0)';
    }, 100);

    this.checkFriendshipStatus(
      addFriendBtn,
      addFriendText,
      targetUserId,
      username,
    );
  }

  async checkFriendshipStatus(
    addFriendBtn,
    addFriendText,
    targetUserId,
    username,
  ) {
    if (!targetUserId) {
      addFriendBtn.disabled = false;
      if (addFriendText) addFriendText.textContent = 'Add Friend';
      addFriendBtn.setAttribute('data-username', username);
      return;
    }

    try {
      const data = await this.fetchWithCache(
        `${this.API_URL}/links-friends`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: this.authToken }),
        },
        'friends',
      );

      if (data.friends && Array.isArray(data.friends)) {
        const currentUserId = this.userData.localId;
        const existingRelation = data.friends.find((f) => {
          const user1 = f.user_1 || f.user1;
          const user2 = f.user_2 || f.user2;
          return (
            (user1 === currentUserId && user2 === targetUserId) ||
            (user1 === targetUserId && user2 === currentUserId)
          );
        });

        if (existingRelation) {
          const status = existingRelation.status;
          if (status === 'accepted') {
            addFriendBtn.style.transition = 'all 0.3s ease';
            addFriendBtn.style.opacity = '0';
            addFriendBtn.style.transform = 'translateY(-10px)';
            setTimeout(() => {
              addFriendBtn.style.display = 'none';
            }, 300);
          } else if (status === 'pending') {
            const isSender =
              existingRelation.user_1 === currentUserId ||
              existingRelation.user1 === currentUserId;
            addFriendBtn.disabled = true;
            if (addFriendText)
              addFriendText.textContent = isSender
                ? 'Request Sent'
                : 'Pending Request';
            addFriendBtn.setAttribute('data-request-id', existingRelation.id);
          }
        } else {
          addFriendBtn.disabled = false;
          if (addFriendText) addFriendText.textContent = 'Add Friend';
          addFriendBtn.setAttribute('data-userid', targetUserId);
        }
      } else {
        addFriendBtn.disabled = false;
        if (addFriendText) addFriendText.textContent = 'Add Friend';
        addFriendBtn.setAttribute('data-userid', targetUserId);
      }
    } catch (error) {
      console.error('[Social] Error checking friendship:', error);
      addFriendBtn.disabled = false;
      if (addFriendText) addFriendText.textContent = 'Add Friend';
      if (targetUserId) addFriendBtn.setAttribute('data-userid', targetUserId);
    }
  }

  async sendFriendRequest(targetUserId) {
    if (!this.authToken || !this.userData) return;

    const addFriendBtn = document.getElementById('social-add-friend-btn');
    const addFriendText = document.getElementById('social-add-friend-text');

    if (addFriendBtn) {
      addFriendBtn.disabled = true;
      if (addFriendText) addFriendText.textContent = 'Sending...';
    }

    try {
      const response = await fetch(`${this.API_URL}/create-friend-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentUserId: this.userData.localId,
          targetUserId: targetUserId,
          status: 'pending',
          idToken: this.authToken,
        }),
      });

      const data = await response.json();

      if (response.ok && !data.error) {
        if (window.toastManager)
          window.toastManager.success('toasts.friendRequestSent');
        if (addFriendText) addFriendText.textContent = 'Request Sent';
        if (addFriendBtn) {
          addFriendBtn.disabled = true;
          if (data.friendRequestId)
            addFriendBtn.setAttribute('data-request-id', data.friendRequestId);
        }
      } else {
        const errorMsg = data.error || 'toasts.failedToSendFriendRequest';
        if (window.toastManager) window.toastManager.error(errorMsg);
        if (addFriendBtn) addFriendBtn.disabled = false;
        if (addFriendText) addFriendText.textContent = 'Add Friend';
      }
    } catch (error) {
      console.error('[Social] Error sending friend request:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToSendFriendRequest');
      if (addFriendBtn) addFriendBtn.disabled = false;
      if (addFriendText) addFriendText.textContent = 'Add Friend';
    }
  }

  async acceptFriendRequest(requestId) {
    if (!this.authToken) return;

    try {
      const response = await fetch(`${this.API_URL}/accept-friend-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: requestId,
          idToken: this.authToken,
        }),
      });

      const data = await response.json();

      if (response.ok && !data.error) {
        if (window.toastManager)
          window.toastManager.success('toasts.friendRequestAccepted');

        this.loadFriends();
      } else {
        const errorMsg = data.error || 'toasts.failedToAcceptFriendRequest';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('[Social] Error accepting friend request:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToAcceptFriendRequest');
    }
  }

  async rejectFriendRequest(requestId) {
    if (!this.authToken) return;

    try {
      const response = await fetch(`${this.API_URL}/reject-friend-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: requestId,
          idToken: this.authToken,
        }),
      });

      const data = await response.json();

      if (response.ok && !data.error) {
        if (window.toastManager)
          window.toastManager.success('toasts.friendRequestRejected');

        this.loadFriends();
      } else {
        const errorMsg = data.error || 'toasts.failedToRejectFriendRequest';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('[Social] Error rejecting friend request:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToRejectFriendRequest');
    }
  }

  async removeFriend(relationId, friendId) {
    if (!this.authToken) {
      console.error('[Social] Cannot remove friend: no auth token');
      return;
    }

    console.log('[Social] removeFriend called:', { relationId, friendId });

    let friendUsername = 'this friend';
    const removeBtn = document.querySelector(
      `.social-remove-friend-btn[data-relation-id="${relationId}"]`,
    );
    if (removeBtn) {
      const friendCard = removeBtn.closest('.social-friend-card');
      if (friendCard) {
        const nameEl = friendCard.querySelector('.social-friend-name');
        if (nameEl) {
          friendUsername = nameEl.textContent || 'this friend';
        }
      }
    }

    console.log('[Social] Showing remove friend modal for:', friendUsername);

    this.showRemoveFriendModal(friendUsername, relationId);
  }

  showRemoveFriendModal(friendUsername, relationId) {
    console.log('[Social] showRemoveFriendModal called:', {
      friendUsername,
      relationId,
    });

    if (!this.authToken || !this.userData) {
      console.error(
        '[Social] Cannot show remove friend modal: user not logged in',
      );
      return;
    }

    this.hideRegisterModal();
    this.hideForgotPasswordModal();

    let modal = document.getElementById('social-remove-friend-modal');

    if (!modal) {
      const socialTab = document.getElementById('tab-social');
      if (socialTab) {
        modal = socialTab.querySelector('#social-remove-friend-modal');
      }
    }

    if (!modal) {
      console.error(
        '[Social] Remove friend modal not found in DOM. All modals:',
        document.querySelectorAll('.social-modal'),
      );
      if (window.toastManager) {
        window.toastManager.error('toasts.modalNotFound');
      }
      return;
    }

    console.log('[Social] Modal found, setting up...', modal);

    if (!modal.hasAttribute('data-initialized')) {
      this.setupRemoveFriendModal();
      modal.setAttribute('data-initialized', 'true');
    }

    const friendNameEl = modal.querySelector('#social-remove-friend-name');
    if (friendNameEl) {
      friendNameEl.textContent = friendUsername;
      console.log('[Social] Friend name set in modal:', friendUsername);
    } else {
      console.error('[Social] Friend name element not found in modal');
    }

    modal.setAttribute('data-relation-id', relationId);
    console.log('[Social] Relation ID stored:', relationId);

    modal.style.display = 'flex';
    modal.style.opacity = '0';
    modal.style.zIndex = '100000';
    const content = modal.querySelector('.social-modal-content');
    if (content) {
      content.style.transform = 'translateY(20px)';
      content.style.opacity = '0';
    }

    void modal.offsetHeight;

    requestAnimationFrame(() => {
      modal.style.transition = 'opacity 0.2s ease';
      modal.style.opacity = '1';

      if (content) {
        content.style.transition =
          'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
        content.style.transform = 'translateY(0)';
        content.style.opacity = '1';
      }

      console.log('[Social] Modal should now be visible. Computed styles:', {
        display: window.getComputedStyle(modal).display,
        opacity: window.getComputedStyle(modal).opacity,
        zIndex: window.getComputedStyle(modal).zIndex,
      });
    });
  }

  hideRemoveFriendModal() {
    const modal = document.getElementById('social-remove-friend-modal');
    if (!modal) {
      const socialTab = document.getElementById('tab-social');
      if (socialTab) {
        const tabModal = socialTab.querySelector('#social-remove-friend-modal');
        if (tabModal) {
          tabModal.style.display = 'none';
          tabModal.style.opacity = '0';
        }
      }
      return;
    }

    modal.style.display = 'none';
    modal.style.opacity = '0';
    modal.style.transition = 'none';

    const content = modal.querySelector('.social-modal-content');
    if (content) {
      content.style.opacity = '0';
      content.style.transform = 'translateY(20px)';
      content.style.transition = 'none';
    }
  }

  async confirmRemoveFriend(relationId) {
    if (!this.authToken) return;

    try {
      const response = await fetch(`${this.API_URL}/reject-friend-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: relationId,
          idToken: this.authToken,
        }),
      });

      const data = await response.json();

      if (response.ok && !data.error) {
        this.hideRemoveFriendModal();
        if (window.toastManager)
          window.toastManager.success('toasts.friendRemoved');

        this.loadFriends();
      } else {
        const errorMsg = data.error || 'toasts.failedToRemoveFriend';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('[Social] Error removing friend:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToRemoveFriend');
    }
  }

  setupRemoveFriendModal() {
    setTimeout(() => {
      const modal = document.getElementById('social-remove-friend-modal');
      if (!modal) {
        console.error('[Social] Remove friend modal not found during setup');
        return;
      }

      console.log('[Social] Setting up remove friend modal');

      modal.style.display = 'none';
      modal.style.opacity = '0';

      const closeBtn = modal.querySelector('#social-remove-friend-close');
      const cancelBtn = modal.querySelector('#social-remove-friend-cancel');
      const confirmBtn = modal.querySelector('#social-remove-friend-confirm');

      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.hideRemoveFriendModal();
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.hideRemoveFriendModal();
        });
      }

      if (confirmBtn) {
        confirmBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const relationId = modal.getAttribute('data-relation-id');
          console.log(
            '[Social] Confirm button clicked, relationId:',
            relationId,
          );
          if (relationId) {
            this.confirmRemoveFriend(relationId);
          }
        });
      }

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideRemoveFriendModal();
        }
      });
    }, 100);
  }

  async showUserProfile(username, userId = null) {
    this.viewedUserId = userId;
    this.viewedUsername = username;

    const userModsContent = document.getElementById('social-user-mods-content');
    if (userModsContent) {
      userModsContent.innerHTML =
        '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading user mods...</p></div>';
      userModsContent.style.opacity = '0.5';
    }

    const usernameEl = document.getElementById('social-user-profile-username');
    const avatarEl = document.getElementById('social-user-profile-avatar');

    if (usernameEl) {
      usernameEl.style.opacity = '0';
      usernameEl.textContent = username;
      setTimeout(() => {
        usernameEl.style.transition = 'opacity 0.3s ease';
        usernameEl.style.opacity = '1';
      }, 10);
    }
    if (avatarEl) {
      avatarEl.style.opacity = '0';
      avatarEl.src = 'https://files.catbox.moe/xry0hs.png';
      setTimeout(() => {
        avatarEl.style.transition = 'opacity 0.3s ease';
        avatarEl.style.opacity = '1';
      }, 10);
    }

    this.switchSection('user-profile');

    const navItems = document.querySelectorAll('.social-nav-item');
    navItems.forEach((item) => {
      item.classList.remove('active');
    });

    this.updateAddFriendButton(username, userId);

    this.loadUserMods(username, userId).then(() => {
      const resolvedUserId = userId || this.viewedUserId;
      if (resolvedUserId && resolvedUserId !== userId) {
        this.checkFriendshipStatus(
          document.getElementById('social-add-friend-btn'),
          document.getElementById('social-add-friend-text'),
          resolvedUserId,
          username,
        );
      }
    });

    if (userModsContent) {
      userModsContent.style.transition = 'opacity 0.3s ease';
      userModsContent.style.opacity = '1';
    }
  }

  async loadUserMods(username, userId = null) {
    const userModsContent = document.getElementById('social-user-mods-content');
    if (!userModsContent || !this.authToken) return;

    try {
      const modsData = await this.fetchWithCache(
        `${this.API_URL}/list/links?idToken=${this.authToken}`,
        {},
        'links',
      );

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      if (Array.isArray(mods)) {
        const userMods = mods.filter((mod) => {
          const modUserId = mod.userId;
          const modPseudo = mod.pseudo;
          return (
            (userId && modUserId === userId) ||
            (username && modPseudo === username)
          );
        });

        if (userMods.length > 0 && !userId && userMods[0].userId) {
          userId = userMods[0].userId;
          this.viewedUserId = userId;
        } else if (userMods.length > 0 && userId) {
          this.viewedUserId = userId;
        }

        if (userId) {
          try {
            const userResponse = await fetch(
              `${this.API_URL}/read/users/${userId}`,
            );
            const userData = await userResponse.json();
            if (userData.fields) {
              const userFields = {};
              Object.entries(userData.fields).forEach(([key, value]) => {
                userFields[key] = Object.values(value)[0];
              });
              const avatarEl = document.getElementById(
                'social-user-profile-avatar',
              );
              if (avatarEl && userFields.photoURL) {
                avatarEl.style.transition = 'opacity 0.3s ease';
                avatarEl.style.opacity = '0';
                setTimeout(() => {
                  avatarEl.src = userFields.photoURL;
                  avatarEl.style.opacity = '1';
                }, 150);
              }
            }
          } catch (e) {
            console.warn('Failed to fetch user info:', e);
          }
        }

        const modsCountEl = document.getElementById('social-user-stat-mods');
        if (modsCountEl) {
          modsCountEl.style.transform = 'scale(0.8)';
          modsCountEl.style.opacity = '0';
          modsCountEl.textContent = userMods.length;
          setTimeout(() => {
            modsCountEl.style.transition = 'all 0.3s ease';
            modsCountEl.style.transform = 'scale(1)';
            modsCountEl.style.opacity = '1';
          }, 100);
        }

        userModsContent.style.opacity = '0';
        userModsContent.style.transform = 'translateY(10px)';

        await new Promise((resolve) => setTimeout(resolve, 150));

        if (userMods.length > 0) {
          userModsContent.innerHTML =
            '<div class="social-mods-grid">' +
            userMods.map((mod) => this.renderModCard(mod, false)).join('') +
            '</div>';
        } else {
          userModsContent.innerHTML =
            '<div class="social-empty-state"><i class="bi bi-collection"></i><p>This user hasn\'t shared any mods yet</p></div>';
        }

        setTimeout(() => {
          userModsContent.style.transition = 'all 0.4s ease';
          userModsContent.style.opacity = '1';
          userModsContent.style.transform = 'translateY(0)';

          const cards = userModsContent.querySelectorAll('.social-mod-card');
          cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
              card.style.transition = 'all 0.3s ease';
              card.style.opacity = '1';
              card.style.transform = 'translateY(0)';
            }, index * 50);
          });
        }, 50);
      }
    } catch (error) {
      console.error('[Social] Error loading user mods:', error);
      userModsContent.innerHTML =
        '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load user mods</p></div>';
      userModsContent.style.opacity = '1';
      userModsContent.style.transform = 'translateY(0)';
    }
  }

  async loadAutoDownloadSettingsToUI() {
    await this.loadAutoDownloadSettings();

    const enabledCheckbox = document.getElementById(
      'social-auto-download-enabled',
    );
    const intervalInput = document.getElementById(
      'social-auto-download-interval',
    );

    if (enabledCheckbox) {
      enabledCheckbox.checked = this.autoDownloadEnabled;
    }
    if (intervalInput) {
      intervalInput.value = this.autoDownloadIntervalMs / (60 * 1000);
    }
  }

  async updateAutoDownloadSettings() {
    const enabledCheckbox = document.getElementById(
      'social-auto-download-enabled',
    );
    const intervalInput = document.getElementById(
      'social-auto-download-interval',
    );

    if (!enabledCheckbox || !intervalInput) return;

    const enabled = enabledCheckbox.checked;
    const intervalMinutes = parseInt(intervalInput.value, 10);

    if (isNaN(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60) {
      if (window.toastManager)
        window.toastManager.error('toasts.intervalMustBeBetween');
      return;
    }

    this.autoDownloadEnabled = enabled;
    this.autoDownloadIntervalMs = intervalMinutes * 60 * 1000;

    await this.saveAutoDownloadSettings();

    if (enabled && this.authToken) {
      this.startAutoDownloadCheck();
    } else {
      this.stopAutoDownloadCheck();
    }

    if (window.toastManager)
      window.toastManager.success('toasts.autoDownloadSettingsSaved');
  }

  async updateUsername() {
    const usernameInput = document.getElementById('social-edit-username');
    if (!usernameInput || !this.authToken) return;

    const newUsername = usernameInput.value.trim();
    if (!newUsername) {
      if (window.toastManager)
        window.toastManager.error('toasts.usernameCannotBeEmpty');
      return;
    }

    try {
      const response = await fetch(`${this.API_URL}/update-username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: this.authToken,
          username: newUsername,
        }),
      });

      const data = await response.json();

      if (response.ok && !data.error) {
        if (this.userData && this.userData.localId) {
          await fetch(`${this.API_URL}/write/users/${this.userData.localId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: newUsername,
              _idToken: this.authToken,
            }),
          });
        }

        const usernameEl = document.getElementById('social-profile-username');
        if (usernameEl) usernameEl.textContent = newUsername;

        if (window.toastManager)
          window.toastManager.success('toasts.usernameUpdated');
      } else {
        const errorMsg = data.error?.message || 'toasts.failedToUpdateUsername';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('Error updating username:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToUpdateUsername');
    }
  }

  async updatePrivacySettings() {
    const privacyVisibility = document.getElementById(
      'social-privacy-visibility',
    );
    const privacySync = document.getElementById('social-privacy-sync');

    if (!privacyVisibility || !privacySync || !this.authToken || !this.userData)
      return;

    const privacySettings = {
      modsVisibility: privacyVisibility.value,
      allowSync: privacySync.checked,
    };

    try {
      const response = await fetch(`${this.API_URL}/update-user-privacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userData.localId,
          idToken: this.authToken,
          privacySettings,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (window.toastManager)
          window.toastManager.success('toasts.privacySettingsUpdated');
      } else {
        const errorMsg = data.error || 'toasts.failedToUpdatePrivacySettings';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToUpdatePrivacySettings');
    }
  }

  async logout() {
    try {
      await fetch(`${this.API_URL}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      this.authToken = null;
      this.userData = null;

      if (window.electronAPI && window.electronAPI.store) {
        try {
          await window.electronAPI.store.delete('social.authToken');
          await window.electronAPI.store.delete('social.userData');
        } catch (e) {}
      }

      const profileContainer = document.getElementById(
        'social-profile-container',
      );
      if (profileContainer) profileContainer.style.display = 'none';

      const emailInput = document.getElementById('social-email');
      const passInput = document.getElementById('social-password');
      if (emailInput) emailInput.value = '';
      if (passInput) passInput.value = '';

      this.stopAutoDownloadCheck();

      this.showLoginScreen();

      if (window.toastManager)
        window.toastManager.success('toasts.loggedOutSuccessfully');
    } catch (error) {
      console.error('Logout error:', error);

      this.stopAutoDownloadCheck();
      const profileContainer = document.getElementById(
        'social-profile-container',
      );
      if (profileContainer) profileContainer.style.display = 'none';
      this.showLoginScreen();
    }
  }

  startAutoDownloadCheck() {
    this.stopAutoDownloadCheck();

    this.loadAutoDownloadSettings().then(() => {
      if (!this.autoDownloadEnabled) {
        console.log('[Social] Auto-download is disabled');
        return;
      }

      console.log(
        `[Social] Starting auto-download check (interval: ${
          this.autoDownloadIntervalMs / 1000
        }s)`,
      );

      this.checkAndDownloadMods();

      this.autoDownloadInterval = setInterval(() => {
        this.checkAndDownloadMods();
      }, this.autoDownloadIntervalMs);
    });
  }

  stopAutoDownloadCheck() {
    if (this.autoDownloadInterval) {
      clearInterval(this.autoDownloadInterval);
      this.autoDownloadInterval = null;
      console.log('[Social] Stopped auto-download check');
    }
  }

  async loadAutoDownloadSettings() {
    try {
      if (window.electronAPI && window.electronAPI.store) {
        const enabled = await window.electronAPI.store.get(
          'social.autoDownloadEnabled',
        );
        const intervalMinutes = await window.electronAPI.store.get(
          'social.autoDownloadIntervalMinutes',
        );

        if (enabled !== undefined) {
          this.autoDownloadEnabled = enabled;
        }
        if (intervalMinutes !== undefined) {
          this.autoDownloadIntervalMs = intervalMinutes * 60 * 1000;
        }
      }
    } catch (e) {
      console.warn('Failed to load auto-download settings:', e);
    }
  }

  async checkAndDownloadMods() {
    if (!this.authToken || !this.userData) {
      console.log('[Social] No auth token, skipping auto-download check');
      return;
    }

    try {
      const userId = this.userData.localId;

      const usernameEl = document.getElementById('social-profile-username');
      const username = usernameEl ? usernameEl.textContent : null;

      const modsData = await this.fetchWithCache(
        `${this.API_URL}/list/links?idToken=${this.authToken}`,
        {},
        'links',
      );

      if (!modsData || (modsData.error && modsData.error.message)) {
        if (
          await this.handleServiceUnavailable(
            JSON.stringify(modsData),
            modsData.status || 500,
          )
        ) {
          return;
        }
        console.error('[Social] list/links request failed:', modsData);
        return;
      }

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      if (!Array.isArray(mods)) {
        console.error('[Social] Invalid mods data received');
        return;
      }

      const uninstalledMods = mods.filter((mod) => {
        const modUserId = mod.userId;
        const modPseudo = mod.pseudo;
        const isOwner =
          modUserId === userId || (username && modPseudo === username);
        const isInstalled = mod.modInstalled === true;
        const hasLink = mod.link && mod.link.trim() !== '';
        const link = mod.link ? mod.link.trim() : '';

        const isInstalling = this.installingMods.has(link);

        return isOwner && !isInstalled && hasLink && !isInstalling;
      });

      console.log(
        `[Social] Found ${uninstalledMods.length} uninstalled mod(s)`,
      );

      for (const mod of uninstalledMods) {
        const link = mod.link.trim();
        if (link) {
          this.installingMods.add(link);

          console.log(
            `[Social] Opening link for mod: ${mod.mod_name || 'Unknown'}`,
            link,
          );

          if (link.startsWith('fightplanner:')) {
            if (window.electronAPI && window.electronAPI.openFightPlannerLink) {
              await window.electronAPI.openFightPlannerLink(link);
            } else {
              console.error('[Social] openFightPlannerLink not available');

              this.installingMods.delete(link);
            }
          } else {
            if (window.electronAPI && window.electronAPI.openUrl) {
              await window.electronAPI.openUrl(link);
            }

            this.installingMods.delete(link);
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('[Social] Error checking mods:', error);
    }
  }

  async saveAutoDownloadSettings() {
    try {
      if (window.electronAPI && window.electronAPI.store) {
        await window.electronAPI.store.set(
          'social.autoDownloadEnabled',
          this.autoDownloadEnabled,
        );
        await window.electronAPI.store.set(
          'social.autoDownloadIntervalMinutes',
          this.autoDownloadIntervalMs / (60 * 1000),
        );
      }
    } catch (e) {
      console.warn('Failed to save auto-download settings:', e);
    }
  }

  setupProtocolListeners() {
    if (!window.electronAPI) return;

    window.electronAPI.onModInstallSuccess((data) => {
      console.log('[Social] Mod installed successfully:', data);

      if (data.url) {
        this.updateModInstalledStatus(data.url);
      }
    });
  }

  async updateModInstalledStatus(downloadUrl) {
    if (!this.authToken || !this.userData) {
      console.log('[Social] No auth token, cannot update mod status');
      return;
    }

    try {
      const response = await fetch(
        `${this.API_URL}/list/links?idToken=${this.authToken}`,
      );

      if (!response.ok) {
        const text = await response.text();
        if (await this.handleServiceUnavailable(text, response.status)) {
          return;
        }
        if (response.status === 429 || response.status === 404) {
          this.showServiceErrorModal(
            'modals.socialServiceUnavailable.title',
            'modals.socialServiceUnavailable.rateLimited',
          );
          return;
        }
        console.error('[Social] list/links update failed:', text);
        return;
      }

      const modsData = await response.json();

      if (!Array.isArray(modsData)) {
        console.error('[Social] Invalid mods data received');
        return;
      }

      const userId = this.userData.localId;
      const usernameEl = document.getElementById('social-profile-username');
      const username = usernameEl ? usernameEl.textContent : null;

      for (const mod of modsData) {
        const modUserId = mod.userId;
        const modPseudo = mod.pseudo;
        const isOwner =
          modUserId === userId || (username && modPseudo === username);

        if (!isOwner) continue;

        const link = mod.link ? mod.link.trim() : '';

        const downloadIdMatch = downloadUrl.match(/\/dl\/(\d+)/);
        const linkIdMatch = link.match(/mmdl\/(\d+)/);

        if (
          downloadIdMatch &&
          linkIdMatch &&
          downloadIdMatch[1] === linkIdMatch[1]
        ) {
          console.log(
            `[Social] Updating modInstalled for mod: ${mod.id || mod.mod_name}`,
          );

          if (mod.id) {
            await fetch(`${this.API_URL}/write/links/${mod.id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                modInstalled: true,
                _idToken: this.authToken,
              }),
            });

            this.installingMods.delete(link);

            console.log(
              `[Social] ✅ Updated modInstalled to true for mod ID: ${mod.id}`,
            );
          }
          break;
        }
      }
    } catch (error) {
      console.error('[Social] Error updating modInstalled status:', error);
    }
  }

  showServiceErrorModal(titleKey, messageKey) {
    if (window.modalManager && window.modalManager.showAlert) {
      window.modalManager.showAlert('warning', titleKey, messageKey);
    } else if (window.toastManager) {
      const t = (k) => (window.i18n && window.i18n.t ? window.i18n.t(k) : k);
      window.toastManager.warning(t(messageKey));
    } else {
      const t = (k) => (window.i18n && window.i18n.t ? window.i18n.t(k) : k);
      alert(`${t(titleKey)}\n\n${t(messageKey)}`);
    }
  }

  async handleServiceUnavailable(rawMessage, status) {
    const msg = (rawMessage || '').toString();
    const marker =
      msg.includes('Please check back later') ||
      msg.includes('Error 1027') ||
      status === 520 ||
      status === 527 ||
      status === 502 ||
      status === 503;

    if (!marker) return false;

    if (this.serviceUnavailableShown) return true;
    this.serviceUnavailableShown = true;

    if (window.modalManager && window.modalManager.showAlert) {
      window.modalManager.showAlert(
        'warning',
        'Service temporairement indisponible',
        'Le service social est temporairement indisponible (Error 1027). Merci de réessayer dans quelques minutes.',
      );
    } else if (window.toastManager) {
      window.toastManager.warning(
        'Le service social est temporairement indisponible (Error 1027).',
      );
    }

    this.stopAutoDownloadCheck();
    return true;
  }
}

if (typeof window !== 'undefined') {
  window.socialManager = new SocialManager();
}
