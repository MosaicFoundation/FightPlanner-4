class TutorialManager {
  constructor() {
    this.currentStep = 0;
    this.tutorialShown = false;
    this.overlay = null;

    this.steps = [
      {
        title: 'Welcome to FightPlanner! 🎮',
        description:
          'Your all-in-one mod manager for Super Smash Bros Ultimate',
        content: `
<div class="tutorial-welcome">
<div class="tutorial-icon">🚀</div>
<h3>Let's get you started!</h3>
<p>This quick tutorial will help you set up FightPlanner in just a few steps.</p>
<ul class="tutorial-features">
<li><i class="bi bi-check-circle-fill"></i> Manage your mods easily</li>
<li><i class="bi bi-check-circle-fill"></i> Install directly from GameBanana</li>
<li><i class="bi bi-check-circle-fill"></i> Organize by characters</li>
<li><i class="bi bi-check-circle-fill"></i> Handle plugins seamlessly</li>
</ul>
</div>
`,
        icon: 'bi-rocket-takeoff-fill',
      },
      {
        title: 'Configure Your Paths 📂',
        description: 'Point FightPlanner to your mods and plugins folders',
        content: `
<div class="tutorial-step">
<div class="tutorial-visual">
<i class="bi bi-folder2-open tutorial-big-icon"></i>
</div>
<h3>Set up your folders</h3>
<p>Go to <strong>Settings</strong> and configure:</p>
<div class="tutorial-paths">
<div class="tutorial-path-item">
<i class="bi bi-1-circle-fill"></i>
<strong>Mods Path:</strong>
<code>sd:/ultimate/mods</code>
</div>
<div class="tutorial-path-item">
<i class="bi bi-2-circle-fill"></i>
<strong>Plugins Path:</strong>
<code>sd:/ultimate/contents/01006A800016E000/romfs/skyline/plugins</code>
</div>
</div>
<p class="tutorial-note">💡 These paths are on your SD card or emulator folder</p>
</div>
`,
        icon: 'bi-folder2-open',
      },
      {
        title: 'Manage Your Mods 🎨',
        description: 'Enable, disable, and organize your mods',
        content: `
<div class="tutorial-step">
<div class="tutorial-visual">
<i class="bi bi-grid-3x3-gap tutorial-big-icon"></i>
</div>
<h3>Easy mod management</h3>
<div class="tutorial-actions">
<div class="tutorial-action-item">
<i class="bi bi-toggle-on"></i>
<div>
<strong>Toggle mods</strong>
<p>Click the toggle to enable/disable</p>
</div>
</div>
<div class="tutorial-action-item">
<i class="bi bi-search"></i>
<div>
<strong>Search & Filter</strong>
<p>Find mods by name or category</p>
</div>
</div>
<div class="tutorial-action-item">
<i class="bi bi-three-dots"></i>
<div>
<strong>Right-click menu</strong>
<p>Rename, delete, or open folder</p>
</div>
</div>
</div>
</div>
`,
        icon: 'bi-grid-3x3-gap',
      },
      {
        title: 'GameBanana Integration 🌐',
        description: 'Install mods directly from your browser!',
        content: `
<div class="tutorial-step">
<div class="tutorial-visual">
<i class="bi bi-link-45deg tutorial-big-icon"></i>
</div>
<h3>One-click install</h3>
<p>Click on <strong>"Install with FightPlanner"</strong> links on GameBanana:</p>
<div class="tutorial-protocol">
<div class="tutorial-protocol-example">
<code>fightplanner:https://gamebanana.com/mmdl/...</code>
</div>
<div class="tutorial-arrow">↓</div>
<div class="tutorial-protocol-result">
✨ Mod downloads, extracts, and installs automatically!
</div>
</div>
<p class="tutorial-note">💡 Preview and info.toml are downloaded automatically</p>
</div>
`,
        icon: 'bi-download',
      },
      {
        title: "You're All Set! 🎉",
        description: 'Start modding and have fun!',
        content: `
<div class="tutorial-welcome">
<div class="tutorial-icon">✨</div>
<h3>Ready to go!</h3>
<p>You can now start managing your mods like a pro!</p>
<div class="tutorial-tips">
<h4>Quick tips:</h4>
<ul>
<li><strong>Characters tab:</strong> See mods organized by fighter</li>
<li><strong>Downloads tab:</strong> Track your installations</li>
<li><strong>Settings:</strong> Customize animations and preferences</li>
</ul>
</div>
<p class="tutorial-restart">
💡 You can restart this tutorial anytime by typing
<code>window.tutorial.show()</code> in the console (F12)
</p>
</div>
`,
        icon: 'bi-check-circle-fill',
      },
    ];
  }

  async initialize() {
    console.log('Tutorial manager initialized');
  }

  async openTutorialWindow() {
    try {
      if (window.electronAPI && window.electronAPI.openTutorialWindow) {
        await window.electronAPI.openTutorialWindow();
        console.log('✓ Tutorial window opened');
      }
    } catch (error) {
      console.error('Failed to open tutorial window:', error);
    }
  }

  show() {
    this.openTutorialWindow();
  }

  createOverlay() {
    if (this.overlay) {
      this.overlay.remove();
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';
    this.overlay.innerHTML = `
<!-- Blue bubble that expands -->
<div class="tutorial-bubble"></div>

<!-- Dark background (appears when tutorial container shows) -->
<div class="tutorial-dark-bg"></div>

<!-- Welcome screen -->
<div class="tutorial-welcome-screen">
<div class="tutorial-welcome-content">
<h1 class="tutorial-welcome-title">Welcome to FightPlanner 4</h1>
<p class="tutorial-welcome-subtitle">Your ultimate mod manager</p>
</div>
</div>

<!-- Main tutorial container (hidden initially) -->
<div class="tutorial-container" style="display: none;">
<button class="tutorial-close" id="tutorial-close">
<i class="bi bi-x-lg"></i>
</button>
<div class="tutorial-progress">
${this.steps
  .map(
    (_, i) => `
<div class="tutorial-progress-dot ${
      i === 0 ? 'active' : ''
    }" data-step="${i}"></div>
`,
  )
  .join('')}
</div>
<div class="tutorial-content" id="tutorial-content">
<!-- Content will be injected here -->
</div>
<div class="tutorial-navigation">
<button class="tutorial-btn tutorial-btn-secondary" id="tutorial-skip">
Skip Tutorial
</button>
<div class="tutorial-nav-buttons">
<button class="tutorial-btn tutorial-btn-ghost" id="tutorial-prev" style="display: none;">
<i class="bi bi-arrow-left"></i> Previous
</button>
<button class="tutorial-btn tutorial-btn-primary" id="tutorial-next">
Next <i class="bi bi-arrow-right"></i>
</button>
</div>
</div>
</div>
`;

    document.body.appendChild(this.overlay);
    this.attachEventListeners();
  }

  playIntroAnimation() {
    const mainContainer = document.querySelector('.main-container');
    const bubble = this.overlay.querySelector('.tutorial-bubble');
    const welcomeScreen = this.overlay.querySelector(
      '.tutorial-welcome-screen',
    );
    const tutorialContainer = this.overlay.querySelector('.tutorial-container');
    const darkBg = this.overlay.querySelector('.tutorial-dark-bg');

    const noAnimations = document.body.classList.contains('no-animations');

    if (noAnimations) {
      this.overlay.classList.add('show');
      welcomeScreen.style.display = 'none';
      bubble.style.display = 'none';
      darkBg.classList.add('show');
      tutorialContainer.style.display = 'flex';
      tutorialContainer.classList.add('show');
      this.renderStep();
      return;
    }

    setTimeout(() => {
      this.overlay.classList.add('show');
    }, 10);

    setTimeout(() => {
      bubble.classList.add('show');
    }, 200);

    setTimeout(() => {
      bubble.classList.add('expand');
    }, 3200);

    setTimeout(() => {
      if (mainContainer) {
        mainContainer.classList.add('tutorial-slide-up');
      }
    }, 3500);

    setTimeout(() => {
      welcomeScreen.classList.add('show');
    }, 4500);

    setTimeout(() => {
      welcomeScreen.classList.add('fade-out');
      bubble.style.opacity = '0';

      darkBg.classList.add('show');

      setTimeout(() => {
        welcomeScreen.style.display = 'none';
        bubble.style.display = 'none';
        tutorialContainer.style.display = 'flex';

        setTimeout(() => {
          tutorialContainer.classList.add('show');
          this.renderStep();
        }, 50);
      }, 800);
    }, 6500);
  }

  attachEventListeners() {
    const closeBtn = document.getElementById('tutorial-close');
    const skipBtn = document.getElementById('tutorial-skip');
    const prevBtn = document.getElementById('tutorial-prev');
    const nextBtn = document.getElementById('tutorial-next');

    closeBtn.addEventListener('click', () => this.close());
    skipBtn.addEventListener('click', () => this.skip());
    prevBtn.addEventListener('click', () => this.previousStep());
    nextBtn.addEventListener('click', () => this.nextStep());

    document.querySelectorAll('.tutorial-progress-dot').forEach((dot) => {
      dot.addEventListener('click', (e) => {
        const step = parseInt(e.target.dataset.step);
        this.goToStep(step);
      });
    });
  }

  renderStep() {
    const step = this.steps[this.currentStep];
    const content = document.getElementById('tutorial-content');
    const prevBtn = document.getElementById('tutorial-prev');
    const nextBtn = document.getElementById('tutorial-next');

    if (!content) return;

    content.style.opacity = '0';
    content.style.transform = 'translateY(10px)';

    setTimeout(() => {
      content.innerHTML = `
<div class="tutorial-header">
<div class="tutorial-header-icon">
<i class="bi ${step.icon}"></i>
</div>
<div class="tutorial-header-text">
<h2>${step.title}</h2>
<p class="tutorial-description">${step.description}</p>
</div>
</div>
${step.content}
`;

      content.style.opacity = '1';
      content.style.transform = 'translateY(0)';
    }, 200);

    document.querySelectorAll('.tutorial-progress-dot').forEach((dot, i) => {
      if (i === this.currentStep) {
        dot.classList.add('active');
      } else if (i < this.currentStep) {
        dot.classList.add('completed');
        dot.classList.remove('active');
      } else {
        dot.classList.remove('active', 'completed');
      }
    });

    prevBtn.style.display = this.currentStep > 0 ? 'flex' : 'none';

    if (this.currentStep === this.steps.length - 1) {
      nextBtn.innerHTML = 'Get Started! <i class="bi bi-check-lg"></i>';
    } else {
      nextBtn.innerHTML = 'Next <i class="bi bi-arrow-right"></i>';
    }
  }

  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.renderStep();
    } else {
      this.complete();
    }
  }

  previousStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.renderStep();
    }
  }

  goToStep(step) {
    if (step >= 0 && step < this.steps.length) {
      this.currentStep = step;
      this.renderStep();
    }
  }

  async skip() {
    if (
      confirm(
        'Are you sure you want to skip the tutorial? You can always restart it from the console.',
      )
    ) {
      this.complete();
    }
  }

  async complete() {
    if (window.electronAPI && window.electronAPI.store) {
      await window.electronAPI.store.set('tutorialShown', true);
    }
    this.tutorialShown = true;
    this.close();
  }

  close() {
    if (this.overlay) {
      this.overlay.classList.remove('show');

      const mainContainer = document.querySelector('.main-container');
      if (mainContainer) {
        mainContainer.classList.remove('tutorial-slide-up');
      }

      setTimeout(() => {
        if (this.overlay) {
          this.overlay.remove();
          this.overlay = null;
        }
      }, 300);
    }
  }

  async reset() {
    if (window.electronAPI && window.electronAPI.store) {
      await window.electronAPI.store.set('hasLaunchedBefore', false);
    }
    console.log('✓ Tutorial reset!');
    console.log('   The tutorial will open BEFORE the app on next launch.');
    console.log('   Close and reopen the app to see the full animation.');
  }

  async resetToTestFirstLaunch() {
    if (window.electronAPI && window.electronAPI.store) {
      await window.electronAPI.store.set('hasLaunchedBefore', false);
      console.log('✓ First launch flag reset!');
      console.log('   On next launch: Tutorial window only → then main app');
    }
  }

  forceShow() {
    this.show();
    console.log('✓ Tutorial window opened.');
  }
}

if (typeof window !== 'undefined') {
  window.tutorialManager = new TutorialManager();
  window.tutorial = {
    show: () => window.tutorialManager.show(),
    reset: () => window.tutorialManager.reset(),
    resetFirstLaunch: () => window.tutorialManager.resetToTestFirstLaunch(),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.tutorialManager.initialize();
    });
  } else {
    window.tutorialManager.initialize();
  }

  console.log('📚 Tutorial Manager loaded.');
  console.log('   Commands:');
  console.log('   → window.tutorial.show() - Open tutorial now');
  console.log('   → window.tutorial.reset() - Reset for next launch');
  console.log(
    '   → window.tutorial.resetFirstLaunch() - Test first launch behavior',
  );
}
