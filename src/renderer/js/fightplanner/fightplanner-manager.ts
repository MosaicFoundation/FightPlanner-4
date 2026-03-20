class FightPlannerManager {
  initialized: boolean;
  oldTestersExpanded: boolean;
  localeChangedHandler: (() => void) | null;

  constructor() {
    this.initialized = false;
    this.oldTestersExpanded = false;
    this.localeChangedHandler = null;
    console.log('FightPlanner Manager created');
  }

  async initialize() {
    if (this.initialized) return;

    console.log('Initializing FightPlanner tab...');
    await this.loadVersionInfo();
    this.setupOldTestersToggle();
    this.initialized = true;
  }

  async loadVersionInfo() {
    try {
      console.log('Loading version info...');

      if (!window.electronAPI || !window.electronAPI.getAppVersion) {
        console.error('Electron API not available');
        return;
      }

      const versionInfo = await window.electronAPI.getAppVersion();
      console.log('Version info received:', versionInfo);

      const headerVersion = document.querySelector<HTMLElement>(
        '#app-version-display',
      );
      if (headerVersion && versionInfo.version) {
        headerVersion.textContent = versionInfo.version;
        console.log('Header version updated:', versionInfo.version);
      } else {
        console.warn('Header version element not found or no version');
      }

      const appVersionFull =
        document.querySelector<HTMLElement>('#app-version-full');
      if (appVersionFull && versionInfo.version) {
        appVersionFull.textContent = `v${versionInfo.version}`;
      }

      const electronVersion =
        document.querySelector<HTMLElement>('#electron-version');
      if (electronVersion && versionInfo.electronVersion) {
        electronVersion.textContent = `v${versionInfo.electronVersion}`;
      }

      const nodeVersion = document.querySelector<HTMLElement>('#node-version');
      if (nodeVersion && versionInfo.nodeVersion) {
        nodeVersion.textContent = `v${versionInfo.nodeVersion}`;
      }
    } catch (error) {
      console.error('Failed to load version info:', error);
    }
  }

  setupOldTestersToggle() {
    const existingToggleButton =
      document.querySelector<HTMLButtonElement>('#toggle-old-testers');
    const oldTestersSection =
      document.querySelector<HTMLElement>('#old-testers-section');

    if (!existingToggleButton || !oldTestersSection) {
      return;
    }

    if (this.localeChangedHandler) {
      window.removeEventListener('localeChanged', this.localeChangedHandler);
      this.localeChangedHandler = null;
    }

    const toggleButton = existingToggleButton.cloneNode(true) as HTMLButtonElement;
    existingToggleButton.replaceWith(toggleButton);

    toggleButton.addEventListener('click', () => {
      this.oldTestersExpanded = !this.oldTestersExpanded;
      this.refreshOldTestersToggleState();
    });

    this.localeChangedHandler = () => this.refreshOldTestersToggleState();
    window.addEventListener('localeChanged', this.localeChangedHandler);

    this.refreshOldTestersToggleState();
  }

  refreshOldTestersToggleState() {
    const toggleButton =
      document.querySelector<HTMLButtonElement>('#toggle-old-testers');
    const oldTestersSection =
      document.querySelector<HTMLElement>('#old-testers-section');

    if (!toggleButton || !oldTestersSection) {
      return;
    }

    const showLabel = window.i18n?.t(
      'fightplanner.showOldTesters',
    ) || 'See old testers';
    const hideLabel = window.i18n?.t(
      'fightplanner.hideOldTesters',
    ) || 'Hide old testers';

    toggleButton.textContent = this.oldTestersExpanded ? hideLabel : showLabel;
    toggleButton.setAttribute('aria-expanded', String(this.oldTestersExpanded));
    oldTestersSection.classList.toggle('is-collapsed', !this.oldTestersExpanded);
    oldTestersSection.setAttribute(
      'aria-hidden',
      String(!this.oldTestersExpanded),
    );
  }

  reinitialize() {
    console.log('Reinitializing FightPlanner tab...');
    this.loadVersionInfo();
    this.refreshOldTestersToggleState();
  }
}

if (typeof window !== 'undefined') {
  window.fightPlannerManager = new FightPlannerManager();
  console.log('FightPlanner Manager initialized globally');
}

export { type FightPlannerManager };
