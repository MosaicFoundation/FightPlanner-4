interface UserFields {
  username?: string;
  photoURL?: string;

  privacySettings?: {
    showEmail?: boolean;
    showFriendsList?: boolean;
    showModsList?: boolean;
    modsVisibility?: 'public' | 'friends' | 'private';
    allowSync?: boolean;
  };
}

interface GameBananaTopSubmission {
  _idRow: number;
  _sModelName?: string;
  _sSingularTitle?: string;
  _sName?: string;
  _sProfileUrl?: string;
  _sImageUrl?: string;
  _sThumbnailUrl?: string;
  _sDescription?: string;
  _sPeriod?: string;
  _tsDateAdded?: number;
  _nLikeCount?: number;
  _nPostCount?: number;
  _nViewCount?: number;
  _aPreviewMedia?: {
    _aMetadata?: {
      _sSnippet?: string;
      _sAudioUrl?: string;
    };
    _aImages?: {
      _sBaseUrl?: string;
      _sFile?: string;
      _wFile?: number;
      _hFile?: number;
      _sFile220?: string;
      _wFile220?: number;
      _hFile220?: number;
      _sFile530?: string;
      _wFile530?: number;
      _hFile530?: number;
      _sFile800?: string;
      _wFile800?: number;
      _hFile800?: number;
    }[];
  };
  _aSubmitter?: {
    _sName?: string;
    _sProfileUrl?: string;
    _sAvatarUrl?: string;
  };
  _aRootCategory?: {
    _sName?: string;
    _sIconUrl?: string;
  };
  _aSubCategory?: {
    _sName?: string;
    _sIconUrl?: string;
  };
}

interface GameBananaSubfeedResponse {
  _aMetadata?: {
    _nRecordCount?: number;
    _nPerpage?: number;
    _bIsComplete?: boolean;
  };
  _aRecords?: GameBananaTopSubmission[];
}

interface GameBananaFileEntry {
  _idRow?: number;
  _sFile?: string;
  _nFilesize?: number;
  _tsDateAdded?: number;
  _nDownloadCount?: number;
  _sDownloadUrl?: string;
  _sDescription?: string;
  _sAnalysisResult?: string;
  _sAvResult?: string;
}

interface PendingGameBananaSocialDownload {
  link: string;
  downloadId: string;
  modId: string;
  modName: string;
  creator: string;
  imageUrl: string;
  availableFiles: {
    id: number | string;
    name: string;
    description: string;
    size: number;
    downloads: number;
  }[];
}

class SocialManager {
  API_URL: string;
  GAMEBANANA_TOP_SUBS_URL: string;
  GAMEBANANA_SUBFEED_URL: string;
  authToken: string | null;
  userData: {
    localId: string;
    email: string;
    displayName: string;
    refreshToken: string;
  } | null;
  autoDownloadInterval: ReturnType<typeof setInterval> | null;
  autoDownloadEnabled: boolean;
  autoDownloadIntervalMs: number;
  installingMods: Set<string>;
  serviceUnavailableShown: boolean;
  onboardingAnim: any;
  loginAnim: any;
  gameBananaFeaturedMods: GameBananaTopSubmission[];
  gameBananaFeaturedIndex: number;
  gameBananaFeaturedTimeline: any;
  gameBananaPreviewAnimation: Promise<void> | null;
  gameBananaModsPage: number;
  gameBananaModsTotalPages: number;
  gameBananaSubmissionCache: Map<string, GameBananaTopSubmission>;
  gameBananaLastDetailSource: {
    modelName: string;
    submissionId: string;
    sourceKind: 'featured' | 'grid';
    page: number;
    scrollTop: number;
  } | null;
  gameBananaDiscoverSnapshot: {
    html: string;
    page: number;
    scrollTop: number;
  } | null;
  gameBananaCurrentDetail:
    | {
        details: any;
        fallback: GameBananaTopSubmission | null;
        files: GameBananaFileEntry[];
      }
    | null;
  pendingGameBananaSocialDownloads: Map<string, PendingGameBananaSocialDownload>;
  cache: {
    [key: string]: { data: any; timestamp: number; ttl: number };
  };
  pendingRequests: Map<string, Promise<any>>;
  viewedUserId: string | null;
  viewedUsername: string | null;

  constructor() {
    this.API_URL =
      'https://fightplannersocialapi.nathancarlos19100.workers.dev';
    this.GAMEBANANA_TOP_SUBS_URL =
      'https://gamebanana.com/apiv11/Game/6498/TopSubs';
    this.GAMEBANANA_SUBFEED_URL =
      'https://gamebanana.com/apiv11/Game/6498/Subfeed?_csvModelExclusions=Question%2CTutorial';
    this.authToken = null;
    this.userData = null;
    this.autoDownloadInterval = null;
    this.autoDownloadEnabled = true;
    this.autoDownloadIntervalMs = 5 * 60 * 1000;
    this.installingMods = new Set();
    this.serviceUnavailableShown = false;
    this.gameBananaFeaturedMods = [];
    this.gameBananaFeaturedIndex = 0;
    this.gameBananaFeaturedTimeline = null;
    this.gameBananaPreviewAnimation = null;
    this.gameBananaModsPage = 1;
    this.gameBananaModsTotalPages = 1;
    this.gameBananaSubmissionCache = new Map();
    this.gameBananaLastDetailSource = null;
    this.gameBananaDiscoverSnapshot = null;
    this.gameBananaCurrentDetail = null;
    this.pendingGameBananaSocialDownloads = new Map();

    // Cache pour réduire les requêtes
    this.cache = {
      links: { data: null, timestamp: 0, ttl: 2 * 60 * 1000 }, // 2 minutes
      friends: { data: null, timestamp: 0, ttl: 2 * 60 * 1000 }, // 2 minutes
      notifications: { data: null, timestamp: 0, ttl: 1 * 60 * 1000 }, // 1 minute
      gameBananaTopSubs: { data: null, timestamp: 0, ttl: 10 * 60 * 1000 }, // 10 minutes
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
  invalidateCache(key: string | null = null) {
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

  escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  async refreshAuthToken(): Promise<boolean> {
    if (!this.userData?.refreshToken) {
      console.log('[Social] No refresh token available');
      return false;
    }

    try {
      console.log('[Social] Attempting to refresh auth token...');
      const response = await fetch(`${this.API_URL}/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: this.userData.refreshToken,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        console.error('[Social] Token refresh failed:', data.error);
        return false;
      }

      this.authToken = data.id_token;
      if (data.refresh_token) {
        this.userData.refreshToken = data.refresh_token;
      }

      if (window.electronAPI && window.electronAPI.store) {
        await window.electronAPI.store.set('social.authToken', this.authToken);
        await window.electronAPI.store.set('social.userData', this.userData);
      }

      console.log('[Social] ✅ Token refreshed successfully');
      return true;
    } catch (error) {
      console.error('[Social] Token refresh error:', error);
      return false;
    }
  }

  async fetchWithCache(
    url: string,
    options = {},
    cacheKey: string | null = null,
  ) {
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

    return requestPromise;
  }

  async initialize() {
    try {
      setTimeout(() => {
        this.hideRegisterModal();
        this.hideForgotPasswordModal();
        this.hideRemoveFriendModal();
      }, 10);

      if (window.electronAPI && window.electronAPI.store) {
        const storedToken = (await window.electronAPI.store.get(
          'social.authToken',
        )) as string | null;

        const storedUserData = (await window.electronAPI.store.get(
          'social.userData',
        )) as typeof this.userData | null;

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
      const onboarding =
        document.querySelector<HTMLElement>('#social-onboarding');
      if (onboarding) {
        onboarding.style.display = 'flex';

        setTimeout(() => {
          this.loadOnboardingAnimation();
        }, 50);
      }
    }, 500);
  }

  loadOnboardingAnimation() {
    const onboarding =
      document.querySelector<HTMLElement>('#social-onboarding');
    if (!onboarding) return;

    const lottieContainer = document.querySelector<HTMLElement>(
      '#social-onboarding-lottie',
    );

    if (lottieContainer && window.lottie) {
      const anim = window.lottie.loadAnimation({
        container: lottieContainer,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        path: '../images/social1.json',
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid slice',
          className: 'lottie-animation-fullscreen',
          // For some reason, clearCanvas is not recognized unless type is "canvas"
          ...{ clearCanvas: true },
        },
      });

      anim.addEventListener('DOMLoaded', () => {
        const svg = lottieContainer.querySelector<HTMLElement>('svg');
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
              const overlay = document.querySelector<HTMLElement>(
                '.social-onboarding-overlay',
              );
              if (overlay) {
                overlay.style.opacity = '1';
                overlay.style.pointerEvents = 'auto';
              }

              const button = document.querySelector<HTMLElement>(
                '#social-get-started',
              );
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

    const getStartedBtn = document.querySelector<HTMLElement>(
      '#social-get-started',
    );
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
      } catch (e) { }
      this.onboardingAnim = null;
    }

    const onboarding =
      document.querySelector<HTMLElement>('#social-onboarding');
    if (onboarding) {
      onboarding.style.display = 'none';
    }

    this.markOnboardingDone();

    this.showChrome();

    this.showLoginScreen();
  }

  showLoginScreen() {
    const loginContainer = document.querySelector<HTMLElement>(
      '#social-login-container',
    );
    if (loginContainer) {
      loginContainer.style.display = 'flex';

      const container = document.querySelector<HTMLElement>('#social-lottie');
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
          path: '../images/social.json',
        });
      }

      this.setupButtons();
    }
  }

  hideChrome() {
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    if (sidebar) {
      sidebar.style.transform = 'translateX(-100%)';
      sidebar.style.transition = 'transform 0.5s ease-out';
    }

    const bottomBar = document.querySelector<HTMLElement>('.bottom-bar');
    if (bottomBar) {
      bottomBar.style.transform = 'translateY(100%)';
      bottomBar.style.transition = 'transform 0.5s ease-out';
    }
  }

  showChrome() {
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    if (sidebar) {
      sidebar.style.transform = 'translateX(0)';
      sidebar.style.transition = 'transform 0.5s ease-out';
    }

    const bottomBar = document.querySelector<HTMLElement>('.bottom-bar');
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
    const form = document.querySelector<HTMLElement>('#social-login-form');
    const emailInput =
      document.querySelector<HTMLInputElement>('#social-email');

    const passInput =
      document.querySelector<HTMLInputElement>('#social-password');

    const remember =
      document.querySelector<HTMLInputElement>('#social-remember');

    const forgot = document.querySelector<HTMLElement>('#social-forgot');
    const create = document.querySelector<HTMLElement>('#social-create');
    const submitButton = form
      ? form.querySelector<HTMLButtonElement>('button[type="submit"]')
      : null;

    if (form && emailInput && passInput) {
      if (
        window.electronAPI &&
        window.electronAPI.store &&
        window.electronAPI.store.get
      ) {
        window.electronAPI.store
          .get('social.rememberEmail')
          .then((val: string | null) => {
            if (val && !emailInput.value) emailInput.value = val;
          })
          .catch(() => { });
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
            } catch (e) { }
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

    const modal = document.querySelector<HTMLElement>('#social-forgot-modal');
    if (modal) {
      modal.style.display = 'flex';
      modal.style.opacity = '1';

      const emailInput =
        document.querySelector<HTMLInputElement>('#social-email');
      const forgotEmailInput = document.querySelector<HTMLInputElement>(
        '#social-forgot-email',
      );
      if (emailInput && forgotEmailInput && emailInput.value) {
        forgotEmailInput.value = emailInput.value;
      }
    }
  }

  hideForgotPasswordModal() {
    const modal = document.querySelector<HTMLElement>('#social-forgot-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.style.opacity = '0';
      const form = document.querySelector<HTMLFormElement>(
        '#social-forgot-form',
      );
      if (form) form.reset();
    }
  }

  setupForgotPasswordModal() {
    const modal = document.querySelector<HTMLElement>('#social-forgot-modal');
    const closeBtn = document.querySelector<HTMLElement>(
      '#social-forgot-close',
    );
    const form = document.querySelector<HTMLElement>('#social-forgot-form');
    const emailInput = document.querySelector<HTMLInputElement>(
      '#social-forgot-email',
    );
    const submitBtn = form
      ? form.querySelector<HTMLButtonElement>('button[type="submit"]')
      : null;

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

    const modal = document.querySelector<HTMLElement>('#social-register-modal');
    if (modal) {
      modal.style.display = 'flex';
      modal.style.opacity = '1';

      const emailInput =
        document.querySelector<HTMLInputElement>('#social-email');
      const registerEmailInput = document.querySelector<HTMLInputElement>(
        '#social-register-email',
      );
      if (emailInput && registerEmailInput && emailInput.value) {
        registerEmailInput.value = emailInput.value;
      }
    }
  }

  hideRegisterModal() {
    const modal = document.querySelector<HTMLElement>('#social-register-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.style.opacity = '0';
      const form = document.querySelector<HTMLFormElement>(
        '#social-register-form',
      );
      if (form) form.reset();
    }
  }

  setupRegisterModal() {
    const modal = document.querySelector<HTMLElement>('#social-register-modal');
    const closeBtn = document.querySelector<HTMLElement>(
      '#social-register-close',
    );
    const form = document.querySelector<HTMLElement>('#social-register-form');
    const usernameInput = document.querySelector<HTMLInputElement>(
      '#social-register-username',
    );
    const emailInput = document.querySelector<HTMLInputElement>(
      '#social-register-email',
    );
    const passwordInput = document.querySelector<HTMLInputElement>(
      '#social-register-password',
    );
    const passwordConfirmInput = document.querySelector<HTMLInputElement>(
      '#social-register-password-confirm',
    );
    const submitBtn = form
      ? form.querySelector<HTMLButtonElement>('button[type="submit"]')
      : null;

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
    const loginContainer = document.querySelector<HTMLElement>(
      '#social-login-container',
    );
    if (loginContainer) {
      loginContainer.style.display = 'none';
    }

    const onboarding =
      document.querySelector<HTMLElement>('#social-onboarding');
    if (onboarding) {
      onboarding.style.display = 'none';
    }

    this.hideRegisterModal();
    this.hideForgotPasswordModal();
    this.hideRemoveFriendModal();

    const profileContainer = document.querySelector<HTMLElement>(
      '#social-profile-container',
    );
    if (profileContainer) {
      profileContainer.style.display = 'flex';

      await this.loadUserProfile();
      this.setupProfileButtons();
      this.setupNavigation();
    }
  }

  setupNavigation() {
    const navItems = document.querySelectorAll<HTMLElement>('.social-nav-item');
    navItems.forEach((item) => {
      item.addEventListener('click', () => {
        const section = item.getAttribute('data-section');
        this.switchSection(section);
      });
    });
  }

  switchSection(sectionName) {
    const currentSections = document.querySelectorAll<HTMLElement>(
      '.social-section.active',
    );
    currentSections.forEach((section) => {
      section.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      section.style.opacity = '0';
      section.style.transform = 'translateX(-10px)';
    });

    const navItems = document.querySelectorAll<HTMLElement>('.social-nav-item');
    navItems.forEach((item) => {
      if (item.getAttribute('data-section') === sectionName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    setTimeout(() => {
      const sections =
        document.querySelectorAll<HTMLElement>('.social-section');
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
      case 'discover':
        setTimeout(() => this.loadDiscover(), 250);
        break;
      case 'people-downloads':
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

  async loadDiscover() {
    const discoverContent = document.querySelector<HTMLElement>(
      '#social-discover-content',
    );
    if (!discoverContent) return;

    discoverContent.innerHTML =
      '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading mods...</p></div>';

    try {
      const [submissionsData, subfeedData] = await Promise.all([
        this.fetchWithCache(
          this.GAMEBANANA_TOP_SUBS_URL,
          {},
          'gameBananaTopSubs',
        ),
        this.fetchGameBananaModsPage(1),
      ]);

      const submissions: GameBananaTopSubmission[] = Array.isArray(
        submissionsData,
      )
        ? submissionsData
        : [];
      const mods = submissions.filter(
        (submission) => submission._sModelName === 'Mod',
      );

      if (mods.length === 0) {
        discoverContent.innerHTML =
          '<div class="social-empty-state"><i class="bi bi-inbox"></i><p>No featured GameBanana mods found</p></div>';
        return;
      }

      const featuredMods = mods.slice(0, 6);
      this.gameBananaFeaturedMods = featuredMods;
      this.gameBananaFeaturedIndex = 0;
      this.gameBananaModsPage = 1;
      featuredMods.forEach((mod) => this.cacheGameBananaSubmission(mod));

      discoverContent.innerHTML = `
        <div class="social-gamebanana-featured">
          <div class="social-gamebanana-carousel-header">
            <h3 class="social-gamebanana-section-title">Featured</h3>
            <div class="social-gamebanana-carousel-actions">
              <button class="social-gamebanana-carousel-btn" data-direction="prev" aria-label="Previous featured mod">
                <i class="bi bi-chevron-left"></i>
              </button>
              <button class="social-gamebanana-carousel-btn" data-direction="next" aria-label="Next featured mod">
                <i class="bi bi-chevron-right"></i>
              </button>
            </div>
          </div>
          <div id="social-gamebanana-carousel" class="social-gamebanana-carousel">
            ${this.renderGameBananaFeaturedStack()}
          </div>
        </div>
        <div class="social-gamebanana-mods">
          <div class="social-gamebanana-mods-header">
            <h3 class="social-gamebanana-section-title">Mods</h3>
            <div id="social-gamebanana-pagination" class="social-gamebanana-pagination">
              ${this.renderGameBananaPagination(subfeedData)}
            </div>
          </div>
          <div id="social-gamebanana-mods-content">
            ${this.renderGameBananaModsPage(subfeedData)}
          </div>
        </div>
      `;

      this.setGameBananaFeaturedCardPositions();
    } catch (error) {
      console.error('[Social] Error loading GameBanana featured mods:', error);
      discoverContent.innerHTML =
        '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load GameBanana mods</p></div>';
    }
  }

  async fetchGameBananaModsPage(page = 1): Promise<GameBananaSubfeedResponse> {
    const pageQuery = page > 1 ? `&_nPage=${page}` : '';
    const response = await fetch(`${this.GAMEBANANA_SUBFEED_URL}${pageQuery}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`GameBanana Subfeed failed: ${response.status}`);
    }

    const metadata = data?._aMetadata || {};
    const perPage = Number(metadata._nPerpage || 15);
    const recordCount = Number(metadata._nRecordCount || 0);
    this.gameBananaModsTotalPages = Math.max(
      1,
      Math.ceil(recordCount / perPage),
    );

    return data;
  }

  async loadGameBananaModsPage(page: number) {
    const nextPage = Math.max(1, Math.min(page, this.gameBananaModsTotalPages));
    const modsContent = document.querySelector<HTMLElement>(
      '#social-gamebanana-mods-content',
    );
    const pagination = document.querySelector<HTMLElement>(
      '#social-gamebanana-pagination',
    );
    if (!modsContent || !pagination) return;

    this.gameBananaModsPage = nextPage;
    modsContent.innerHTML =
      '<div class="social-loading social-gamebanana-mods-loading"><i class="bi bi-hourglass-split"></i><p>Loading mods...</p></div>';

    try {
      const subfeedData = await this.fetchGameBananaModsPage(nextPage);
      modsContent.innerHTML = this.renderGameBananaModsPage(subfeedData);
      pagination.innerHTML = this.renderGameBananaPagination(subfeedData);
    } catch (error) {
      console.error('[Social] Error loading GameBanana mods page:', error);
      modsContent.innerHTML =
        '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load mods</p></div>';
    }
  }

  renderGameBananaModsPage(subfeedData: GameBananaSubfeedResponse) {
    const records = Array.isArray(subfeedData?._aRecords)
      ? subfeedData._aRecords
      : [];
    records.forEach((mod) => this.cacheGameBananaSubmission(mod));

    if (records.length === 0) {
      return '<div class="social-empty-state"><i class="bi bi-inbox"></i><p>No mods found</p></div>';
    }

    return `
      <div class="social-gamebanana-grid">
        ${records.map((mod) => this.renderGameBananaModCard(mod)).join('')}
      </div>
    `;
  }

  cacheGameBananaSubmission(mod: GameBananaTopSubmission) {
    if (!mod?._idRow) return;

    const model = mod._sModelName || 'Mod';
    this.gameBananaSubmissionCache.set(`${model}:${mod._idRow}`, mod);
  }

  getCachedGameBananaSubmission(modelName: string, submissionId: string) {
    return this.gameBananaSubmissionCache.get(`${modelName}:${submissionId}`);
  }

  renderGameBananaPagination(subfeedData: GameBananaSubfeedResponse) {
    const metadata = subfeedData?._aMetadata || {};
    const isComplete = metadata._bIsComplete === true;
    const canGoBack = this.gameBananaModsPage > 1;
    const canGoNext =
      !isComplete && this.gameBananaModsPage < this.gameBananaModsTotalPages;

    return `
      <button class="social-gamebanana-page-btn" data-page-action="prev" ${canGoBack ? '' : 'disabled'}>
        <i class="bi bi-chevron-left"></i>
      </button>
      <span class="social-gamebanana-page-label">Page ${this.gameBananaModsPage} / ${this.gameBananaModsTotalPages}</span>
      <button class="social-gamebanana-page-btn" data-page-action="next" ${canGoNext ? '' : 'disabled'}>
        <i class="bi bi-chevron-right"></i>
      </button>
    `;
  }

  renderGameBananaFeaturedStack() {
    if (this.gameBananaFeaturedMods.length === 0) return '';

    return this.gameBananaFeaturedMods
      .map((mod, index) => {
        const position = this.getGameBananaFeaturedPosition(index);
        return this.renderGameBananaFeaturedCard(mod, index, position);
      })
      .join('');
  }

  getGameBananaFeaturedPosition(index: number) {
    const total = this.gameBananaFeaturedMods.length;
    if (total === 0) return 'hidden';

    const active = this.gameBananaFeaturedIndex;
    const previous = (active - 1 + total) % total;
    const next = (active + 1) % total;

    if (index === active) return 'active';
    if (index === previous) return 'previous';
    if (index === next) return 'next';
    return 'hidden';
  }

  renderGameBananaFeaturedCard(
    mod: GameBananaTopSubmission,
    index: number,
    position: string,
  ) {
    const name = this.escapeHtml(mod._sName || 'Unknown Mod');
    const url = this.escapeHtml(mod._sProfileUrl || '');
    const imageUrl = this.escapeHtml(this.getGameBananaSubmissionImage(mod));
    const creator = this.escapeHtml(mod._aSubmitter?._sName || 'Unknown');
    const category = this.escapeHtml(mod._aRootCategory?._sName || 'Mod');
    const period = this.escapeHtml(this.formatGameBananaPeriod(mod._sPeriod));
    const likes = Number(mod._nLikeCount || 0);
    const comments = Number(mod._nPostCount || 0);
    const model = this.escapeHtml(mod._sModelName || 'Mod');
    const id = this.escapeHtml(mod._idRow);

    return `
      <article class="social-gamebanana-card social-gamebanana-card-featured is-${position}" data-url="${url}" data-gb-id="${id}" data-gb-model="${model}" data-featured-index="${index}" data-featured-position="${position}">
        ${imageUrl
        ? `<img src="${imageUrl}" alt="${name}" class="social-gamebanana-featured-image">`
        : '<div class="social-gamebanana-image-placeholder"><i class="bi bi-image"></i></div>'
      }
        <div class="social-gamebanana-featured-body">
          <div class="social-gamebanana-meta">
            <span>${category}</span>
            <span>${period}</span>
          </div>
          <h3 class="social-gamebanana-card-title">${name}</h3>
          <p class="social-gamebanana-card-creator">by ${creator}</p>
          <div class="social-gamebanana-card-footer">
            <span><i class="bi bi-hand-thumbs-up"></i> ${likes}</span>
            <span><i class="bi bi-chat-left"></i> ${comments}</span>
          </div>
        </div>
      </article>
    `;
  }

  renderGameBananaModCard(mod: GameBananaTopSubmission) {
    const name = this.escapeHtml(mod._sName || 'Unknown Mod');
    const url = this.escapeHtml(mod._sProfileUrl || '');
    const imageUrl = this.escapeHtml(this.getGameBananaSubmissionImage(mod));
    const creator = this.escapeHtml(mod._aSubmitter?._sName || 'Unknown');
    const category = this.escapeHtml(
      mod._aSubCategory?._sName ||
      mod._aRootCategory?._sName ||
      mod._sSingularTitle ||
      mod._sModelName ||
      'Mod',
    );
    const likes = Number(mod._nLikeCount || 0);
    const views = Number(mod._nViewCount || 0);
    const model = this.escapeHtml(mod._sModelName || 'Mod');
    const id = this.escapeHtml(mod._idRow);

    return `
      <article class="social-gamebanana-card social-gamebanana-card-compact" data-url="${url}" data-gb-id="${id}" data-gb-model="${model}">
        ${imageUrl
        ? `<img src="${imageUrl}" alt="${name}" class="social-gamebanana-card-image">`
        : '<div class="social-gamebanana-card-image social-gamebanana-image-placeholder"><i class="bi bi-image"></i></div>'
      }
        <div class="social-gamebanana-card-body">
          <p class="social-gamebanana-card-category">${category}</p>
          <h3 class="social-gamebanana-card-title">${name}</h3>
          <p class="social-gamebanana-card-creator">by ${creator}</p>
          <div class="social-gamebanana-card-footer">
            <span><i class="bi bi-hand-thumbs-up"></i> ${likes}</span>
            <span><i class="bi bi-eye"></i> ${views}</span>
            <button class="social-gamebanana-open-btn" data-url="${url}">
              <i class="bi bi-info-circle"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }

  getGameBananaSubmissionImage(mod: GameBananaTopSubmission) {
    return this.getGameBananaSubmissionImageInfo(mod).url;
  }

  getGameBananaSubmissionImageInfo(mod: GameBananaTopSubmission) {
    const previewImages = mod._aPreviewMedia?._aImages || [];
    for (const image of previewImages) {
      if (!image?._sBaseUrl) continue;

      const candidates = [
        {
          file: image._sFile800,
          width: image._wFile800,
          height: image._hFile800,
        },
        {
          file: image._sFile530,
          width: image._wFile530,
          height: image._hFile530,
        },
        { file: image._sFile, width: image._wFile, height: image._hFile },
        {
          file: image._sFile220,
          width: image._wFile220,
          height: image._hFile220,
        },
      ];

      const candidate = candidates.find((item) => item.file);
      if (candidate?.file) {
        return {
          url: `${image._sBaseUrl}/${candidate.file}`,
          width: candidate.width,
          height: candidate.height,
        };
      }
    }

    return { url: mod._sImageUrl || mod._sThumbnailUrl || '' };
  }

  stripGameBananaHtml(value) {
    const div = document.createElement('div');
    div.innerHTML = value == null ? '' : String(value);
    return (div.textContent || div.innerText || '').trim();
  }

  getGameBananaSubmissionDescription(
    details: any,
    fallback?: GameBananaTopSubmission,
  ) {
    const rawDescription =
      details?._sText ||
      details?._sDescription ||
      details?._sSummary ||
      details?._aProfile?._sText ||
      details?._aProfile?._sDescription ||
      details?._aPreviewMedia?._aMetadata?._sSnippet ||
      fallback?._sDescription ||
      fallback?._aPreviewMedia?._aMetadata?._sSnippet ||
      '';

    return this.stripGameBananaHtml(rawDescription);
  }

  getGameBananaSubmissionDate(mod: GameBananaTopSubmission) {
    if (!mod._tsDateAdded) return '';

    try {
      return new Date(mod._tsDateAdded * 1000).toLocaleDateString();
    } catch (e) {
      return '';
    }
  }

  getGameBananaDetailImageStyle(mod: GameBananaTopSubmission) {
    const image = this.getGameBananaSubmissionImageInfo(mod);
    const width = Number(image.width || 0);
    const height = Number(image.height || 0);

    if (width > 0 && height > 0) {
      return ` style="aspect-ratio: ${width} / ${height};"`;
    }

    return '';
  }

  async showGameBananaSubmissionDetails(
    modelName: string,
    submissionId: string,
    sourceCard?: HTMLElement,
  ) {
    const fallback =
      this.getCachedGameBananaSubmission(modelName, submissionId) || null;
    const sourceRect = this.getGameBananaSourcePreviewRect(sourceCard);

    if (fallback) {
      this.renderGameBananaDetailPage(null, fallback, false, [], true);
      this.animateGameBananaPreviewToDetail(sourceCard, sourceRect);
      await this.fadeGameBananaDetailInfo('in');
    } else {
      this.renderGameBananaDetailPage(null, fallback, true);
      await this.fadeGameBananaDetailInfo('in');
    }

    try {
      const [detailsResult, filesResult] = await Promise.all([
        window.electronAPI?.fetchGameBananaDetails
          ? window.electronAPI.fetchGameBananaDetails(modelName, submissionId)
          : Promise.resolve(null),
        window.electronAPI?.fetchGameBananaFiles
          ? window.electronAPI.fetchGameBananaFiles(modelName, submissionId)
          : Promise.resolve(null),
      ]);

      let detailData: any = null;
      let filesData: GameBananaFileEntry[] = [];
      if (detailsResult?.success) {
        detailData = detailsResult.data;
      } else if (detailsResult) {
        console.warn('[Social] Failed to fetch GameBanana details:', detailsResult);
      }

      if (filesResult?.success && Array.isArray(filesResult.files)) {
        filesData = filesResult.files;
      } else if (filesResult) {
        console.warn('[Social] Failed to fetch GameBanana files:', filesResult);
      }

      if (fallback && this.gameBananaPreviewAnimation) {
        await this.gameBananaPreviewAnimation;
      }

      this.renderGameBananaDetailPage(detailData, fallback, false, filesData);
      if (!fallback) {
        this.animateGameBananaPreviewToDetail(sourceCard, sourceRect);
      }
      await this.fadeGameBananaDetailInfo('in');
    } catch (error) {
      console.error('[Social] Error loading GameBanana details:', error);
      this.renderGameBananaDetailPage(null, fallback, false);
      if (!fallback) {
        this.animateGameBananaPreviewToDetail(sourceCard, sourceRect);
      }
      await this.fadeGameBananaDetailInfo('in');
    }
  }

  getGameBananaSourcePreviewRect(sourceCard?: HTMLElement) {
    const sourceImage = sourceCard?.querySelector<HTMLElement>(
      '.social-gamebanana-featured-image, .social-gamebanana-card-image',
    );
    const source = sourceImage || sourceCard;
    return source?.getBoundingClientRect() || null;
  }

  getSocialMainScrollTop() {
    const mainContent = document.querySelector<HTMLElement>(
      '.social-main-content',
    );
    return mainContent?.scrollTop || 0;
  }

  setSocialMainScrollTop(scrollTop: number) {
    const mainContent = document.querySelector<HTMLElement>(
      '.social-main-content',
    );
    if (mainContent) {
      mainContent.scrollTop = scrollTop;
    }
  }

  keepGameBananaTargetVisible(target: HTMLElement) {
    const mainContent = document.querySelector<HTMLElement>(
      '.social-main-content',
    );
    if (!mainContent) return;

    const containerRect = mainContent.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const padding = 24;

    if (targetRect.top < containerRect.top + padding) {
      mainContent.scrollTop -= containerRect.top + padding - targetRect.top;
    } else if (targetRect.bottom > containerRect.bottom - padding) {
      mainContent.scrollTop +=
        targetRect.bottom - (containerRect.bottom - padding);
    }
  }

  getGameBananaCardSourceKind(card: HTMLElement): 'featured' | 'grid' {
    return card.classList.contains('social-gamebanana-card-featured')
      ? 'featured'
      : 'grid';
  }

  findGameBananaReturnTarget(source: NonNullable<SocialManager['gameBananaLastDetailSource']>) {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('.social-gamebanana-card'),
    ).filter(
      (card) =>
        card.getAttribute('data-gb-model') === source.modelName &&
        card.getAttribute('data-gb-id') === source.submissionId,
    );

    return (
      cards.find((card) => this.getGameBananaCardSourceKind(card) === source.sourceKind) ||
      cards[0] ||
      null
    );
  }

  captureGameBananaDiscoverSnapshot() {
    const discoverContent = document.querySelector<HTMLElement>(
      '#social-discover-content',
    );
    if (!discoverContent) return;

    this.gameBananaDiscoverSnapshot = {
      html: discoverContent.innerHTML,
      page: this.gameBananaModsPage,
      scrollTop: this.getSocialMainScrollTop(),
    };
  }

  fadeGameBananaDetailInfo(direction: 'in' | 'out') {
    const gsapRef = window.gsap as any;
    const detailInfo = document.querySelector<HTMLElement>(
      '.social-gamebanana-detail-info',
    );
    if (!detailInfo) return Promise.resolve();

    if (!gsapRef) {
      detailInfo.style.opacity = direction === 'in' ? '1' : '0';
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      gsapRef.to(detailInfo, {
        autoAlpha: direction === 'in' ? 1 : 0,
        y: direction === 'in' ? 0 : 8,
        duration: 0.16,
        ease: 'power1.out',
        onComplete: resolve,
      });
    });
  }

  fadeGameBananaRestoredBackground() {
    const gsapRef = window.gsap as any;
    const discoverContent = document.querySelector<HTMLElement>(
      '#social-discover-content',
    );
    if (!gsapRef || !discoverContent) return;

    gsapRef.fromTo(
      discoverContent,
      { autoAlpha: 0.86 },
      {
        autoAlpha: 1,
        duration: 0.18,
        ease: 'power1.out',
        overwrite: 'auto',
      },
    );
  }

  fadeGameBananaDetailOverlayOut(discoverContent: HTMLElement) {
    const gsapRef = window.gsap as any;
    if (!gsapRef) return;

    const rect = discoverContent.getBoundingClientRect();
    const overlay = discoverContent.cloneNode(true) as HTMLElement;
    overlay.style.position = 'fixed';
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.margin = '0';
    overlay.style.overflow = 'hidden';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '9999';
    document.body.appendChild(overlay);

    gsapRef.to(overlay, {
      autoAlpha: 0,
      duration: 0.18,
      ease: 'power1.out',
      onComplete: () => overlay.remove(),
    });
  }

  animateGameBananaPreviewToDetail(
    sourceCard?: HTMLElement,
    sourceRect?: DOMRect | null,
  ) {
    const gsapRef = window.gsap as any;
    const targetImage = document.querySelector<HTMLElement>(
      '.social-gamebanana-detail-image',
    );
    const sourceImage = sourceCard?.querySelector<HTMLImageElement>(
      '.social-gamebanana-featured-image, .social-gamebanana-card-image',
    );

    if (!gsapRef || !sourceRect || !targetImage || !sourceImage?.src) {
      this.gameBananaPreviewAnimation = null;
      return Promise.resolve();
    }

    const targetRect = targetImage.getBoundingClientRect();
    const clone = document.createElement('img');
    clone.src = sourceImage.src;
    clone.className = 'social-gamebanana-preview-flyout';
    clone.style.objectFit = 'cover';
    clone.style.objectPosition = 'center';
    clone.style.left = `${sourceRect.left}px`;
    clone.style.top = `${sourceRect.top}px`;
    clone.style.width = `${sourceRect.width}px`;
    clone.style.height = `${sourceRect.height}px`;
    document.body.appendChild(clone);

    gsapRef.set(targetImage, { autoAlpha: 0 });
    this.gameBananaPreviewAnimation = new Promise<void>((resolve) => {
      gsapRef.fromTo(
        clone,
        {
          x: 0,
          y: 0,
          width: sourceRect.width,
          height: sourceRect.height,
        },
        {
          x: targetRect.left - sourceRect.left,
          y: targetRect.top - sourceRect.top,
          width: targetRect.width,
          height: targetRect.height,
          duration: 0.46,
          ease: 'power3.out',
          onComplete: () => {
            clone.remove();
            gsapRef.to(targetImage, {
              autoAlpha: 1,
              duration: 0.12,
              ease: 'power1.out',
              onComplete: () => {
                this.gameBananaPreviewAnimation = null;
                resolve();
              },
            });
          },
        },
      );
    });

    gsapRef.fromTo(
      '.social-gamebanana-detail-info',
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.28, delay: 0.12, ease: 'power2.out' },
    );

    return this.gameBananaPreviewAnimation;
  }

  async returnFromGameBananaDetail() {
    const detailImage = document.querySelector<HTMLImageElement>(
      '.social-gamebanana-detail-image',
    );
    const source = this.gameBananaLastDetailSource;
    const detailRect = detailImage?.getBoundingClientRect() || null;
    const detailSrc = detailImage?.src || '';
    const snapshot = this.gameBananaDiscoverSnapshot;

    if (snapshot) {
      const discoverContent = document.querySelector<HTMLElement>(
        '#social-discover-content',
      );
      if (discoverContent) {
        this.fadeGameBananaDetailOverlayOut(discoverContent);
        discoverContent.innerHTML = snapshot.html;
      }
      this.gameBananaModsPage = snapshot.page;
      this.setGameBananaFeaturedCardPositions();
      this.setSocialMainScrollTop(snapshot.scrollTop);
      this.fadeGameBananaRestoredBackground();
    } else {
      const pageToRestore = source?.page || 1;
      await this.loadDiscover();
      if (pageToRestore > 1) {
        await this.loadGameBananaModsPage(pageToRestore);
      }
      this.setSocialMainScrollTop(source?.scrollTop || 0);
      this.fadeGameBananaRestoredBackground();
    }

    if (!source || !detailRect || !detailSrc) {
      return;
    }

    const targetCard = this.findGameBananaReturnTarget(source);
    const targetImage = targetCard?.querySelector<HTMLElement>(
      '.social-gamebanana-featured-image, .social-gamebanana-card-image',
    );
    if (targetCard) {
      this.keepGameBananaTargetVisible(targetCard);
    }
    const targetRect = targetImage?.getBoundingClientRect() || null;

    if (!targetImage || !targetRect) return;

    this.animateGameBananaDetailToPreview(detailRect, detailSrc, targetImage);
  }

  animateGameBananaDetailToPreview(
    detailRect: DOMRect,
    detailSrc: string,
    targetImage: HTMLElement,
  ) {
    const gsapRef = window.gsap as any;
    const targetRect = targetImage.getBoundingClientRect();

    if (!gsapRef || !targetRect) return;

    const clone = document.createElement('img');
    clone.src = detailSrc;
    clone.className = 'social-gamebanana-preview-flyout';
    clone.style.objectFit = 'cover';
    clone.style.objectPosition = 'center';
    clone.style.left = `${detailRect.left}px`;
    clone.style.top = `${detailRect.top}px`;
    clone.style.width = `${detailRect.width}px`;
    clone.style.height = `${detailRect.height}px`;
    document.body.appendChild(clone);

    gsapRef.fromTo(
      clone,
      {
        x: 0,
        y: 0,
        width: detailRect.width,
        height: detailRect.height,
      },
      {
        x: targetRect.left - detailRect.left,
        y: targetRect.top - detailRect.top,
        width: targetRect.width,
        height: targetRect.height,
        duration: 0.42,
        ease: 'power3.out',
        onComplete: () => {
          gsapRef.to(targetImage, {
            autoAlpha: 1,
            duration: 0.12,
            ease: 'power1.out',
          });
          clone.remove();
        },
      },
    );
  }

  renderGameBananaDetailPage(
    details: any,
    fallback: GameBananaTopSubmission | null,
    loading: boolean,
    files: GameBananaFileEntry[] = [],
    contentLoading = false,
  ) {
    const discoverContent = document.querySelector<HTMLElement>(
      '#social-discover-content',
    );
    if (!discoverContent) return;

    this.gameBananaCurrentDetail = loading
      ? null
      : {
          details,
          fallback,
          files,
        };

    const merged = {
      ...fallback,
      ...details,
      _aSubmitter: details?._aSubmitter || fallback?._aSubmitter,
      _aRootCategory: details?._aRootCategory || fallback?._aRootCategory,
      _aSubCategory: details?._aSubCategory || fallback?._aSubCategory,
      _aPreviewMedia: details?._aPreviewMedia || fallback?._aPreviewMedia,
    } as GameBananaTopSubmission;

    const name = this.escapeHtml(merged._sName || 'Unknown Mod');
    const creator = this.escapeHtml(merged._aSubmitter?._sName || 'Unknown');
    const model = this.escapeHtml(merged._sModelName || 'Mod');
    const rootCategory = this.escapeHtml(
      merged._aRootCategory?._sName || 'Unknown',
    );
    const subCategory = this.escapeHtml(merged._aSubCategory?._sName || '');
    const imageUrl = this.escapeHtml(this.getGameBananaSubmissionImage(merged));
    const imageStyle = this.getGameBananaDetailImageStyle(merged);
    const description = this.escapeHtml(
      this.getGameBananaSubmissionDescription(details, fallback || undefined) ||
        'No description available.',
    );
    const likes = Number(merged._nLikeCount || 0);
    const comments = Number(merged._nPostCount || 0);
    const views = Number(merged._nViewCount || 0);
    const dateAdded = this.escapeHtml(this.getGameBananaSubmissionDate(merged));

    const detailImage = imageUrl
      ? `<img src="${imageUrl}" alt="${name}" class="social-gamebanana-detail-image"${imageStyle}>`
      : loading
        ? '<div class="social-gamebanana-detail-image social-gamebanana-detail-image-skeleton social-gamebanana-skeleton-block"></div>'
        : '<div class="social-gamebanana-detail-image social-gamebanana-image-placeholder"><i class="bi bi-image"></i></div>';
    const detailInfo = loading
      ? this.renderGameBananaDetailSkeletonInfo()
      : `
        <div class="social-gamebanana-detail-info">
          <div class="social-gamebanana-detail-meta">
            <span>${model}</span>
            <span>${rootCategory}${subCategory ? ` / ${subCategory}` : ''}</span>
            ${dateAdded ? `<span>${dateAdded}</span>` : ''}
          </div>
          <h3 class="social-gamebanana-detail-name">${name}</h3>
          <p class="social-gamebanana-detail-author">by ${creator}</p>
          <div class="social-gamebanana-detail-stats">
            <span><i class="bi bi-hand-thumbs-up"></i> ${likes}</span>
            <span><i class="bi bi-chat-left"></i> ${comments}</span>
            <span><i class="bi bi-eye"></i> ${views}</span>
          </div>
          ${
            contentLoading
              ? this.renderGameBananaDescriptionSkeleton()
              : `<p class="social-gamebanana-detail-description">${description}</p>`
          }
          ${this.renderGameBananaFileList(files, contentLoading)}
        </div>
      `;

    discoverContent.innerHTML = `
      <div class="social-gamebanana-detail-page">
        <button class="social-back-button social-gamebanana-detail-back">
          <i class="bi bi-arrow-left"></i> Back
        </button>
        <div class="social-gamebanana-detail-layout">
          ${detailImage}
          ${detailInfo}
        </div>
      </div>
    `;
  }

  renderGameBananaDetailSkeletonInfo() {
    return `
      <div class="social-gamebanana-detail-info">
        <div class="social-gamebanana-detail-meta social-gamebanana-skeleton-row">
          <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-pill"></span>
          <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-pill social-gamebanana-skeleton-pill-wide"></span>
        </div>
        <div class="social-gamebanana-skeleton-block social-gamebanana-skeleton-title"></div>
        <div class="social-gamebanana-skeleton-block social-gamebanana-skeleton-author"></div>
        <div class="social-gamebanana-detail-stats social-gamebanana-skeleton-row">
          <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-stat"></span>
          <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-stat"></span>
          <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-stat"></span>
        </div>
        ${this.renderGameBananaDescriptionSkeleton()}
        ${this.renderGameBananaFileList([], true)}
      </div>
    `;
  }

  renderGameBananaDescriptionSkeleton() {
    return `
      <div class="social-gamebanana-detail-description social-gamebanana-description-skeleton">
        <span class="social-gamebanana-skeleton-block"></span>
        <span class="social-gamebanana-skeleton-block"></span>
        <span class="social-gamebanana-skeleton-block"></span>
        <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-line-short"></span>
      </div>
    `;
  }

  renderGameBananaFileList(files: GameBananaFileEntry[], loading = false) {
    if (loading) {
      return `
        <div class="social-gamebanana-files">
          <h4 class="social-gamebanana-files-title">Files</h4>
          <div class="social-gamebanana-files-list">
            ${Array.from({ length: 3 }, () => this.renderGameBananaFileSkeletonCard()).join('')}
          </div>
        </div>
      `;
    }

    if (!Array.isArray(files) || files.length === 0) {
      return `
        <div class="social-gamebanana-files">
          <h4 class="social-gamebanana-files-title">Files</h4>
          <p class="social-gamebanana-files-empty">No downloadable files found.</p>
        </div>
      `;
    }

    return `
      <div class="social-gamebanana-files">
        <h4 class="social-gamebanana-files-title">Files</h4>
        <div class="social-gamebanana-files-list">
          ${files.map((file) => this.renderGameBananaFileCard(file)).join('')}
        </div>
      </div>
    `;
  }

  renderGameBananaFileSkeletonCard() {
    return `
      <div class="social-gamebanana-file-card social-gamebanana-file-card-skeleton">
        <div class="social-gamebanana-file-info">
          <div class="social-gamebanana-skeleton-block social-gamebanana-skeleton-file-name"></div>
          <div class="social-gamebanana-skeleton-block social-gamebanana-skeleton-file-description"></div>
          <div class="social-gamebanana-file-meta social-gamebanana-skeleton-row">
            <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-file-meta"></span>
            <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-file-meta"></span>
          </div>
        </div>
        <div class="social-gamebanana-skeleton-block social-gamebanana-skeleton-download-btn"></div>
      </div>
    `;
  }

  renderGameBananaFileCard(file: GameBananaFileEntry) {
    const fileName = this.escapeHtml(file._sFile || 'Download');
    const description = this.escapeHtml(file._sDescription || '');
    const size = this.escapeHtml(this.formatGameBananaFileSize(file._nFilesize));
    const downloads = Number(file._nDownloadCount || 0);
    const downloadUrl = this.escapeHtml(file._sDownloadUrl || '');
    const analysis = this.escapeHtml(file._sAnalysisResult || '');
    const av = this.escapeHtml(file._sAvResult || '');

    return `
      <div class="social-gamebanana-file-card">
        <div class="social-gamebanana-file-info">
          <h5 class="social-gamebanana-file-name">${fileName}</h5>
          ${description ? `<p class="social-gamebanana-file-description">${description}</p>` : ''}
          <div class="social-gamebanana-file-meta">
            ${size ? `<span>${size}</span>` : ''}
            <span><i class="bi bi-download"></i> ${downloads}</span>
            ${analysis ? `<span>${analysis}</span>` : ''}
            ${av ? `<span>${av}</span>` : ''}
          </div>
        </div>
        <button class="social-gamebanana-file-download-btn" data-download-url="${downloadUrl}" data-file-id="${this.escapeHtml(file._idRow || '')}" ${downloadUrl ? '' : 'disabled'}>
          <i class="bi bi-download"></i>
          <span>Download</span>
        </button>
      </div>
    `;
  }

  createSocialDocumentId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 10 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join('');
  }

  getCurrentSocialUsername() {
    const usernameEl = document.querySelector<HTMLElement>(
      '#social-profile-username',
    );
    return (
      usernameEl?.textContent?.trim() ||
      this.userData?.displayName ||
      this.userData?.email?.split('@')[0] ||
      'User'
    );
  }

  getDownloadIdFromGameBananaUrl(url: string) {
    return (
      url.match(/\/dl\/(\d+)/)?.[1] ||
      url.match(/\/mmdl\/(\d+)/)?.[1] ||
      ''
    );
  }

  getGameBananaFileExtension(fileName: string) {
    const extension = fileName.split('.').pop()?.trim();
    return extension || 'zip';
  }

  getGameBananaFileByDownloadId(downloadId: string) {
    const files = this.gameBananaCurrentDetail?.files || [];
    return files.find((file) => {
      const fileId = file._idRow ? String(file._idRow) : '';
      const urlId = file._sDownloadUrl
        ? this.getDownloadIdFromGameBananaUrl(file._sDownloadUrl)
        : '';
      return fileId === downloadId || urlId === downloadId;
    });
  }

  createGameBananaSocialPayload(downloadUrl: string) {
    if (!this.gameBananaCurrentDetail || !this.gameBananaLastDetailSource) {
      return null;
    }

    const downloadId = this.getDownloadIdFromGameBananaUrl(downloadUrl);
    if (!downloadId) return null;

    const { details, fallback, files } = this.gameBananaCurrentDetail;
    const merged = {
      ...fallback,
      ...details,
      _aSubmitter: details?._aSubmitter || fallback?._aSubmitter,
      _aPreviewMedia: details?._aPreviewMedia || fallback?._aPreviewMedia,
    } as GameBananaTopSubmission;
    const selectedFile = this.getGameBananaFileByDownloadId(downloadId);
    const fileName = selectedFile?._sFile || 'download.zip';
    const modId =
      String(merged._idRow || this.gameBananaLastDetailSource.submissionId);
    const extension = this.getGameBananaFileExtension(fileName);
    const link = `fightplanner:https://gamebanana.com/mmdl/${downloadId},${merged._sModelName || 'Mod'},${modId},${extension}`;
    const imageUrl = this.getGameBananaSubmissionImage(merged);
    const availableFiles = files.map((file) => ({
      id: file._idRow || '',
      name: file._sFile || 'Download',
      description: file._sDescription || '',
      size: Number(file._nFilesize || 0),
      downloads: Number(file._nDownloadCount || 0),
    }));

    return {
      link,
      downloadId,
      modId,
      modName: merged._sName || 'Unknown Mod',
      creator: merged._aSubmitter?._sName || 'Unknown',
      imageUrl,
      availableFiles,
    };
  }

  registerPendingGameBananaSocialDownload(downloadUrl: string) {
    const payload = this.createGameBananaSocialPayload(downloadUrl);
    if (!payload) return;

    this.pendingGameBananaSocialDownloads.set(payload.downloadId, payload);
  }

  async fetchSocialLinksWithRefresh() {
    if (!this.authToken) return [];

    let response = await fetch(
      `${this.API_URL}/list/links?idToken=${this.authToken}`,
    );

    if (response.status === 401 && (await this.refreshAuthToken())) {
      response = await fetch(
        `${this.API_URL}/list/links?idToken=${this.authToken}`,
      );
    }

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data) ? data : data.documents || [];
  }

  async writeSocialLinkDocument(docId: string, body: Record<string, any>) {
    if (!this.authToken) return false;

    const write = () =>
      fetch(`${this.API_URL}/write/links/${docId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...body,
          _idToken: this.authToken,
        }),
      });

    let response = await write();
    if (response.status === 401 && (await this.refreshAuthToken())) {
      response = await write();
    }

    return response.ok;
  }

  async saveInstalledGameBananaDownloadToSocial(downloadUrl: string) {
    if (!this.authToken || !this.userData) return;

    const downloadId = this.getDownloadIdFromGameBananaUrl(downloadUrl);
    if (!downloadId) return;

    const pending = this.pendingGameBananaSocialDownloads.get(downloadId);
    if (!pending) return;

    try {
      const links = await this.fetchSocialLinksWithRefresh();
      const username = this.getCurrentSocialUsername();
      const existing = links.find((mod) => {
        const link = String(mod.link || '');
        const sameLink = link === pending.link;
        const sameDownload = this.getDownloadIdFromGameBananaUrl(link) === downloadId;
        const isOwner =
          mod.userId === this.userData?.localId ||
          (username && mod.pseudo === username);
        return isOwner && (sameLink || sameDownload);
      });
      const docId = existing?.id || this.createSocialDocumentId();
      const payload = {
        id: docId,
        availableFiles: JSON.stringify(pending.availableFiles),
        createdAt: existing?.createdAt || new Date().toISOString(),
        creator: pending.creator,
        image_url: pending.imageUrl,
        isHidden: false,
        link: pending.link,
        modId: pending.modId,
        modInstalled: true,
        mod_name: pending.modName,
        needsFileSelection:
          pending.availableFiles.length > 1 ? 'true' : 'false',
        pseudo: username,
        userId: this.userData.localId,
      };

      const written = await this.writeSocialLinkDocument(docId, payload);
      if (written) {
        this.invalidateCache('links');
        this.pendingGameBananaSocialDownloads.delete(downloadId);
      }
    } catch (error) {
      console.error('[Social] Failed to save GameBanana download:', error);
    }
  }

  formatGameBananaFileSize(bytes?: number) {
    const value = Number(bytes || 0);
    if (!value) return '';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  formatGameBananaPeriod(period?: string) {
    const labels = {
      today: 'Today',
      week: 'This week',
      month: 'This month',
      '3month': '3 months',
      '6month': '6 months',
      year: 'This year',
      alltime: 'All time',
    };

    return period && labels[period] ? labels[period] : 'Featured';
  }

  updateGameBananaFeaturedStack(index: number, direction = 0) {
    if (this.gameBananaFeaturedMods.length === 0) return;

    const total = this.gameBananaFeaturedMods.length;
    const previousIndex = this.gameBananaFeaturedIndex;
    this.gameBananaFeaturedIndex = (index + total) % total;

    const carousel = document.querySelector<HTMLElement>(
      '#social-gamebanana-carousel',
    );
    if (!carousel) return;

    const cards = carousel.querySelectorAll<HTMLElement>(
      '.social-gamebanana-card-featured',
    );

    if (cards.length === 0) {
      carousel.innerHTML = this.renderGameBananaFeaturedStack();
      return;
    }

    cards.forEach((card) => {
      const cardIndex = Number(card.getAttribute('data-featured-index'));
      const position = this.getGameBananaFeaturedPosition(cardIndex);

      card.classList.remove(
        'is-active',
        'is-previous',
        'is-next',
        'is-hidden',
        'was-active',
      );
      card.classList.add(`is-${position}`);
      if (cardIndex === previousIndex && previousIndex !== this.gameBananaFeaturedIndex) {
        card.classList.add('was-active');
      }
      card.setAttribute('data-featured-position', position);
    });

    this.animateGameBananaFeaturedCards(direction);
  }

  scrollGameBananaCarousel(direction: number) {
    this.updateGameBananaFeaturedStack(
      this.gameBananaFeaturedIndex + direction,
      direction,
    );
  }

  getGameBananaFeaturedOffset() {
    const carousel = document.querySelector<HTMLElement>(
      '#social-gamebanana-carousel',
    );
    const activeCard = carousel?.querySelector<HTMLElement>(
      '.social-gamebanana-card-featured.is-active',
    );
    const width = carousel?.clientWidth || 900;
    const cardWidth = activeCard?.offsetWidth || Math.min(560, width * 0.68);
    const containedOffset = Math.max(0, (width - cardWidth * 0.88) / 2 - 12);
    const preferredOffset = Math.max(120, Math.min(300, width * 0.24));

    return Math.min(preferredOffset, containedOffset);
  }

  getGameBananaFeaturedCardState(position: string) {
    const offset = this.getGameBananaFeaturedOffset();
    const isSmall = window.innerWidth <= 720;
    const sideY = isSmall ? 16 : 18;
    const sideRotation = isSmall ? 6 : 8;

    switch (position) {
      case 'active':
        return {
          xPercent: -50,
          x: 0,
          y: 0,
          scale: 1,
          rotationY: 0,
          autoAlpha: 1,
          zIndex: 4,
          filter: 'brightness(1)',
        };
      case 'previous':
        return {
          xPercent: -50,
          x: -offset,
          y: sideY,
          scale: 0.88,
          rotationY: sideRotation,
          autoAlpha: 0.72,
          zIndex: 2,
          filter: 'brightness(0.78)',
        };
      case 'next':
        return {
          xPercent: -50,
          x: offset,
          y: sideY,
          scale: 0.88,
          rotationY: -sideRotation,
          autoAlpha: 0.72,
          zIndex: 2,
          filter: 'brightness(0.78)',
        };
      default:
        return {
          xPercent: -50,
          x: 0,
          y: 42,
          scale: 0.78,
          rotationY: 0,
          autoAlpha: 0,
          zIndex: 1,
          filter: 'brightness(0.65)',
        };
    }
  }

  setGameBananaFeaturedCardPositions() {
    const gsapRef = window.gsap as any;
    const cards = document.querySelectorAll<HTMLElement>(
      '#social-gamebanana-carousel .social-gamebanana-card-featured',
    );

    cards.forEach((card) => {
      const position = card.getAttribute('data-featured-position') || 'hidden';
      const state = this.getGameBananaFeaturedCardState(position);

      if (gsapRef) {
        gsapRef.set(card, state);
      } else {
        card.style.zIndex = `${state.zIndex}`;
      }
    });
  }

  animateGameBananaFeaturedCards(direction: number) {
    const gsapRef = window.gsap as any;
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#social-gamebanana-carousel .social-gamebanana-card-featured',
      ),
    );

    if (!gsapRef || cards.length === 0) {
      this.setGameBananaFeaturedCardPositions();
      return;
    }

    if (this.gameBananaFeaturedTimeline) {
      this.gameBananaFeaturedTimeline.kill();
    }

    this.gameBananaFeaturedTimeline = gsapRef.timeline({
      defaults: {
        duration: 0.48,
        ease: 'power3.out',
        overwrite: 'auto',
      },
      onComplete: () => {
        cards.forEach((card) => card.classList.remove('was-active'));
        this.gameBananaFeaturedTimeline = null;
      },
    });

    cards.forEach((card) => {
      const position = card.getAttribute('data-featured-position') || 'hidden';
      const state = this.getGameBananaFeaturedCardState(position);

      gsapRef.set(card, { zIndex: state.zIndex });

      this.gameBananaFeaturedTimeline.to(
        card,
        {
          xPercent: state.xPercent,
          x: state.x,
          y: state.y,
          scale: state.scale,
          rotationY: state.rotationY,
          autoAlpha: state.autoAlpha,
          filter: state.filter,
          duration: position === 'hidden' ? 0.34 : 0.5,
          ease: 'power3.out',
        },
        0,
      );
    });

    void direction;
  }

  async loadFeed() {
    const feedContent = document.querySelector<HTMLElement>(
      '#social-feed-content',
    );
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
        const usernameEl = document.querySelector<HTMLElement>(
          '#social-profile-username',
        );
        const username = usernameEl ? usernameEl.textContent : null;

        feedContent.innerHTML =
          '<div class="social-mods-grid">' +
          mods
            .map((mod) => {
              const modUserId = mod.userId;
              const modPseudo = mod.pseudo;
              const isOwn = !!(
                modUserId === userId ||
                (username && modPseudo === username)
              );

              return this.renderModCard(mod, isOwn);
            })
            .join('') +
          '</div>';

        setTimeout(() => {
          const cards =
            feedContent.querySelectorAll<HTMLElement>('.social-mod-card');
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
    const myModsContent = document.querySelector<HTMLElement>(
      '#social-my-mods-content',
    );
    if (!myModsContent || !this.userData) return;

    myModsContent.innerHTML =
      '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading your mods...</p></div>';

    try {
      const userId = this.userData.localId;
      const usernameEl = document.querySelector<HTMLElement>(
        '#social-profile-username',
      );
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
            const cards =
              myModsContent.querySelectorAll<HTMLElement>('.social-mod-card');
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
    const friendsContent = document.querySelector<HTMLElement>(
      '#social-friends-content',
    );
    const friendsListContainer = document.querySelector<HTMLElement>(
      '#social-friends-list-container',
    );
    const friendRequestsSection = document.querySelector<HTMLElement>(
      '#social-friend-requests-section',
    );
    const friendRequestsList = document.querySelector<HTMLElement>(
      '#social-friend-requests-list',
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
            const cards = friendRequestsList.querySelectorAll<HTMLElement>(
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
            const cards = friendsListContainer.querySelectorAll<HTMLElement>(
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
    // Only show "installed" status for user's own mods, not for other users' mods
    const installedClass = isOwn && mod.modInstalled ? 'installed' : '';
    const installedBadge = isOwn && mod.modInstalled
      ? '<span class="social-mod-badge installed"><i class="bi bi-check-circle"></i> Installed</span>'
      : '';
    const creator = mod.pseudo || mod.creator || 'Unknown';
    const creatorClass = isOwn ? '' : 'social-creator-link';

    // Download button logic:
    // - For own mods: show Re-download if installed, Download if not
    // - For other users' mods: show Download button if they have a fightplanner link
    let downloadButton = '';
    if (mod.link && mod.link.startsWith('fightplanner:')) {
      if (isOwn) {
        downloadButton = `<button class="social-mod-download-btn" data-link="${mod.link}"><i class="bi bi-download"></i> ${mod.modInstalled ? 'Re-download' : 'Download'}</button>`;
      } else {
        // For other users' mods, just show "Download"
        downloadButton = `<button class="social-mod-download-btn" data-link="${mod.link}"><i class="bi bi-download"></i> Download</button>`;
      }
    }

    return `
            <div class="social-mod-card ${installedClass}">
                ${mod.image_url
        ? `<img src="${mod.image_url}" alt="${mod.mod_name || 'Mod'}" class="social-mod-image">`
        : '<div class="social-mod-image-placeholder"><i class="bi bi-image"></i></div>'
      }
                <div class="social-mod-info">
                    <h3 class="social-mod-name">${mod.mod_name || 'Unknown Mod'}</h3>
                    <p class="social-mod-creator">
                        by <span class="${creatorClass}" data-username="${creator}" data-userid="${mod.userId || ''}">${creator}</span>
                    </p>
                    ${installedBadge}
                    ${downloadButton}
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
                    ${photoURL
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
      const data: {
        fields: { [key: string]: string[] };
      } = await response.json();

      if (response.ok && data.fields) {
        const userFields: UserFields = {};

        Object.entries(data.fields).forEach(([key, value]) => {
          userFields[key] = Object.values(value)[0];
        });

        const usernameEl = document.querySelector<HTMLElement>(
          '#social-profile-username',
        );
        const emailEl = document.querySelector<HTMLElement>(
          '#social-profile-email',
        );
        const avatarEl = document.querySelector<HTMLImageElement>(
          '#social-profile-avatar',
        );
        const usernameInput = document.querySelector<HTMLInputElement>(
          '#social-edit-username',
        );
        const privacyVisibility = document.querySelector<HTMLSelectElement>(
          '#social-privacy-visibility',
        );
        const privacySync = document.querySelector<HTMLInputElement>(
          '#social-privacy-sync',
        );

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
              .querySelector<HTMLElement>(
                '.social-nav-item[data-section="discover"]',
              )
              ?.classList.contains('active')
          ) {
            this.loadDiscover();
          } else if (
            document
              .querySelector<HTMLElement>(
                '.social-nav-item[data-section="people-downloads"]',
              )
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

      const usernameEl = document.querySelector<HTMLElement>(
        '#social-profile-username',
      );
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

      const modsStatEl =
        document.querySelector<HTMLElement>('#social-stat-mods');
      const friendsStatEl = document.querySelector<HTMLElement>(
        '#social-stat-friends',
      );

      if (modsStatEl) modsStatEl.textContent = `${modsCount}`;
      if (friendsStatEl) friendsStatEl.textContent = `${friendsCount}`;
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  }

  setupProfileButtons() {
    const saveUsernameBtn = document.querySelector<HTMLElement>(
      '#social-save-username',
    );
    if (saveUsernameBtn) {
      saveUsernameBtn.addEventListener('click', async () => {
        await this.updateUsername();
      });
    }

    const savePrivacyBtn = document.querySelector<HTMLElement>(
      '#social-save-privacy',
    );
    if (savePrivacyBtn) {
      savePrivacyBtn.addEventListener('click', async () => {
        await this.updatePrivacySettings();
      });
    }

    const saveAutoDownloadBtn = document.querySelector<HTMLElement>(
      '#social-save-auto-download',
    );
    if (saveAutoDownloadBtn) {
      saveAutoDownloadBtn.addEventListener('click', async () => {
        await this.updateAutoDownloadSettings();
      });
    }

    const logoutBtn = document.querySelector<HTMLElement>('#social-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await this.logout();
      });
    }

    // Go to Settings button
    const goToSettingsBtn = document.querySelector<HTMLElement>('#social-go-to-settings-btn');
    if (goToSettingsBtn) {
      goToSettingsBtn.addEventListener('click', () => {
        // Switch to Settings tab
        const settingsTab = document.querySelector<HTMLElement>('[data-tab="settings"]');
        if (settingsTab) {
          settingsTab.click();
          // After a small delay, switch to the Social settings sub-tab
          setTimeout(() => {
            const socialSettingsBtn = document.querySelector<HTMLElement>('[data-settings-tab="social"]');
            if (socialSettingsBtn) {
              socialSettingsBtn.click();
            }
          }, 100);
        }
      });
    }

    document.addEventListener('click', async (e) => {
      const clickedElement = e.target as HTMLElement;
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
          clickedElement.closest('#social-remove-friend-modal') ||
          clickedElement.closest('#social-register-modal') ||
          clickedElement.closest('#social-forgot-modal')
        ) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }

      if (clickedElement.closest('.social-mod-download-btn')) {
        const btn = clickedElement.closest('.social-mod-download-btn');
        const link = btn!.getAttribute('data-link');
        if (
          link &&
          link.startsWith('fightplanner:') &&
          window.electronAPI &&
          window.electronAPI.openFightPlannerLink
        ) {
          window.electronAPI.openFightPlannerLink(link);
        }
      }

      const carouselButton = clickedElement.closest<HTMLElement>(
        '.social-gamebanana-carousel-btn',
      );
      if (carouselButton) {
        e.preventDefault();
        e.stopPropagation();
        const direction =
          carouselButton.getAttribute('data-direction') === 'next' ? 1 : -1;
        this.scrollGameBananaCarousel(direction);
        return false;
      }

      const featuredCard = clickedElement.closest<HTMLElement>(
        '.social-gamebanana-card-featured',
      );
      if (featuredCard) {
        const featuredPosition = featuredCard.getAttribute(
          'data-featured-position',
        );
        const featuredIndex = Number(
          featuredCard.getAttribute('data-featured-index'),
        );

        if (
          featuredPosition !== 'active' &&
          Number.isFinite(featuredIndex)
        ) {
          e.preventDefault();
          e.stopPropagation();
          const total = this.gameBananaFeaturedMods.length;
          const nextIndex = (this.gameBananaFeaturedIndex + 1) % total;
          const direction = featuredIndex === nextIndex ? 1 : -1;
          this.updateGameBananaFeaturedStack(featuredIndex, direction);
          return false;
        }
      }

      const pageButton = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-page-btn',
      );
      if (pageButton) {
        e.preventDefault();
        e.stopPropagation();
        if (pageButton.disabled) return false;

        const action = pageButton.getAttribute('data-page-action');
        const nextPage =
          action === 'next'
            ? this.gameBananaModsPage + 1
            : this.gameBananaModsPage - 1;
        await this.loadGameBananaModsPage(nextPage);
        return false;
      }

      if (clickedElement.closest('.social-gamebanana-detail-back')) {
        e.preventDefault();
        e.stopPropagation();
        await this.returnFromGameBananaDetail();
        return false;
      }

      const fileDownloadBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-file-download-btn',
      );
      if (fileDownloadBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (fileDownloadBtn.disabled) return false;

        const downloadUrl = fileDownloadBtn.getAttribute('data-download-url');
        if (downloadUrl && window.electronAPI?.openFightPlannerLink) {
          this.registerPendingGameBananaSocialDownload(downloadUrl);
          await window.electronAPI.openFightPlannerLink(
            `fightplanner:${downloadUrl}`,
          );
        }
        return false;
      }

      const gameBananaCard = clickedElement.closest<HTMLElement>(
        '.social-gamebanana-card',
      );
      if (gameBananaCard) {
        e.preventDefault();
        e.stopPropagation();
        const modelName = gameBananaCard.getAttribute('data-gb-model');
        const submissionId = gameBananaCard.getAttribute('data-gb-id');
        if (modelName && submissionId) {
          this.captureGameBananaDiscoverSnapshot();
          this.gameBananaLastDetailSource = {
            modelName,
            submissionId,
            sourceKind: this.getGameBananaCardSourceKind(gameBananaCard),
            page: this.gameBananaModsPage,
            scrollTop: this.getSocialMainScrollTop(),
          };
          await this.showGameBananaSubmissionDetails(
            modelName,
            submissionId,
            gameBananaCard,
          );
        }
        return false;
      }

      if (
        clickedElement.closest('.social-creator-link') &&
        !clickedElement.closest('.social-remove-friend-btn')
      ) {
        const creatorLink = clickedElement.closest('.social-creator-link');
        const username = creatorLink!.getAttribute('data-username');
        const userId = creatorLink!.getAttribute('data-userid');
        if (username && !clickedElement.closest('.social-mod-download-btn')) {
          this.showUserProfile(username, userId);
        }
      }

      if (clickedElement.closest('#social-back-btn')) {
        this.switchSection('people-downloads');
      }

      if (clickedElement.closest('#social-add-friend-btn')) {
        const btn = clickedElement.closest(
          '#social-add-friend-btn',
        ) as HTMLButtonElement;

        let userId = btn!.getAttribute('data-userid');

        const username =
          btn!.getAttribute('data-username') || this.viewedUsername;

        if (!userId) {
          userId = this.viewedUserId;
          if (!userId && username) {
            const addFriendText = document.querySelector<HTMLElement>(
              '#social-add-friend-text',
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
              const mods: {
                userId?: string;
                pseudo?: string;
                creator?: string;
              }[] = Array.isArray(modsData)
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
          const addFriendText = document.querySelector<HTMLElement>(
            '#social-add-friend-text',
          );
          if (addFriendText) addFriendText.textContent = 'Add Friend';
          btn.disabled = false;
        }
      }

      const target = e.target as HTMLElement;

      if (target.closest('.social-accept-friend-btn')) {
        const btn = target.closest('.social-accept-friend-btn');
        const requestId = btn!.getAttribute('data-request-id');
        if (requestId) {
          await this.acceptFriendRequest(requestId);
        }
      }

      if (target.closest('.social-reject-friend-btn')) {
        const btn = target.closest('.social-reject-friend-btn');
        const requestId = btn!.getAttribute('data-request-id');
        if (requestId) {
          await this.rejectFriendRequest(requestId);
        }
      }
    });
  }

  async updateAddFriendButton(username, userId) {
    const addFriendBtn = document.querySelector<HTMLInputElement>(
      '#social-add-friend-btn',
    );

    const addFriendText = document.querySelector<HTMLElement>(
      '#social-add-friend-text',
    );

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
        const currentUserId = this.userData!.localId;

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

    const addFriendBtn = document.querySelector<HTMLInputElement>(
      '#social-add-friend-btn',
    );
    const addFriendText = document.querySelector<HTMLElement>(
      '#social-add-friend-text',
    );

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
    const removeBtn = document.querySelector<HTMLElement>(
      `.social-remove-friend-btn[data-relation-id="${relationId}"]`,
    );
    if (removeBtn) {
      const friendCard = removeBtn.closest('.social-friend-card');
      if (friendCard) {
        const nameEl = friendCard.querySelector<HTMLElement>(
          '.social-friend-name',
        );
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

    let modal = document.querySelector<HTMLElement>(
      '#social-remove-friend-modal',
    );

    if (!modal) {
      const socialTab = document.querySelector<HTMLElement>('#tab-social');
      if (socialTab) {
        modal = socialTab.querySelector<HTMLElement>(
          '#social-remove-friend-modal',
        );
      }
    }

    if (!modal) {
      console.error(
        '[Social] Remove friend modal not found in DOM. All modals:',
        document.querySelectorAll<HTMLElement>('.social-modal'),
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

    const friendNameEl = modal.querySelector<HTMLElement>(
      '#social-remove-friend-name',
    );
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

    const content = modal.querySelector<HTMLElement>('.social-modal-content');

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
    const modal = document.querySelector<HTMLElement>(
      '#social-remove-friend-modal',
    );
    if (!modal) {
      const socialTab = document.querySelector<HTMLElement>('#tab-social');
      if (socialTab) {
        const tabModal = socialTab.querySelector<HTMLElement>(
          '#social-remove-friend-modal',
        );

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

    const content = modal.querySelector<HTMLElement>('.social-modal-content');

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
      const modal = document.querySelector<HTMLElement>(
        '#social-remove-friend-modal',
      );
      if (!modal) {
        console.error('[Social] Remove friend modal not found during setup');
        return;
      }

      console.log('[Social] Setting up remove friend modal');

      modal.style.display = 'none';
      modal.style.opacity = '0';

      const closeBtn = modal.querySelector<HTMLElement>(
        '#social-remove-friend-close',
      );
      const cancelBtn = modal.querySelector<HTMLElement>(
        '#social-remove-friend-cancel',
      );
      const confirmBtn = modal.querySelector<HTMLElement>(
        '#social-remove-friend-confirm',
      );

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

  async showUserProfile(username: string, userId: string | null = null) {
    this.viewedUserId = userId;
    this.viewedUsername = username;

    const userModsContent = document.querySelector<HTMLElement>(
      '#social-user-mods-content',
    );
    if (userModsContent) {
      userModsContent.innerHTML =
        '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading user mods...</p></div>';
      userModsContent.style.opacity = '0.5';
    }

    const usernameEl = document.querySelector<HTMLElement>(
      '#social-user-profile-username',
    );
    const avatarEl = document.querySelector<HTMLImageElement>(
      '#social-user-profile-avatar',
    );

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

    const navItems = document.querySelectorAll<HTMLElement>('.social-nav-item');
    navItems.forEach((item) => {
      item.classList.remove('active');
    });

    this.updateAddFriendButton(username, userId);

    this.loadUserMods(username, userId).then(() => {
      const resolvedUserId = userId || this.viewedUserId;
      if (resolvedUserId && resolvedUserId !== userId) {
        this.checkFriendshipStatus(
          document.querySelector<HTMLElement>('#social-add-friend-btn'),
          document.querySelector<HTMLElement>('#social-add-friend-text'),
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

  async loadUserMods(username, userId: string | null = null) {
    const userModsContent = document.querySelector<HTMLElement>(
      '#social-user-mods-content',
    );
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

            const userData: {
              fields: { [key: string]: string[] };
            } = await userResponse.json();

            if (userData.fields) {
              const userFields: UserFields = {};

              Object.entries(userData.fields).forEach(([key, value]) => {
                userFields[key] = Object.values(value)[0];
              });
              const avatarEl = document.querySelector<HTMLImageElement>(
                '#social-user-profile-avatar',
              );
              if (avatarEl && userFields.photoURL) {
                avatarEl.style.transition = 'opacity 0.3s ease';
                avatarEl.style.opacity = '0';

                setTimeout(() => {
                  avatarEl.src = userFields.photoURL!;
                  avatarEl.style.opacity = '1';
                }, 150);
              }
            }
          } catch (e) {
            console.warn('Failed to fetch user info:', e);
          }
        }

        const modsCountEl = document.querySelector<HTMLElement>(
          '#social-user-stat-mods',
        );
        if (modsCountEl) {
          modsCountEl.style.transform = 'scale(0.8)';
          modsCountEl.style.opacity = '0';
          modsCountEl.textContent = `${userMods.length}`;
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

          const cards =
            userModsContent.querySelectorAll<HTMLInputElement>(
              '.social-mod-card',
            );

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

    const enabledCheckbox = document.querySelector<HTMLInputElement>(
      '#social-auto-download-enabled',
    );
    const intervalInput = document.querySelector<HTMLInputElement>(
      '#social-auto-download-interval',
    );

    if (enabledCheckbox) {
      enabledCheckbox.checked = this.autoDownloadEnabled;
    }
    if (intervalInput) {
      intervalInput.value = `${this.autoDownloadIntervalMs / (60 * 1000)}`;
    }
  }

  async updateAutoDownloadSettings() {
    const enabledCheckbox = document.querySelector<HTMLInputElement>(
      '#social-auto-download-enabled',
    );
    const intervalInput = document.querySelector<HTMLInputElement>(
      '#social-auto-download-interval',
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
    const usernameInput = document.querySelector<HTMLInputElement>(
      '#social-edit-username',
    );
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

        const usernameEl = document.querySelector<HTMLElement>(
          '#social-profile-username',
        );
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
    const privacyVisibility = document.querySelector<HTMLInputElement>(
      '#social-privacy-visibility',
    );
    const privacySync = document.querySelector<HTMLInputElement>(
      '#social-privacy-sync',
    );

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
        } catch (e) { }
      }

      const profileContainer = document.querySelector<HTMLElement>(
        '#social-profile-container',
      );
      if (profileContainer) profileContainer.style.display = 'none';

      const emailInput =
        document.querySelector<HTMLInputElement>('#social-email');
      const passInput =
        document.querySelector<HTMLInputElement>('#social-password');

      if (emailInput) emailInput.value = '';
      if (passInput) passInput.value = '';

      this.stopAutoDownloadCheck();

      this.showLoginScreen();

      if (window.toastManager)
        window.toastManager.success('toasts.loggedOutSuccessfully');
    } catch (error) {
      console.error('Logout error:', error);

      this.stopAutoDownloadCheck();
      const profileContainer = document.querySelector<HTMLElement>(
        '#social-profile-container',
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
        `[Social] Starting auto-download check (interval: ${this.autoDownloadIntervalMs / 1000
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
        const enabled = (await window.electronAPI.store.get(
          'social.autoDownloadEnabled',
        )) as boolean | undefined;

        const intervalMinutes = (await window.electronAPI.store.get(
          'social.autoDownloadIntervalMinutes',
        )) as number;

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

      const usernameEl = document.querySelector<HTMLElement>(
        '#social-profile-username',
      );
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
        this.saveInstalledGameBananaDownloadToSocial(data.url);
      }
    });
  }

  async updateModInstalledStatus(downloadUrl) {
    if (!this.authToken || !this.userData) {
      console.log('[Social] No auth token, cannot update mod status');
      return;
    }

    try {
      let response = await fetch(
        `${this.API_URL}/list/links?idToken=${this.authToken}`,
      );

      // Handle 401 - try to refresh token
      if (response.status === 401) {
        console.log('[Social] Token expired, attempting refresh...');
        const refreshed = await this.refreshAuthToken();
        if (refreshed) {
          // Retry with new token
          response = await fetch(
            `${this.API_URL}/list/links?idToken=${this.authToken}`,
          );
        } else {
          console.error('[Social] Token refresh failed, cannot update mod status');
          return;
        }
      }

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

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      if (!Array.isArray(mods)) {
        console.error('[Social] Invalid mods data received');
        return;
      }

      const userId = this.userData.localId;
      const usernameEl = document.querySelector<HTMLElement>(
        '#social-profile-username',
      );
      const username = usernameEl ? usernameEl.textContent : null;

      for (const mod of mods) {
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
            const writeResponse = await fetch(`${this.API_URL}/write/links/${mod.id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                modInstalled: true,
                _idToken: this.authToken,
              }),
            });

            // Handle 401 on write - try to refresh token and retry
            if (writeResponse.status === 401) {
              console.log('[Social] Token expired on write, attempting refresh...');
              const refreshed = await this.refreshAuthToken();
              if (refreshed) {
                // Retry write with new token
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
              }
            }

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

export { type SocialManager };
