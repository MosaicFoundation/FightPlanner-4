class AnimationManager {
  isReducedMotion: boolean;
  initialized: boolean;

  constructor() {
    this.isReducedMotion = false;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;

    this.checkReducedMotion();
    this.setupListeners();
    this.checkInitialAnimation();
    this.initialized = true;
    console.log('✨ Animation Manager initialized');
  }

  checkReducedMotion() {
    // Check if user has enabled reduced animations in app settings
    this.isReducedMotion =
      document.body.classList.contains('reduced-animations') ||
      document.body.classList.contains('no-animations');
  }

  checkInitialAnimation() {
    // Check if class was added by inline script (from query param)
    if (document.body.classList.contains('app-entrance-animation')) {
      console.log('🎬 Initial entrance animation detected');
      // Set cleanup timer
      setTimeout(() => {
        document.body.classList.remove('app-entrance-animation');
        console.log('✅ Initial entrance animation sequence completed');
      }, 2500); // 2s animation + buffer
    }
  }

  setupListeners() {
    // Listen for intro animation trigger from main process (manual trigger)
    if (window.electronAPI) {
      window.electronAPI.onStartIntroAnimation(() => {
        this.playIntroAnimation();
      });
    }
  }

  playIntroAnimation() {
    if (this.isReducedMotion) return;

    console.log('🎬 Playing entrance animation sequence (manual trigger)');

    // Force reflow to restart animation
    document.body.classList.remove('app-entrance-animation');
    void document.body.offsetWidth;
    document.body.classList.add('app-entrance-animation');

    setTimeout(() => {
      document.body.classList.remove('app-entrance-animation');
      console.log('✅ Entrance animation sequence completed');
    }, 2500);
  }

  // Helper for GSAP tab switches to keep renderer.js clean
  animateTabSwitch(currentTab, selectedTab, tabName) {
    if (this.isReducedMotion) {
      this.handleReducedMotionTabSwitch(currentTab, selectedTab);
      return;
    }

    // If entrance animation is playing, don't run tab switch animation yet
    if (document.body.classList.contains('app-entrance-animation')) {
      this.handleReducedMotionTabSwitch(currentTab, selectedTab);
      return;
    }

    this.handleFullMotionTabSwitch(currentTab, selectedTab);
  }

  handleReducedMotionTabSwitch(currentTab, selectedTab) {
    // Instant switch logic
    document.querySelectorAll<HTMLElement>('.tab-content').forEach((tab) => {
      tab.classList.remove('active');
      tab.style.cssText = 'display: none;';
    });

    if (selectedTab) {
      selectedTab.classList.add('active');
      selectedTab.style.cssText =
        'display: flex; opacity: 1; transform: none; z-index: auto;';
    }
  }

  handleFullMotionTabSwitch(currentTab, selectedTab) {
    // GSAP animation logic
    document.querySelectorAll<HTMLElement>('.tab-content').forEach((tab) => {
      if (tab !== selectedTab && tab !== currentTab) {
        gsap.set(tab, { display: 'none', zIndex: -1 });
      }
    });

    if (selectedTab) {
      selectedTab.classList.add('active');
      selectedTab.style.display = 'flex';
      gsap.set(selectedTab, {
        x: 50,
        opacity: 0,
        zIndex: 2,
        scale: 0.95,
        boxShadow: '0 0 0 rgba(0,0,0,0)',
      });
    }

    if (currentTab) {
      gsap.set(currentTab, { zIndex: 1 });
    }

    const tl = gsap.timeline();

    if (currentTab) {
      tl.to(
        currentTab,
        {
          x: -50,
          opacity: 0,
          scale: 0.95,
          duration: 0.3,
          ease: 'power3.inOut',
        },
        0,
      );
    }

    if (selectedTab) {
      tl.to(
        selectedTab,
        {
          x: 0,
          opacity: 1,
          scale: 1,
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          duration: 0.4,
          ease: 'power3.out',
        },
        0,
      );

      tl.to(
        selectedTab,
        {
          boxShadow: '0 0 0 rgba(0,0,0,0)',
          duration: 0.2,
          ease: 'power2.inOut',
          onComplete: () => {
            gsap.set(selectedTab, {
              clearProps: 'x,opacity,scale,boxShadow,zIndex',
            });
          },
        },
        '+=0.1',
      );
    }

    if (currentTab) {
      tl.call(
        () => {
          currentTab.classList.remove('active');
          gsap.set(currentTab, {
            display: 'none',
            clearProps: 'x,opacity,scale,boxShadow',
            zIndex: -1,
          });
        },
        undefined,
        0.3,
      );
    }
  }
}

window.animationManager = new AnimationManager();

export { type AnimationManager };
