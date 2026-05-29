class SocialManagerBase {
  [key: string]: any;
  API_URL: string;
  GAMEBANANA_TOP_SUBS_URL: string;
  GAMEBANANA_SUBFEED_URL: string;
  authToken: string | null;
  tokenRefreshPromise: Promise<boolean> | null;
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
  profileMediaUploadAnim: any;
  gameBananaFeaturedMods: GameBananaTopSubmission[];
  gameBananaFeaturedIndex: number;
  gameBananaFeaturedTimeline: any;
  gameBananaPreviewAnimation: Promise<void> | null;
  gameBananaModsPage: number;
  gameBananaModsTotalPages: number;
  gameBananaSearchQuery: string;
  gameBananaSearchDebounce: ReturnType<typeof setTimeout> | null;
  gameBananaModsRequestId: number;
  gameBananaSearchListenerBound: boolean;
  gameBananaSubmissionCache: Map<string, GameBananaTopSubmission>;
  gameBananaLastDetailSource: {
    modelName: string;
    submissionId: string;
    sourceKind: 'featured' | 'grid' | 'social';
    page: number;
    scrollTop: number;
  } | null;
  gameBananaDetailReturnSection: string | null;
  gameBananaDetailReturnScrollTop: number;
  gameBananaDetailReturnInProgress: boolean;
  gameBananaDiscoverSnapshot: {
    html: string;
    page: number;
    scrollTop: number;
  } | null;
  gameBananaCurrentDetail: {
    details: any;
    fallback: GameBananaTopSubmission | null;
    files: GameBananaFileEntry[];
  } | null;
  skylineInstalledCache: boolean | null;
  pendingGameBananaSocialDownloads: Map<
    string,
    PendingGameBananaSocialDownload
  >;
  profileMediaCropState: ProfileMediaCropState | null;
  profileMediaListenersBound: boolean;
  socialNavigationListenersBound: boolean;
  socialProfileButtonsBound: boolean;
  socialDocumentClickListenerBound: boolean;
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
      'https://gamebanana.com/apiv11/Game/6498/Subfeed';
    this.authToken = null;
    this.tokenRefreshPromise = null;
    this.userData = null;
    this.autoDownloadInterval = null;
    this.autoDownloadEnabled = true;
    this.autoDownloadIntervalMs = 5 * 60 * 1000;
    this.installingMods = new Set();
    this.serviceUnavailableShown = false;
    this.profileMediaUploadAnim = null;
    this.gameBananaFeaturedMods = [];
    this.gameBananaFeaturedIndex = 0;
    this.gameBananaFeaturedTimeline = null;
    this.gameBananaPreviewAnimation = null;
    this.gameBananaModsPage = 1;
    this.gameBananaModsTotalPages = 1;
    this.gameBananaSearchQuery = '';
    this.gameBananaSearchDebounce = null;
    this.gameBananaModsRequestId = 0;
    this.gameBananaSearchListenerBound = false;
    this.gameBananaSubmissionCache = new Map();
    this.gameBananaLastDetailSource = null;
    this.gameBananaDetailReturnSection = null;
    this.gameBananaDetailReturnScrollTop = 0;
    this.gameBananaDetailReturnInProgress = false;
    this.gameBananaDiscoverSnapshot = null;
    this.gameBananaCurrentDetail = null;
    this.skylineInstalledCache = null;
    this.pendingGameBananaSocialDownloads = new Map();
    this.profileMediaCropState = null;
    this.profileMediaListenersBound = false;
    this.socialNavigationListenersBound = false;
    this.socialProfileButtonsBound = false;
    this.socialDocumentClickListenerBound = false;

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

  isAuthErrorPayload(data: any) {
    const rawMessage =
      typeof data === 'string'
        ? data
        : data?.error?.message || data?.error || data?.message || '';
    const message = String(rawMessage).toLowerCase();
    return (
      message.includes('token invalide') ||
      message.includes('invalid_id_token') ||
      message.includes('invalid id token') ||
      message.includes('id token') ||
      message.includes('auth credential') ||
      message.includes('token expired') ||
      message.includes('expired')
    );
  }

  async parseJsonResponse(response: Response) {
    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (error) {
      return { message: text };
    }
  }

  async refreshAuthToken(): Promise<boolean> {
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = this.refreshAuthTokenInternal().finally(() => {
      this.tokenRefreshPromise = null;
    });

    return this.tokenRefreshPromise;
  }

  async refreshAuthTokenInternal(): Promise<boolean> {
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

  getRequestWithToken(url: string, options: RequestInit = {}) {
    const nextOptions: RequestInit = { ...options };
    let nextUrl = url;

    if (!this.authToken) {
      return { url: nextUrl, options: nextOptions };
    }

    try {
      const parsedUrl = new URL(nextUrl, window.location.href);
      if (parsedUrl.searchParams.has('idToken')) {
        parsedUrl.searchParams.set('idToken', this.authToken);
        nextUrl = parsedUrl.toString();
      }
    } catch (error) {
      if (nextUrl.includes('idToken=')) {
        nextUrl = nextUrl.replace(
          /([?&]idToken=)[^&]*/,
          `$1${encodeURIComponent(this.authToken)}`,
        );
      }
    }

    const body = nextOptions.body;
    if (typeof body === 'string') {
      try {
        const parsedBody = JSON.parse(body);
        let changed = false;
        if ('idToken' in parsedBody) {
          parsedBody.idToken = this.authToken;
          changed = true;
        }
        if ('_idToken' in parsedBody) {
          parsedBody._idToken = this.authToken;
          changed = true;
        }
        if (changed) {
          nextOptions.body = JSON.stringify(parsedBody);
        }
      } catch (error) {
        // Body is not JSON, leave it unchanged.
      }
    } else if (body instanceof FormData) {
      const formData = new FormData();
      body.forEach((value, key) => {
        if (key !== 'idToken' && key !== '_idToken') {
          formData.append(key, value);
        }
      });
      if (body.has('idToken')) formData.append('idToken', this.authToken);
      if (body.has('_idToken')) formData.append('_idToken', this.authToken);
      nextOptions.body = formData;
    }

    return { url: nextUrl, options: nextOptions };
  }

  async fetchWithAuth(url: string, options: RequestInit = {}) {
    let request = this.getRequestWithToken(url, options);
    let response = await fetch(request.url, request.options);

    let shouldRefresh = response.status === 401 || response.status === 403;
    if (!shouldRefresh && !response.ok) {
      try {
        const errorPayload = await this.parseJsonResponse(response.clone());
        shouldRefresh = this.isAuthErrorPayload(errorPayload);
      } catch (error) {
        shouldRefresh = false;
      }
    }

    if (shouldRefresh) {
      console.log('[Social] Auth request failed, refreshing token...');
      if (await this.refreshAuthToken()) {
        request = this.getRequestWithToken(url, options);
        response = await fetch(request.url, request.options);
      }
    }

    return response;
  }

  async fetchWithCache(
    url: string,
    options: RequestInit = {},
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
    const requestPromise = (async () => {
      let response = await this.fetchWithAuth(url, options);
      let data = await this.parseJsonResponse(response);

      if (
        !response.ok &&
        this.isAuthErrorPayload(data) &&
        (await this.refreshAuthToken())
      ) {
        response = await this.fetchWithAuth(url, options);
        data = await this.parseJsonResponse(response);
      }

      if (!response.ok) {
        await this.handleServiceUnavailable(
          typeof data === 'string' ? data : JSON.stringify(data || {}),
          response.status,
        );
      }

      // Mettre en cache si cacheKey fourni
      if (cacheKey && response.ok) {
        this.setCache(cacheKey, data);
      }

      return data;
    })().finally(() => {
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
      } catch (e) {}
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
    const profileContainer = document.querySelector<HTMLElement>(
      '#social-profile-container',
    );
    if (profileContainer) {
      profileContainer.style.display = 'none';
      profileContainer.classList.remove('guest-discover-only');
    }

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
    const discoverOnly = document.querySelector<HTMLElement>(
      '#social-discover-only',
    );
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

    if (discoverOnly && !discoverOnly.dataset.listenerAttached) {
      discoverOnly.addEventListener('click', (e) => {
        e.preventDefault();
        this.showDiscoverOnly();
      });
      discoverOnly.dataset.listenerAttached = 'true';
    }

    this.setupForgotPasswordModal();

    this.setupRegisterModal();

    this.setupRemoveFriendModal();

    this.setupGameBananaSearchEvents();
  }

  showDiscoverOnly() {
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
    if (!profileContainer) return;

    profileContainer.style.display = 'flex';
    profileContainer.classList.add('guest-discover-only');

    const navItems = document.querySelectorAll<HTMLElement>('.social-nav-item');
    navItems.forEach((item) => {
      item.classList.toggle(
        'active',
        item.getAttribute('data-section') === 'discover',
      );
    });

    const sections = document.querySelectorAll<HTMLElement>('.social-section');
    sections.forEach((section) => {
      const isDiscover = section.id === 'social-section-discover';
      section.classList.toggle('active', isDiscover);
      section.style.opacity = '';
      section.style.transform = '';
      section.style.transition = '';
    });

    this.setupGameBananaSearchEvents();
    this.loadDiscover();
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
      profileContainer.classList.remove('guest-discover-only');

      await this.loadUserProfile();
      this.setupProfileButtons();
      this.setupGameBananaSearchEvents();
      this.setupNavigation();
    }
  }

  setupNavigation() {
    if (this.socialNavigationListenersBound) return;
    this.socialNavigationListenersBound = true;

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
}
