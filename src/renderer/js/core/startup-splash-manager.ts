class StartupSplashManager {
  overlay: HTMLElement | null;
  lottieFrame: HTMLElement | null;
  lottieContainer: HTMLElement | null;
  statusText: HTMLElement | null;
  currentAnimation: any;
  splashEnabled: boolean;
  splashSoundEnabled: boolean;
  startupLaunch: boolean;
  postTutorialIntro: boolean;

  constructor() {
    this.overlay = null;
    this.lottieFrame = null;
    this.lottieContainer = null;
    this.statusText = null;
    this.currentAnimation = null;
    this.splashEnabled = true;
    this.splashSoundEnabled = true;
    this.startupLaunch = false;
    this.postTutorialIntro = false;
  }

  isStartupLaunch() {
    return new URLSearchParams(window.location.search).get('startup') === 'true';
  }

  async initialize() {
    const params = new URLSearchParams(window.location.search);
    this.startupLaunch = params.get('startup') === 'true';
    this.postTutorialIntro = params.get('postTutorialIntro') === 'true';

    if (!this.startupLaunch) {
      document.body.classList.remove('startup-boot-pending');
      return;
    }

    this.createOverlay();

    await this.loadPreferences();

    const bootPromise = this.waitForBoot();

    if (this.splashEnabled) {
      await this.playSplashSequence(bootPromise);
    } else {
      await this.playLoadingOnlySequence(bootPromise);
    }

    await this.finishStartup();
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'startup-splash-overlay';
    this.overlay.style.cssText = [
      'position: fixed',
      'inset: 0',
      'z-index: 99999',
      'background: radial-gradient(circle at top, #242424 0%, #111111 58%, #090909 100%)',
      'opacity: 1',
      'transition: opacity 320ms ease',
      'overflow: hidden',
    ].join(';');

    this.lottieContainer = document.createElement('div');
    this.lottieFrame = document.createElement('div');
    this.lottieFrame.style.cssText = [
      'position: absolute',
      'inset: 0',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'overflow: hidden',
      'pointer-events: none',
    ].join(';');

    this.lottieContainer.style.cssText = 'width: 100vw; height: 100vh;';

    this.lottieFrame.appendChild(this.lottieContainer);
    this.overlay.appendChild(this.lottieFrame);
    document.body.appendChild(this.overlay);
  }

  async loadPreferences() {
    if (!window.electronAPI?.store) {
      return;
    }

    try {
      const splashEnabled = await window.electronAPI.store.get(
        'startupSplashEnabled',
      );
      const splashSoundEnabled = await window.electronAPI.store.get(
        'startupSplashSoundEnabled',
      );

      this.splashEnabled = splashEnabled !== false;
      this.splashSoundEnabled = splashSoundEnabled !== false;
    } catch (error) {
      console.error('[StartupSplash] Failed to load preferences:', error);
    }
  }

  async waitForBoot() {
    if (window.settingsManager?.readyPromise) {
      await window.settingsManager.readyPromise;
    }

    if (window.tabLoader) {
      await window.tabLoader.initializeTabs();
    }

    const bootTasks: Promise<unknown>[] = [];

    if (window.modManager?.fetchMods) {
      bootTasks.push(window.modManager.fetchMods());
    }

    if (window.pluginManager?.fetchPlugins) {
      bootTasks.push(window.pluginManager.fetchPlugins());
    }

    await Promise.allSettled(bootTasks);

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  async playSplashSequence(bootPromise: Promise<void>) {
    this.setStatus('Loading startup splash...');

    let bootCompleted = false;
    const trackedBootPromise = bootPromise.then(() => {
      bootCompleted = true;
    });

    const splashPromise = this.loadAnimation('../images/SplashScreen.json', {
      loop: false,
      autoplay: true,
      displayMode: 'fullscreen',
      preserveAspectRatio: 'xMidYMid slice',
    });

    this.playSplashAudio();

    const splashFinished = splashPromise.then(
      (animation) => this.waitForAnimationEnd(animation, 12000),
    );

    await splashFinished;

    if (!bootCompleted) {
      this.setStatus('Loading mods and interface...');
      await this.loadAnimation('../images/loading.json', {
        loop: true,
        autoplay: true,
        displayMode: 'contained',
        preserveAspectRatio: 'xMidYMid meet',
      });
    }

    await trackedBootPromise;
  }

  async playLoadingOnlySequence(bootPromise: Promise<void>) {
    this.setStatus('Loading mods and interface...');
    await this.loadAnimation('../images/loading.json', {
      loop: true,
      autoplay: true,
      displayMode: 'contained',
      preserveAspectRatio: 'xMidYMid meet',
    });
    await bootPromise;
  }

  async loadAnimation(
    path: string,
    options: {
      loop: boolean;
      autoplay: boolean;
      displayMode: 'fullscreen' | 'contained';
      preserveAspectRatio: string;
    },
  ) {
    if (!this.lottieContainer || !window.lottie) {
      throw new Error('Lottie is not available for startup splash');
    }

    if (this.currentAnimation) {
      this.currentAnimation.destroy();
      this.currentAnimation = null;
    }

    this.applyLayout(options.displayMode);
    this.lottieContainer.innerHTML = '';
    this.currentAnimation = window.lottie.loadAnimation({
      container: this.lottieContainer,
      renderer: 'svg',
      loop: options.loop,
      autoplay: options.autoplay,
      path,
      rendererSettings: {
        preserveAspectRatio: options.preserveAspectRatio,
      },
    });

    await new Promise<void>((resolve) => {
      const animation = this.currentAnimation;
      animation.addEventListener('DOMLoaded', () => resolve());
      animation.addEventListener('data_failed', () => resolve());
    });

    return this.currentAnimation;
  }

  applyLayout(displayMode: 'fullscreen' | 'contained') {
    if (!this.lottieFrame || !this.lottieContainer) {
      return;
    }

    if (displayMode === 'fullscreen') {
      this.lottieFrame.style.justifyContent = 'center';
      this.lottieFrame.style.alignItems = 'center';
      this.lottieContainer.style.width = '100vw';
      this.lottieContainer.style.height = '100vh';
      this.lottieContainer.style.maxWidth = 'none';
      this.lottieContainer.style.maxHeight = 'none';
    } else {
      this.lottieFrame.style.justifyContent = 'center';
      this.lottieFrame.style.alignItems = 'center';
      this.lottieContainer.style.width = 'min(24vw, 220px)';
      this.lottieContainer.style.height = 'min(24vw, 220px)';
      this.lottieContainer.style.minWidth = '120px';
      this.lottieContainer.style.minHeight = '120px';
      this.lottieContainer.style.maxWidth = '220px';
      this.lottieContainer.style.maxHeight = '220px';
    }
  }

  async waitForAnimationEnd(animation: any, fallbackMs: number) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const resolveOnce = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };

      animation.addEventListener('complete', resolveOnce);
      animation.addEventListener('data_failed', resolveOnce);
      setTimeout(resolveOnce, fallbackMs);
    });
  }

  playSplashAudio() {
    if (!this.splashEnabled || !this.splashSoundEnabled) {
      return;
    }

    try {
      const audio = new Audio('../sounds/SplashScreen.mp3');
      audio.volume = 0.8;
      audio.play().catch((error) => {
        console.warn('[StartupSplash] Splash audio blocked:', error);
      });
    } catch (error) {
      console.warn('[StartupSplash] Could not start splash audio:', error);
    }
  }

  setStatus(text: string) {
    if (this.statusText) {
      this.statusText.textContent = text;
    }
  }

  async finishStartup() {
    if (this.splashEnabled && window.animationManager?.prepareIntroAnimation) {
      window.animationManager.prepareIntroAnimation();
    }

    document.body.classList.remove('startup-boot-pending');

    if (this.overlay) {
      this.overlay.style.opacity = '0';
      await new Promise((resolve) => setTimeout(resolve, 320));
      this.overlay.remove();
    }

    if (this.currentAnimation) {
      this.currentAnimation.destroy();
      this.currentAnimation = null;
    }

    this.overlay = null;
    this.lottieFrame = null;
    this.lottieContainer = null;
    this.statusText = null;

    if (this.splashEnabled && window.animationManager?.playIntroAnimation) {
      await window.animationManager.playIntroAnimation(false);
    }
  }
}

if (typeof window !== 'undefined') {
  (window as any).startupSplashManager = new StartupSplashManager();
}

export { StartupSplashManager };
