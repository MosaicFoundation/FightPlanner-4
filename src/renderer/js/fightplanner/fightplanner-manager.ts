class FightPlannerManager {
  initialized: boolean;

  constructor() {
    this.initialized = false;
    console.log('FightPlanner Manager created');
  }

  async initialize() {
    if (this.initialized) return;

    console.log('Initializing FightPlanner tab...');
    await this.loadVersionInfo();
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

  reinitialize() {
    console.log('Reinitializing FightPlanner tab...');
    this.loadVersionInfo();
  }
}

if (typeof window !== 'undefined') {
  window.fightPlannerManager = new FightPlannerManager();
  console.log('FightPlanner Manager initialized globally');
}

export { type FightPlannerManager };
