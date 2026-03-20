interface NoneUpdate {
  type: 'none';
}

interface SuccessUpdate {
  type: 'success';
  fileName: string;
}

interface ConflictUpdate {
  type: 'conflict';
  conflictCount: number;
  modsWithConflictsCount: number;
}

interface DownloadItem {
  id: string;
  fileName: string;
  modName?: string;
  statusText?: string;
  progress: number;
  speedText?: string;
}

interface DownloadUpdate {
  type: 'download';
  downloads: DownloadItem[];
}

type StatusTab =
  | 'social'
  | 'downloads'
  | 'tools'
  | 'plugins'
  | 'settings'
  | 'characters'
  | 'stages'
  | 'fightplanner';

interface StatusSnapshot {
  content: string;
  useInnerHTML?: boolean;
  downloading?: boolean;
}

export class StatusBarManager {
  updateInterval: ReturnType<typeof setTimeout> | null;
  currentTab: StatusTab | null;
  preservedStatus: string | null;
  animationTimeout: ReturnType<typeof setTimeout> | null;
  hasActiveDownloads: boolean = false;
  private animationCounter: number = 0;
  userDismissedExtendedBar: boolean = false;
  lastExtendedBarData: string | null = null;
  pendingDynamicIsland: boolean = false;
  private lastHandledSuccessId: string | null = null;
  private statusCycleId: number = 0;
  private renderedStatusSignature: string | null = null;
  private temporaryStatus: StatusSnapshot | null = null;
  private temporaryStatusTimeout: ReturnType<typeof setTimeout> | null = null;
  private islandPulseTimeout: ReturnType<typeof setTimeout> | null = null;
  private islandSettleTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.updateInterval = null;
    this.currentTab = null;
    this.preservedStatus = null;
    this.animationTimeout = null;
    this.userDismissedExtendedBar = false;
    this.lastExtendedBarData = null;
    this.claimManagedStatusNode();

    // Start global monitoring for downloads
    setInterval(() => {
      // Always check
      this.checkActiveDownloads();
    }, 500);
  }

  t(key, params = {}) {
    if (window.i18n && window.i18n.t) {
      return window.i18n.t(key, params);
    }
    return key;
  }

  private claimManagedStatusNode() {
    const statusText = this.getStatusTextElement();
    if (!statusText) {
      return;
    }

    if (statusText.dataset.statusBarManaged !== 'true') {
      statusText.dataset.statusBarManaged = 'true';
      statusText.removeAttribute('data-i18n');
    }
  }

  private getStatusTextElement() {
    const statusText =
      document.querySelector<HTMLElement>('#main-status-bar .bottom-text-left') ||
      document.querySelector<HTMLElement>('.bottom-text-left') ||
      document.querySelector<HTMLElement>('.bottom-text');

    if (statusText && statusText.dataset.statusBarManaged !== 'true') {
      statusText.dataset.statusBarManaged = 'true';
      statusText.removeAttribute('data-i18n');
    }

    return statusText;
  }

  private clearUpdateLoop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private clearIslandAnimationTimers() {
    if (this.islandPulseTimeout) {
      clearTimeout(this.islandPulseTimeout);
      this.islandPulseTimeout = null;
    }

    if (this.islandSettleTimeout) {
      clearTimeout(this.islandSettleTimeout);
      this.islandSettleTimeout = null;
    }
  }

  private getIslandMode(bottomBar: HTMLElement) {
    if (bottomBar.classList.contains('success-mode')) {
      return 'success';
    }

    if (bottomBar.classList.contains('conflict-mode')) {
      return 'conflict';
    }

    if (bottomBar.classList.contains('download-mode')) {
      return 'download';
    }

    return 'idle';
  }

  private triggerIslandPulse(
    bottomBar: HTMLElement,
    mode: 'download' | 'success' | 'conflict',
  ) {
    if (document.body.classList.contains('no-animations')) {
      return;
    }

    this.clearIslandAnimationTimers();

    bottomBar.classList.remove('island-pulse', 'island-settle', 'island-collapse');
    bottomBar.dataset.islandMode = mode;

    // Force reflow so repeated pulses retrigger cleanly.
    bottomBar.offsetHeight;
    bottomBar.classList.add('island-pulse');

    const reducedAnimations =
      document.body.classList.contains('reduced-animations');
    const pulseDuration = reducedAnimations ? 220 : 720;
    const settleDuration = reducedAnimations ? 140 : 420;

    this.islandPulseTimeout = setTimeout(() => {
      bottomBar.classList.remove('island-pulse');
      bottomBar.classList.add('island-settle');

      this.islandSettleTimeout = setTimeout(() => {
        bottomBar.classList.remove('island-settle');
      }, settleDuration);
    }, pulseDuration);
  }

  private triggerIslandCollapse(bottomBar: HTMLElement) {
    if (document.body.classList.contains('no-animations')) {
      bottomBar.classList.remove('island-pulse', 'island-settle', 'island-collapse');
      return;
    }

    this.clearIslandAnimationTimers();
    bottomBar.classList.remove('island-pulse', 'island-settle');
    bottomBar.classList.add('island-collapse');

    const reducedAnimations =
      document.body.classList.contains('reduced-animations');
    const collapseDuration = reducedAnimations ? 180 : 420;

    this.islandPulseTimeout = setTimeout(() => {
      bottomBar.classList.remove('island-collapse');
    }, collapseDuration);
  }

  private beginStatusCycle() {
    this.clearUpdateLoop();
    this.statusCycleId += 1;
    return this.statusCycleId;
  }

  private isStatusCycleCurrent(cycleId: number) {
    return cycleId === this.statusCycleId;
  }

  private hasTemporaryStatus() {
    return this.temporaryStatus !== null;
  }

  private isActiveDownloadState(download: any) {
    return (
      download?.status === 'downloading' || download?.status === 'extracting'
    );
  }

  private hasDownloadsInProgress() {
    if (!window.downloadManager) {
      return false;
    }

    if (window.downloadManager.ftpTransfer) {
      return true;
    }

    const activeDownloadsMap = (window.downloadManager as any).activeDownloads;
    if (!activeDownloadsMap) {
      return false;
    }

    return Array.from(activeDownloadsMap.values()).some((download: any) =>
      this.isActiveDownloadState(download),
    );
  }

  private normalizeTab(tabName: string | null | undefined): StatusTab | null {
    const validTabs: StatusTab[] = [
      'social',
      'downloads',
      'tools',
      'plugins',
      'settings',
      'characters',
      'echo',
      'stages',
      'fightplanner',
    ];

    if (!tabName) {
      return null;
    }

    return validTabs.includes(tabName as StatusTab)
      ? (tabName as StatusTab)
      : null;
  }

  private syncCurrentTabFromSidebar() {
    const activeButton = document.querySelector<HTMLElement>('.sidebar-btn.active');
    const tabId = activeButton?.getAttribute('data-tab');
    const normalizedTab = this.normalizeTab(tabId);
    if (normalizedTab) {
      this.currentTab = normalizedTab;
    }
  }

  private isCustomStatusPayload(tabName: string) {
    return (
      tabName.startsWith('statusBar.') ||
      tabName.includes('...') ||
      tabName.includes('\u2026')
    );
  }

  private resolveCustomStatusPayload(tabName: string): StatusSnapshot {
    return {
      content: tabName.startsWith('statusBar.') ? this.t(tabName) : tabName,
    };
  }

  private buildStatusSignature(snapshot: StatusSnapshot) {
    return [
      snapshot.useInnerHTML ? 'html' : 'text',
      snapshot.downloading ? 'downloading' : 'idle',
      snapshot.content,
    ].join('|');
  }

  private renderStatus(
    snapshot: StatusSnapshot,
    options: { force?: boolean } = {},
  ) {
    if ((this.preservedStatus || this.hasTemporaryStatus()) && !options.force) {
      return false;
    }

    const statusText = this.getStatusTextElement();
    if (!statusText) {
      return false;
    }

    const signature = this.buildStatusSignature(snapshot);
    statusText.classList.toggle(
      'status-downloading',
      snapshot.downloading === true,
    );

    if (this.renderedStatusSignature === signature) {
      return true;
    }

    if (snapshot.useInnerHTML) {
      statusText.innerHTML = snapshot.content;
    } else {
      statusText.textContent = snapshot.content;
    }

    this.renderedStatusSignature = signature;
    return true;
  }

  private applySnapshot(
    snapshot: StatusSnapshot,
    options: { animate?: boolean; force?: boolean; cycleId?: number } = {},
  ) {
    const statusText = this.getStatusTextElement();
    if (!statusText) {
      return;
    }

    const signature = this.buildStatusSignature(snapshot);
    if (this.renderedStatusSignature === signature && !options.force) {
      this.renderStatus(snapshot, options);
      return;
    }

    const render = () => {
      if (
        options.cycleId !== undefined &&
        !this.isStatusCycleCurrent(options.cycleId)
      ) {
        return;
      }

      this.renderStatus(snapshot, options);
    };

    if (options.animate) {
      this.animateStatusChange(statusText, render);
      return;
    }

    render();
  }

  private getPluralSuffix(count: number) {
    return count !== 1 ? 's' : '';
  }

  private getToolsSnapshot(): StatusSnapshot {
    try {
      if (window.modManager?.mods) {
        const mods = window.modManager.mods;
        const enabledMods = mods.filter((mod) => mod.status === 'active').length;

        return {
          content: this.t('statusBar.modsEnabled', {
            enabled: enabledMods,
            total: mods.length,
            plural: this.getPluralSuffix(mods.length),
          }),
        };
      }
    } catch (error) {
      // Fall through to the ready state below.
    }

    return { content: this.t('statusBar.modsReady') };
  }

  private getPluginsSnapshot(): StatusSnapshot {
    try {
      if (window.pluginManager) {
        const plugins = window.pluginManager.plugins || [];
        const enabledPlugins = plugins.filter((plugin) => plugin.enabled !== false)
          .length;

        return {
          content: this.t('statusBar.pluginsEnabled', {
            enabled: enabledPlugins,
            total: plugins.length,
            plural: this.getPluralSuffix(plugins.length),
          }),
        };
      }
    } catch (error) {
      // Fall through to the ready state below.
    }

    return { content: this.t('statusBar.pluginsReady') };
  }

  private getCharactersSnapshot(): StatusSnapshot {
    try {
      if (window.charactersManager?.characters) {
        const count = window.charactersManager.characters.size;
        return {
          content: this.t('statusBar.charactersAvailable', {
            count,
            plural: this.getPluralSuffix(count),
          }),
        };
      }
    } catch (error) {
      // Fall through to the ready state below.
    }

    return { content: this.t('statusBar.charactersReady') };
  }

  private getSettingsSnapshot(): StatusSnapshot {
    return { content: this.t('statusBar.settings') };
  }

  private getStagesSnapshot(): StatusSnapshot {
    return { content: this.t('statusBar.stages') };
  }

  private getDownloadsIdleSnapshot(): StatusSnapshot {
    if (!window.downloadManager || !(window.downloadManager as any).activeDownloads) {
      return { content: this.t('statusBar.downloadsReady') };
    }

    const completedCount = window.downloadManager.completedDownloads
      ? window.downloadManager.completedDownloads.length
      : 0;

    if (completedCount > 0) {
      return {
        content: this.t('statusBar.downloadsCompleted', {
          count: completedCount,
          plural: this.getPluralSuffix(completedCount),
        }),
      };
    }

    return { content: this.t('statusBar.downloadsNoActive') };
  }

  private getSocialBaseSnapshot(): StatusSnapshot {
    try {
      if (
        window.socialManager &&
        window.socialManager.authToken &&
        window.socialManager.userData
      ) {
        return { content: this.t('statusBar.socialConnected') };
      }

      return { content: this.t('statusBar.socialNotConnected') };
    } catch (error) {
      return { content: this.t('statusBar.socialReady') };
    }
  }

  private getSnapshotForTab(tab: StatusTab): StatusSnapshot {
    switch (tab) {
      case 'social':
        return this.getSocialBaseSnapshot();
      case 'downloads':
        return this.getDownloadsIdleSnapshot();
      case 'tools':
        return this.getToolsSnapshot();
      case 'plugins':
        return this.getPluginsSnapshot();
      case 'settings':
        return this.getSettingsSnapshot();
      case 'characters':
        return this.getCharactersSnapshot();
      case 'stages':
        return this.getStagesSnapshot();
      case 'fightplanner':
      default:
        return { content: this.t('statusBar.ready') };
    }
  }

  private collapseTransientExtendedBar() {
    const bottomBar = document.getElementById('main-status-bar');
    if (
      bottomBar &&
      bottomBar.classList.contains('expanded') &&
      !bottomBar.classList.contains('conflict-mode') &&
      !bottomBar.classList.contains('success-mode')
    ) {
      this.updateExtendedBar({ type: 'none' });
    }
  }

  private canRefreshTab(cycleId: number, tab: StatusTab) {
    return (
      this.isStatusCycleCurrent(cycleId) &&
      this.currentTab === tab &&
      !this.preservedStatus &&
      !this.hasModalOpen() &&
      !this.hasTemporaryStatus() &&
      !this.hasDownloadsInProgress()
    );
  }

  private startStaticTabPolling(
    tab: 'tools' | 'plugins' | 'characters',
    cycleId: number,
  ) {
    this.updateInterval = setInterval(() => {
      if (!this.canRefreshTab(cycleId, tab)) {
        this.clearUpdateLoop();
        return;
      }

      this.applySnapshot(this.getSnapshotForTab(tab), { cycleId });
    }, 10000);
  }

  private renderCurrentTab(cycleId: number, animate: boolean) {
    if (!this.currentTab) {
      return;
    }

    this.applySnapshot(this.getSnapshotForTab(this.currentTab), {
      animate,
      cycleId,
    });

    switch (this.currentTab) {
      case 'social':
        void this.refreshSocialTabStatus(cycleId);
        this.updateInterval = setInterval(() => {
          void this.refreshSocialTabStatus(cycleId);
        }, 3 * 60 * 1000);
        break;
      case 'tools':
        this.startStaticTabPolling('tools', cycleId);
        break;
      case 'plugins':
        this.startStaticTabPolling('plugins', cycleId);
        break;
      case 'characters':
        this.startStaticTabPolling('characters', cycleId);
        break;
      case 'downloads':
      case 'settings':
      case 'stages':
      case 'fightplanner':
      default:
        break;
    }
  }

  updateStatus(tabName) {
    const statusText = this.getStatusTextElement();
    if (!statusText) {
      return;
    }

    const normalizedTab = this.normalizeTab(tabName);
    if (normalizedTab) {
      this.currentTab = normalizedTab;
    } else if (!this.currentTab) {
      this.syncCurrentTabFromSidebar();
    }

    if (typeof tabName === 'string' && this.isCustomStatusPayload(tabName)) {
      const cycleId = this.beginStatusCycle();
      this.applySnapshot(this.resolveCustomStatusPayload(tabName), {
        animate: !this.preservedStatus,
        cycleId,
      });
      return;
    }

    if (!this.currentTab) {
      return;
    }

    const modalOpen = this.hasModalOpen();
    const hasActiveDownloads = this.checkActiveDownloads();

    if (modalOpen && !hasActiveDownloads) {
      this.preserveCurrentStatus();
      return;
    }

    if (this.preservedStatus && !modalOpen && !hasActiveDownloads) {
      this.preservedStatus = null;
    }

    if (this.hasTemporaryStatus()) {
      this.renderStatus(this.temporaryStatus!, { force: true });
      return;
    }

    const cycleId = this.beginStatusCycle();

    if (hasActiveDownloads) {
      this.preservedStatus = null;
      this.startDownloadsStatusLoop(cycleId);
      return;
    } else {
      this.collapseTransientExtendedBar();
      this.renderCurrentTab(cycleId, true);
    }
  }

  animateStatusChange(statusText, callback) {
    if (
      this.preservedStatus ||
      (this.hasModalOpen() && !this.checkActiveDownloads())
    ) {
      return;
    }

    const isReducedAnimations =
      document.body.classList.contains('reduced-animations');
    const isNoAnimations = document.body.classList.contains('no-animations');
    const bottomBar = document.getElementById('main-status-bar');

    if (isNoAnimations) {
      callback();
      return;
    }

    if (this.animationTimeout) {
      clearTimeout(this.animationTimeout);
      this.animationTimeout = null;
    }

    this.animationCounter++;
    const myCounter = this.animationCounter;

    statusText.classList.add('status-changing');
    if (bottomBar && !bottomBar.classList.contains('expanded')) {
      bottomBar.classList.remove('collapsed-status-swap');
      bottomBar.offsetHeight;
      bottomBar.classList.add('collapsed-status-swap');
    }

    if (isReducedAnimations) {
      statusText.style.transition =
        'opacity 0.12s ease, transform 0.12s ease, filter 0.12s ease';
      statusText.style.opacity = '0';
      statusText.style.transform = 'translateX(-6px) scale(0.992)';
      statusText.style.filter = 'blur(3px)';

      this.animationTimeout = setTimeout(() => {
        if (myCounter !== this.animationCounter) return;
        this.animationTimeout = null;
        callback();

        statusText.style.transition = 'none';
        statusText.style.opacity = '0';
        statusText.style.transform = 'translateX(8px) scale(1.006)';
        statusText.style.filter = 'blur(3px)';

        requestAnimationFrame(() => {
          if (myCounter !== this.animationCounter) return;
          statusText.style.transition =
            'opacity 0.14s ease, transform 0.14s ease, filter 0.14s ease';
          statusText.style.opacity = '1';
          statusText.style.transform = 'translateX(0) scale(1)';
          statusText.style.filter = 'blur(0)';

          setTimeout(() => {
            if (myCounter !== this.animationCounter) return;
            statusText.style.transition = '';
            statusText.style.opacity = '';
            statusText.style.transform = '';
            statusText.style.filter = '';
            statusText.classList.remove('status-changing');
            if (bottomBar && !bottomBar.classList.contains('expanded')) {
              bottomBar.classList.remove('collapsed-status-swap');
            }
          }, 140);
        });
      }, 120);
    } else {
      statusText.style.transition =
        'opacity 0.18s ease, transform 0.18s ease, filter 0.18s ease';
      statusText.style.opacity = '0';
      statusText.style.transform = 'translateX(-10px) scale(0.986)';
      statusText.style.filter = 'blur(4px)';

      this.animationTimeout = setTimeout(() => {
        if (myCounter !== this.animationCounter) return;
        this.animationTimeout = null;
        callback();

        statusText.style.transition = 'none';
        statusText.style.opacity = '0';
        statusText.style.transform = 'translateX(12px) scale(1.01)';
        statusText.style.filter = 'blur(4px)';

        requestAnimationFrame(() => {
          if (myCounter !== this.animationCounter) return;
          statusText.style.transition =
            'opacity 0.24s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), filter 0.24s ease';
          statusText.style.opacity = '1';
          statusText.style.transform = 'translateX(0) scale(1)';
          statusText.style.filter = 'blur(0)';

          setTimeout(() => {
            if (myCounter !== this.animationCounter) return;
            statusText.style.transition = '';
            statusText.style.opacity = '';
            statusText.style.transform = '';
            statusText.style.filter = '';
            statusText.classList.remove('status-changing');
            if (bottomBar && !bottomBar.classList.contains('expanded')) {
              bottomBar.classList.remove('collapsed-status-swap');
            }
          }, 240);
        });
      }, 180);
    }
  }

  hasModalOpen() {
    const overlay = document.querySelector<HTMLElement>('#modal-overlay');
    if (overlay && overlay.style.display === 'block') {
      return true;
    }

    const allModals = document.querySelectorAll<HTMLElement>(
      '.modal, .character-modal-overlay',
    );
    for (const modal of allModals) {
      if (modal.style.display === 'block' || modal.style.display === 'flex') {
        return true;
      }
    }
    return false;
  }

  preserveCurrentStatus() {
    const statusText = this.getStatusTextElement();
    if (statusText) {
      const currentStatus = statusText.textContent || statusText.innerHTML;
      if (
        currentStatus &&
        currentStatus.trim() &&
        currentStatus !== this.t('statusBar.ready') &&
        currentStatus !== 'Ready' &&
        currentStatus !== 'Prêt'
      ) {
        this.preservedStatus = currentStatus;
      }
    }
  }

  restorePreservedStatus() {
    if (
      this.preservedStatus &&
      !this.hasDownloadsInProgress() &&
      !this.hasModalOpen()
    ) {
      const statusText = this.getStatusTextElement();
      if (statusText) {
        this.renderStatus(
          {
            content: this.preservedStatus,
          },
          { force: true },
        );
        this.preservedStatus = null;
        if (this.currentTab) {
          setTimeout(() => {
            if (!this.hasModalOpen() && !this.hasDownloadsInProgress()) {
              this.updateStatus(this.currentTab);
            }
          }, 100);
        }
      } else {
        this.preservedStatus = null;
      }
    }
  }

  setStatusText(content, useInnerHTML = false) {
    return this.renderStatus({ content, useInnerHTML });
  }

  showTemporaryStatus(
    content,
    options: { useInnerHTML?: boolean; autoRestoreMs?: number } = {},
  ) {
    if (this.temporaryStatusTimeout) {
      clearTimeout(this.temporaryStatusTimeout);
      this.temporaryStatusTimeout = null;
    }

    this.beginStatusCycle();
    this.temporaryStatus = {
      content,
      useInnerHTML: options.useInnerHTML === true,
    };
    this.renderStatus(this.temporaryStatus, { force: true });

    if (options.autoRestoreMs && options.autoRestoreMs > 0) {
      this.temporaryStatusTimeout = setTimeout(() => {
        this.clearTemporaryStatus();
      }, options.autoRestoreMs);
    }
  }

  clearTemporaryStatus() {
    if (this.temporaryStatusTimeout) {
      clearTimeout(this.temporaryStatusTimeout);
      this.temporaryStatusTimeout = null;
    }

    if (!this.temporaryStatus) {
      return;
    }

    this.temporaryStatus = null;
    this.refreshStandardStatus();
  }

  private async refreshSocialTabStatus(cycleId: number) {
    if (!this.canRefreshTab(cycleId, 'social')) {
      return;
    }

    try {
      if (
        window.socialManager &&
        window.socialManager.authToken &&
        window.socialManager.userData
      ) {
        const userId = window.socialManager.userData.localId;

        try {
          const modsData = await window.socialManager.fetchWithCache(
            `${window.socialManager.API_URL}/list/links?idToken=${window.socialManager.authToken}`,
            {},
            'links',
          );

          if (!this.canRefreshTab(cycleId, 'social')) {
            return;
          }

          const mods = Array.isArray(modsData)
            ? modsData
            : modsData.documents || [];

          if (Array.isArray(mods)) {
            const usernameEl = document.querySelector<HTMLElement>(
              '#social-profile-username',
            );
            const username = usernameEl ? usernameEl.textContent : null;
            const myMods = mods.filter((mod) => {
              const modUserId = mod.userId;
              const modPseudo = mod.pseudo;
              return modUserId === userId || (username && modPseudo === username);
            });

            const friendsData = await window.socialManager.fetchWithCache(
              `${window.socialManager.API_URL}/links-friends`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  idToken: window.socialManager.authToken,
                }),
              },
              'friends',
            );

            if (!this.canRefreshTab(cycleId, 'social')) {
              return;
            }

            let friendsCount = 0;
            if (friendsData.friends && Array.isArray(friendsData.friends)) {
              friendsCount = friendsData.friends.filter(
                (friend) => friend.status === 'accepted',
              ).length;
            }

            this.applySnapshot(
              {
                content: this.t('statusBar.socialModsShared', {
                  count: myMods.length,
                  plural: this.getPluralSuffix(myMods.length),
                  friends: friendsCount,
                  friendsPlural: this.getPluralSuffix(friendsCount),
                }),
              },
              { cycleId },
            );
            return;
          }
        } catch (error) {
          // Fall back to the base connected status below.
        }

        this.applySnapshot(
          {
            content: this.t('statusBar.socialConnected'),
          },
          { cycleId },
        );
        return;
      }

      this.applySnapshot(
        {
          content: this.t('statusBar.socialNotConnected'),
        },
        { cycleId },
      );
    } catch (error) {
      this.applySnapshot(
        {
          content: this.t('statusBar.socialReady'),
        },
        { cycleId },
      );
    }
  }

  private startDownloadsStatusLoop(cycleId: number) {
    let animationFrame = 0;
    let lastUpdateTime = Date.now();
    const lastReceivedBytes = new Map();

    const renderDownloadStatus = () => {
      if (!this.isStatusCycleCurrent(cycleId)) {
        this.clearUpdateLoop();
        return;
      }

      if (this.hasTemporaryStatus()) {
        this.renderStatus(this.temporaryStatus!, { force: true });
        this.clearUpdateLoop();
        return;
      }

      if (this.preservedStatus && !this.hasDownloadsInProgress()) {
        return;
      }

      if (this.hasModalOpen() && !this.hasDownloadsInProgress()) {
        return;
      }

      try {
        if (window.downloadManager?.ftpTransfer) {
          const ftp = window.downloadManager.ftpTransfer;
          const dots = '.'.repeat(animationFrame % 4);
          animationFrame += 1;

          let statusContent;
          if (ftp.totalMods > 0) {
            statusContent = this.t('statusBar.ftpSending', {
              current: ftp.currentMod || 0,
              total: ftp.totalMods || 0,
            });
          } else {
            statusContent = this.t('statusBar.ftpSending', {
              current: '',
              total: '',
            }).replace(' â€¢ / mods', '');
          }

          this.renderStatus(
            {
              content: `${statusContent}${dots}`,
              downloading: true,
            },
            { force: true },
          );
          return;
        }

        const activeDownloads = Array.from(
          window.downloadManager?.activeDownloads?.values() || [],
        ).filter((download: any) => this.isActiveDownloadState(download));

        if (activeDownloads.length === 0) {
          const statusText = this.getStatusTextElement();
          if (statusText) {
            statusText.classList.remove('status-downloading');
          }

          this.clearUpdateLoop();

          if (this.currentTab === 'downloads') {
            this.applySnapshot(this.getDownloadsIdleSnapshot(), { cycleId });
          } else {
            this.refreshStandardStatus();
          }

          return;
        }

        const firstDownload: any = activeDownloads[0];
        const currentTime = Date.now();
        const timeDelta = (currentTime - lastUpdateTime) / 1000;

        let speedText = '';
        let progressText = '';

        if (
          firstDownload.receivedBytes !== undefined &&
          firstDownload.totalBytes !== undefined &&
          firstDownload.totalBytes > 0
        ) {
          const progress = Math.round(
            (firstDownload.receivedBytes / firstDownload.totalBytes) * 100,
          );
          progressText = `${progress}%`;

          const downloadId = firstDownload.id;
          const lastBytes = lastReceivedBytes.get(downloadId) || 0;
          const bytesDelta = firstDownload.receivedBytes - lastBytes;

          if (timeDelta > 0 && bytesDelta > 0) {
            const speedBytes = bytesDelta / timeDelta;
            speedText = this.formatSpeed(speedBytes);
          }

          lastReceivedBytes.set(downloadId, firstDownload.receivedBytes);
        } else if (firstDownload.progress !== undefined) {
          progressText = `${Math.round(firstDownload.progress)}%`;
        }

        let sizeInfo = '';
        if (
          firstDownload.totalBytes !== undefined &&
          firstDownload.totalBytes > 0
        ) {
          const received = firstDownload.receivedBytes || 0;
          sizeInfo = `${this.formatBytes(received)} / ${this.formatBytes(
            firstDownload.totalBytes,
          )}`;
        }

        const fileName =
          firstDownload.modName ||
          firstDownload.fileName ||
          firstDownload.url?.split('/').pop() ||
          'Downloading...';
        const shortFileName =
          fileName.length > 30 ? `${fileName.substring(0, 27)}...` : fileName;

        const dots = '.'.repeat(animationFrame % 4);
        const activeIndicator =
          activeDownloads.length > 1 ? ` [${activeDownloads.length} active]` : '';

        const progressPart = progressText ? ` â€¢ ${progressText}` : '';
        const sizePart = sizeInfo ? ` â€¢ ${sizeInfo}` : '';
        const speedPart = speedText ? ` â€¢ ${speedText}` : '';

        this.renderStatus(
          {
            content:
              this.t('statusBar.downloadsDownloading', {
                fileName: shortFileName,
                progress: progressPart,
                size: sizePart,
                speed: speedPart,
              }) + dots + activeIndicator,
            downloading: true,
          },
          { force: true },
        );

        lastUpdateTime = currentTime;
        animationFrame += 1;
      } catch (error) {
        const statusText = this.getStatusTextElement();
        if (statusText) {
          statusText.classList.remove('status-downloading');
        }

        this.clearUpdateLoop();

        if (this.currentTab === 'downloads') {
          this.applySnapshot(this.getDownloadsIdleSnapshot(), { cycleId });
        } else {
          this.refreshStandardStatus();
        }
      }
    };

    renderDownloadStatus();

    this.updateInterval = setInterval(() => {
      renderDownloadStatus();
    }, 500);
  }

  _getDownloadDisplayName(dl: DownloadItem): string {
    if (dl.modName) return dl.modName;
    if (dl.statusText && !dl.statusText.toLowerCase().includes('downloading')) return dl.statusText;
    const name = dl.fileName || '';
    if (/^\d+$/.test(name) || name === 'mod.zip') return 'Downloading...';
    return name;
  }

  updateExtendedBar(
    update: NoneUpdate | SuccessUpdate | ConflictUpdate | DownloadUpdate,
  ) {
    if (typeof update === 'string' && update === 'none') {
      update = { type: 'none' } as NoneUpdate;
    }

    const bottomBar = document.getElementById('main-status-bar');
    if (!bottomBar) return;

    const content = bottomBar.querySelector('.extended-content');
    const enabled =
      window.settingsManager?.settings.enhancedStatusBar !== false;
    const wasExpanded = bottomBar.classList.contains('expanded');
    const previousMode = this.getIslandMode(bottomBar);

    if (update.type === 'none' || !enabled || !content) {
      if (update.type === 'none') {
        this.userDismissedExtendedBar = true;
      }

      if (content) (content as HTMLElement).style.display = 'none';

      if (bottomBar.classList.contains('expanded')) {
        this.triggerIslandCollapse(bottomBar);
        bottomBar.classList.remove('expanded');
        setTimeout(() => {
          if (!bottomBar.classList.contains('expanded')) {
            bottomBar.classList.remove('download-mode', 'conflict-mode', 'success-mode');
            bottomBar.dataset.islandMode = 'idle';
          }
        }, 300);
      }
      return;
    }    if (update.type === 'download') {
      if (!bottomBar.classList.contains('download-mode')) {
        bottomBar.classList.remove('conflict-mode', 'success-mode');
        bottomBar.classList.add('download-mode');
      }

      if (this.pendingDynamicIsland) {
        return;
      }

      if (!bottomBar.classList.contains('expanded')) {
        bottomBar.classList.add('expanded');
      }

      if (!wasExpanded || previousMode !== 'download') {
        this.triggerIslandPulse(bottomBar, 'download');
      }

      (content as HTMLElement).style.display = 'flex';

      const downloads = update.downloads || [];
      const isSingle = downloads.length === 1;

      if (isSingle) {
        const dl = downloads[0];
        const progress = Math.round(dl.progress || 0);
        let speed = dl.speedText || '';
        const displayName = this._getDownloadDisplayName(dl);

        let phaseText = 'Downloading';
        let iconClass = 'bi-cloud-arrow-down-fill';
        let isExtractingOrVerifying = false;

        if (dl.statusText) {
          const lowerStatus = dl.statusText.toLowerCase();
          if (lowerStatus.includes('extract')) {
            phaseText = 'Extracting...';
            iconClass = 'bi-file-zip-fill';
            isExtractingOrVerifying = true;
          } else if (lowerStatus.includes('verif')) {
            phaseText = 'Verifying...';
            iconClass = 'bi-shield-check';
            isExtractingOrVerifying = true;
          }
        }

        if (isExtractingOrVerifying) {
          speed = '';
        }

        const isActiveDownloadCard = content.querySelector('.ext-download-card .ext-progress-container');
        const isMultiCard = content.querySelector('.ext-multi-download-card');
        if (isActiveDownloadCard && !isMultiCard) {
            const fileNameEl = content.querySelector('.ext-filename');
            const progressFillEl = content.querySelector('.ext-progress-fill') as HTMLElement;
            const percentageEl = content.querySelector('.ext-percentage');
            const speedEl = content.querySelector('.ext-speed');
            const badgeEl = content.querySelector('.ext-status-badge');
            const iconEl = content.querySelector('.ext-card-icon i');
            const separatorEl = content.querySelector('.ext-separator') as HTMLElement;
            
            if (fileNameEl) {
                fileNameEl.textContent = displayName;
                fileNameEl.setAttribute('title', displayName);
            }
            if (progressFillEl) progressFillEl.style.width = `${progress}%`;
            
            if (badgeEl) badgeEl.textContent = phaseText;
            if (iconEl && iconEl.className !== `bi ${iconClass}`) {
                iconEl.className = `bi ${iconClass}`;
            }

            if (isExtractingOrVerifying) {
              if (percentageEl) percentageEl.textContent = phaseText;
              if (speedEl) speedEl.textContent = '';
              if (separatorEl) separatorEl.style.display = 'none';
            } else {
              if (percentageEl) percentageEl.textContent = `${progress}%`;
              if (speedEl) speedEl.textContent = speed;
              if (separatorEl) separatorEl.style.display = 'inline';
            }
        } else {
            content.innerHTML = `
              <div class="ext-download-card">
                  <button class="ext-close-btn" onclick="window.statusBarManager.updateExtendedBar('none')" title="Close">
                      <i class="bi bi-chevron-down"></i>
                  </button>
                  <div class="ext-card-icon-container">
                      <div class="ext-card-icon">
                          <i class="bi ${iconClass}"></i>
                      </div>
                  </div>
                  <div class="ext-card-details">
                      <div class="ext-card-header">
                          <span class="ext-status-badge">${phaseText}</span>
                          <span class="ext-filename" title="${displayName}">${displayName}</span>
                      </div>
                      
                      <div class="ext-progress-container">
                          <div class="ext-progress-track">
                              <div class="ext-progress-fill" style="width: ${progress}%">
                                  <div class="ext-progress-glare"></div>
                              </div>
                          </div>
                      </div>
                      
                      <div class="ext-card-meta">
                          <span class="ext-percentage">${isExtractingOrVerifying ? phaseText : progress + '%'}</span>
                          <span class="ext-separator" style="display: ${isExtractingOrVerifying ? 'none' : 'inline'}">•</span>
                          <span class="ext-speed">${speed}</span>
                      </div>
                  </div>
              </div>
            `;
        }
      } else {
        const existingItems = content.querySelectorAll('.ext-multi-dl-item');
        const existingIds = new Set<string>();
        existingItems.forEach((el) => {
          const id = (el as HTMLElement).dataset.dlId;
          if (id) existingIds.add(id);
        });

        const currentIds = new Set(downloads.map(d => d.id));
        let needsFullRebuild = !content.querySelector('.ext-multi-download-card');

        if (!needsFullRebuild) {
          for (const id of existingIds) {
            if (!currentIds.has(id)) { needsFullRebuild = true; break; }
          }
          for (const id of currentIds) {
            if (!existingIds.has(id)) { needsFullRebuild = true; break; }
          }
        }

        if (needsFullRebuild) {
          const itemsHtml = downloads.map((dl) => {
            const progress = Math.round(dl.progress || 0);
            const displayName = this._getDownloadDisplayName(dl);
            let pctText = `${progress}%`;
            
            if (dl.statusText) {
              const lowerStatus = dl.statusText.toLowerCase();
              if (lowerStatus.includes('extract')) pctText = 'Extracting...';
              else if (lowerStatus.includes('verif')) pctText = 'Verifying...';
            }

            return `
              <div class="ext-multi-dl-item" data-dl-id="${dl.id}">
                <div class="ext-multi-dl-info">
                  <span class="ext-multi-dl-name" title="${displayName}">${displayName}</span>
                  <span class="ext-multi-dl-pct">${pctText}</span>
                </div>
                <div class="ext-multi-dl-bar">
                  <div class="ext-multi-dl-fill" style="width: ${progress}%"></div>
                </div>
              </div>`;
          }).join('');

          content.innerHTML = `
            <div class="ext-multi-download-card ext-download-card">
                <button class="ext-close-btn" onclick="window.statusBarManager.updateExtendedBar('none')" title="Close">
                    <i class="bi bi-chevron-down"></i>
                </button>
                <div class="ext-card-icon-container">
                    <div class="ext-card-icon">
                        <i class="bi bi-cloud-arrow-down-fill"></i>
                    </div>
                </div>
                <div class="ext-card-details">
                    <div class="ext-card-header">
                        <span class="ext-status-badge">${downloads.length} Downloads</span>
                    </div>
                    <div class="ext-multi-dl-list">
                      ${itemsHtml}
                    </div>
                </div>
            </div>
          `;
        } else {
          downloads.forEach((dl) => {
            const itemEl = content.querySelector(`.ext-multi-dl-item[data-dl-id="${dl.id}"]`);
            if (!itemEl) return;
            const progress = Math.round(dl.progress || 0);
            const displayName = this._getDownloadDisplayName(dl);
            let pctText = `${progress}%`;
            
            if (dl.statusText) {
              const lowerStatus = dl.statusText.toLowerCase();
              if (lowerStatus.includes('extract')) pctText = 'Extracting...';
              else if (lowerStatus.includes('verif')) pctText = 'Verifying...';
            }

            const nameEl = itemEl.querySelector('.ext-multi-dl-name');
            const pctEl = itemEl.querySelector('.ext-multi-dl-pct');
            const fillEl = itemEl.querySelector('.ext-multi-dl-fill') as HTMLElement;
            if (nameEl) { nameEl.textContent = displayName; (nameEl as HTMLElement).title = displayName; }
            if (pctEl) pctEl.textContent = pctText;
            if (fillEl) fillEl.style.width = `${progress}%`;
          });

          const badgeEl = content.querySelector('.ext-status-badge');
          if (badgeEl) badgeEl.textContent = `${downloads.length} Downloads`;
        }
      }
    } else if (update.type === 'success') {
      if (!bottomBar.classList.contains('success-mode')) {
        bottomBar.classList.remove('download-mode', 'conflict-mode');
        bottomBar.classList.add('success-mode');
      }

      if (!bottomBar.classList.contains('expanded')) {
        bottomBar.classList.add('expanded');
      }

      if (!wasExpanded || previousMode !== 'success') {
        this.triggerIslandPulse(bottomBar, 'success');
      }

      // Ensure content is visible
      (content as HTMLElement).style.display = 'flex';

      content.innerHTML = `
            <div class="ext-download-card">
                <button class="ext-close-btn" onclick="window.statusBarManager.updateExtendedBar('none')" title="Close">
                    <i class="bi bi-chevron-down"></i>
                </button>
                <div class="ext-card-icon-container" style="background: rgba(40, 167, 69, 0.1); border-color: #28a745;">
                    <div class="ext-card-icon">
                        <i class="bi bi-check-circle-fill" style="color: #28a745;"></i>
                    </div>
                </div>
                <div class="ext-card-details">
                    <div class="ext-card-header">
                        <span class="ext-status-badge" style="background: #28a745; border-color: #28a745; color: #fff;">Completed</span>
                        <span class="ext-filename" title="${update.fileName}">${update.fileName || 'Unknown file'}</span>
                    </div>
                    
                    <div class="ext-card-meta">
                        <span style="color: #28a745;">Download finished successfully</span>
                    </div>
                </div>
            </div>
        `;
    } else if (update.type === 'conflict') {
      if (!bottomBar.classList.contains('conflict-mode')) {
        bottomBar.classList.remove('download-mode', 'success-mode');
        bottomBar.classList.add('conflict-mode');
      }

      if (!bottomBar.classList.contains('expanded')) {
        bottomBar.classList.add('expanded');
      }

      if (!wasExpanded || previousMode !== 'conflict') {
        this.triggerIslandPulse(bottomBar, 'conflict');
      }

      // Ensure content is visible
      (content as HTMLElement).style.display = 'flex';

      content.innerHTML = `  
        <div class="ext-conflict-card">
            <button class="ext-close-btn" onclick="window.statusBarManager.updateExtendedBar('none')" title="Close">
                <i class="bi bi-chevron-down"></i>
            </button>
            <div class="ext-card-icon-container icon-warning">
                <div class="ext-card-icon">
                    <i class="bi bi-exclamation-triangle-fill"></i>
                </div>
            </div>
            <div class="ext-card-details">
                <div class="ext-card-header">
                     <span class="ext-status-badge badge-warning">Conflicts Detected</span>
                </div>
                <div class="ext-conflict-message">
                    ${update.modsWithConflictsCount} mod${update.modsWithConflictsCount !== 1 ? 's' : ''} have ${update.conflictCount} conflicting files.
                </div>
                <button class="ext-action-btn" onclick="window.conflictModalManager.showConflictModal()">
                    Resolve Now
                </button>
            </div>
        </div>
      `;
    }
  }

  checkActiveDownloads() {
    try {
      if (!window.downloadManager) return false;

      // Check for FTP transfer first
      if (window.downloadManager.ftpTransfer) {
        // FTP transfer is active, but we don't want it to block other status updates
        // The FTP status is handled by updateDownloadsStatus
        return true;
      }

      const activeDownloadsMap = (window.downloadManager as any)
        .activeDownloads;

      if (!activeDownloadsMap) {
        // If activeDownloads is missing, assume no downloads
        return false;
      }

      const downloads = Array.from(activeDownloadsMap.values());
      const activeDownloads = downloads.filter(
        (d: any) => d.status === 'downloading' || d.status === 'extracting',
      );

      if (activeDownloads.length > 0) {
        const active: any = activeDownloads[0];
        this.hasActiveDownloads = true;

        // Detection of data change for downloads
        const downloadIds = activeDownloads
          .map((d: any) => d.id || d.fileName)
          .sort()
          .join(',');
        const dataKey = `download:${downloadIds}`;

        if (this.lastExtendedBarData !== dataKey) {
          this.userDismissedExtendedBar = false;
          this.lastExtendedBarData = dataKey;
        }

        if (!this.userDismissedExtendedBar) {
          // Update extended bar
          const dlItems: DownloadItem[] = activeDownloads.map((d: any) => ({
            id: d.id,
            fileName: d.fileName,
            modName: d.modName,
            statusText: d.statusText,
            progress: d.progress || 0,
            speedText: d.speedText || '',
          }));
          this.updateExtendedBar({ type: 'download', downloads: dlItems });
        }

        // Also update standard status bar as fallback or complement
        const statusRight =
          document.querySelector<HTMLElement>('.bottom-text-right');
        if (statusRight) {
          statusRight.textContent = '';
        }

        if (this.currentTab !== 'downloads') {
          const dlName =
            active.modName ||
            active.fileName ||
            active.url?.split('/').pop() ||
            'Downloading...';
          const shortName =
            dlName.length > 30 ? `${dlName.substring(0, 27)}...` : dlName;

          let prog = '';
          if (active.statusText) {
            const lowerStatus = active.statusText.toLowerCase();
            if (lowerStatus.includes('extract')) prog = ' • Extracting...';
            else if (lowerStatus.includes('verif')) prog = ' • Verifying...';
          }
          if (!prog && active.progress !== undefined) {
            prog = ` • ${Math.round(active.progress)}%`;
          }

          this.renderStatus(
            {
              content: this.t('statusBar.downloadsDownloading', {
                fileName: shortName,
                progress: prog,
                size: '',
                speed: '',
              }),
              downloading: true,
            },
            { force: !this.hasTemporaryStatus() },
          );
        }
        return true;
      } else {
        const wasActive = this.hasActiveDownloads;
        this.hasActiveDownloads = false;

        const statusText = this.getStatusTextElement();
        if (statusText) {
          statusText.classList.remove('status-downloading');
        }

        // Check if a download JUST finished to show success state
        if (wasActive) {
          const completed =
            (window.downloadManager as any).completedDownloads || [];
          if (completed.length > 0) {
            const last = completed[0];
            // If finished within last 5 seconds AND it's a new completion
            if (Date.now() - (last.endTime || 0) < 5000 && this.lastHandledSuccessId !== last.id) {
              this.lastHandledSuccessId = last.id; // Mark this download as handled for success UI
              this.userDismissedExtendedBar = false; // Always show success
              this.updateExtendedBar({
                type: 'success',
                fileName: last.modName || last.fileName,
              });

              this.refreshStandardStatus(); // Update the background text instantly

              // Wait 2 seconds then retract
              setTimeout(() => {
                const bottomBar = document.getElementById('main-status-bar');
                if (bottomBar && bottomBar.classList.contains('success-mode')) {
                  this.updateExtendedBar({ type: 'none' });
                }
              }, 2000);

              return false;
            }
          }
        }

        if (!wasActive) {
          // Only verify conflicts if we weren't just downloading (avoid flashing)
          if (window.modManager && window.modManager.conflictGroups) {
            const conflicts = window.modManager.conflictGroups;

            const modsWithConflicts = conflicts.reduce<Set<string>>(
              (mods, nextConflict) => {
                return new Set([
                  ...Array.from(mods),
                  ...nextConflict.conflicts.flatMap((conflict) =>
                    conflict.mods.map((mod) => mod.name),
                  ),
                ]);
              },
              new Set(),
            );

            const conflictCount = conflicts.length;

            if (conflictCount > 0) {
              const dataKey = `conflict:${conflictCount}`;
              if (this.lastExtendedBarData !== dataKey) {
                this.userDismissedExtendedBar = false;
                this.lastExtendedBarData = dataKey;
              }

              if (!this.userDismissedExtendedBar) {
                this.updateExtendedBar({
                  type: 'conflict',
                  conflictCount,
                  modsWithConflictsCount: modsWithConflicts.size,
                });
              }
              return false;
            } else {
              // No conflicts, reset dismissal for next time
              if (this.lastExtendedBarData?.startsWith('conflict:')) {
                this.lastExtendedBarData = null;
                this.userDismissedExtendedBar = false;
              }
            }
          }
        }

        if (wasActive) {
          // Immediate cleanup if no success state needed
          this.updateExtendedBar({ type: 'none' });
          this.refreshStandardStatus();
        } else {
          // Routine cleanup
          const bottomBar = document.getElementById('main-status-bar');
          if (
            bottomBar &&
            bottomBar.classList.contains('expanded') &&
            !bottomBar.classList.contains('conflict-mode') &&
            !bottomBar.classList.contains('success-mode')
          ) {
            this.updateExtendedBar({ type: 'none' });
          }
        }

        return false;
      }
    } catch (e) {
      return false;
    }
  }

  refreshStandardStatus() {
    if (this.hasTemporaryStatus()) {
      this.renderStatus(this.temporaryStatus!, { force: true });
      return;
    }

    if (!this.currentTab) {
      this.syncCurrentTabFromSidebar();
    }

    if (this.currentTab) {
      this.updateStatus(this.currentTab);
    } else {
      const statusLeft = this.getStatusTextElement();
      if (statusLeft) {
        statusLeft.classList.remove('status-downloading');
        this.updateStatus('tools');
      }
    }
  }

  checkAndUpdateForDownloads() {
    const modalOpen = this.hasModalOpen();
    const hasActiveDownloads = this.checkActiveDownloads();

    if (modalOpen && !hasActiveDownloads) {
      this.preserveCurrentStatus();
      return;
    }

    const statusText = this.getStatusTextElement();
    if (!statusText) {
      return;
    }

    if (this.hasTemporaryStatus()) {
      this.renderStatus(this.temporaryStatus!, { force: true });
      return;
    }

    if (hasActiveDownloads) {
      this.preservedStatus = null;
      const cycleId = this.beginStatusCycle();
      this.startDownloadsStatusLoop(cycleId);
    } else if (this.currentTab && !modalOpen) {
      if (statusText.classList.contains('status-downloading')) {
        statusText.classList.remove('status-downloading');
        statusText.offsetHeight;
      }
      this.updateStatus(this.currentTab);
    } else if (!modalOpen && this.preservedStatus) {
      this.restorePreservedStatus();
    }
  }

  async updateSocialStatus(statusText) {
    const cycleId = this.beginStatusCycle();
    await this.refreshSocialTabStatus(cycleId);
    if (this.currentTab === 'social') {
      this.updateInterval = setInterval(() => {
        void this.refreshSocialTabStatus(cycleId);
      }, 3 * 60 * 1000);
    }
    return;

    const updateStatus = async () => {
      if (
        this.currentTab !== 'social' ||
        this.checkActiveDownloads() ||
        this.hasModalOpen()
      ) {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
        return;
      }

      if (this.preservedStatus) {
        return;
      }

      try {
        if (
          window.socialManager &&
          window.socialManager.authToken &&
          window.socialManager.userData
        ) {
          const userId = window.socialManager.userData.localId;

          try {
            const modsData = await window.socialManager.fetchWithCache(
              `${window.socialManager.API_URL}/list/links?idToken=${window.socialManager.authToken}`,
              {},
              'links',
            );

            const mods = Array.isArray(modsData)
              ? modsData
              : modsData.documents || [];

            if (Array.isArray(mods)) {
              const usernameEl = document.querySelector<HTMLElement>(
                '#social-profile-username',
              );
              const username = usernameEl ? usernameEl.textContent : null;
              const myMods = mods.filter((mod) => {
                const modUserId = mod.userId;
                const modPseudo = mod.pseudo;
                return (
                  modUserId === userId || (username && modPseudo === username)
                );
              });

              const friendsData = await window.socialManager.fetchWithCache(
                `${window.socialManager.API_URL}/links-friends`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    idToken: window.socialManager.authToken,
                  }),
                },
                'friends',
              );

              let friendsCount = 0;
              if (friendsData.friends && Array.isArray(friendsData.friends)) {
                friendsCount = friendsData.friends.filter(
                  (f) => f.status === 'accepted',
                ).length;
              }

              this.setStatusText(
                this.t('statusBar.socialModsShared', {
                  count: myMods.length,
                  plural: myMods.length !== 1 ? 's' : '',
                  friends: friendsCount,
                  friendsPlural: friendsCount !== 1 ? 's' : '',
                }),
              );
            } else {
              this.setStatusText(this.t('statusBar.socialConnected'));
            }
          } catch (e) {
            this.setStatusText(this.t('statusBar.socialConnected'));
          }
        } else {
          this.setStatusText(this.t('statusBar.socialNotConnected'));
        }
      } catch (error) {
        this.setStatusText(this.t('statusBar.socialReady'));
      }
    };

    await updateStatus();

    // OPTIMIZATION: Réduire la fréquence des requêtes (30s -> 3 min)
    this.updateInterval = setInterval(updateStatus, 3 * 60 * 1000);
  }

  updateDownloadsStatus(statusText) {
    const cycleId = this.beginStatusCycle();
    this.startDownloadsStatusLoop(cycleId);
    return;

    let animationFrame = 0;
    let lastUpdateTime = Date.now();
    let lastReceivedBytes = new Map();

    const updateStatus = () => {
      if (this.preservedStatus && !this.checkActiveDownloads()) {
        return;
      }

      if (this.hasModalOpen() && !this.checkActiveDownloads()) {
        return;
      }

      try {
        // Check for FTP transfer first
        if (window.downloadManager && window.downloadManager.ftpTransfer) {
          const ftp = window.downloadManager.ftpTransfer;
          const dots = '.'.repeat(animationFrame % 4);
          animationFrame++;

          let statusContent;
          if (ftp.totalMods > 0) {
            statusContent = this.t('statusBar.ftpSending', {
              current: ftp.currentMod || 0,
              total: ftp.totalMods || 0,
            });
          } else {
            statusContent = this.t('statusBar.ftpSending', {
              current: '',
              total: '',
            }).replace(' • / mods', '');
          }
          statusContent += dots;

          if (this.setStatusText(statusContent, true)) {
            const statusText =
              document.querySelector<HTMLElement>('.bottom-text-left') ||
              document.querySelector<HTMLElement>('.bottom-text');
            if (
              statusText &&
              !statusText.classList.contains('status-downloading')
            ) {
              statusText.classList.add('status-downloading');
            }
          }

          setTimeout(() => updateStatus(), 200);
          return;
        }

        if (window.downloadManager && window.downloadManager.activeDownloads) {
          const activeDownloads = Array.from(
            window.downloadManager.activeDownloads.values(),
          );
          const activeCount = activeDownloads.length;
          const completedCount = window.downloadManager.completedDownloads
            ? window.downloadManager.completedDownloads.length
            : 0;

          if (activeCount > 0) {
            const firstDownload = activeDownloads[0];
            const currentTime = Date.now();
            const timeDelta = (currentTime - lastUpdateTime) / 1000;

            let speedText = '';
            let progressText = '';

            if (
              firstDownload.receivedBytes !== undefined &&
              firstDownload.totalBytes !== undefined &&
              firstDownload.totalBytes > 0
            ) {
              const progress = Math.round(
                (firstDownload.receivedBytes / firstDownload.totalBytes) * 100,
              );
              progressText = `${progress}%`;

              const downloadId = firstDownload.id;
              const lastBytes = lastReceivedBytes.get(downloadId) || 0;
              const bytesDelta = firstDownload.receivedBytes - lastBytes;

              if (timeDelta > 0 && bytesDelta > 0) {
                const speedBytes = bytesDelta / timeDelta;
                speedText = this.formatSpeed(speedBytes);
              }

              lastReceivedBytes.set(downloadId, firstDownload.receivedBytes);
            } else if (firstDownload.progress !== undefined) {
              progressText = `${Math.round(firstDownload.progress)}%`;
            }

            let sizeInfo = '';
            if (
              firstDownload.totalBytes !== undefined &&
              firstDownload.totalBytes > 0
            ) {
              const received = firstDownload.receivedBytes || 0;
              sizeInfo = `${this.formatBytes(received)} / ${this.formatBytes(
                firstDownload.totalBytes,
              )}`;
            }

            const fileName =
              firstDownload.modName ||
              firstDownload.fileName ||
              firstDownload.url?.split('/').pop() ||
              'Downloading...';
            const shortFileName =
              fileName.length > 30
                ? fileName.substring(0, 27) + '...'
                : fileName;

            const dots = '.'.repeat(animationFrame % 4);
            const animIndicator =
              activeCount > 1 ? ` [${activeCount} active]` : '';

            let progressPart = progressText ? ` • ${progressText}` : '';
            let sizePart = sizeInfo ? ` • ${sizeInfo}` : '';
            let speedPart = speedText ? ` • ${speedText}` : '';

            let statusContent = this.t('statusBar.downloadsDownloading', {
              fileName: shortFileName,
              progress: progressPart,
              size: sizePart,
              speed: speedPart,
            });
            statusContent += dots;
            if (animIndicator) statusContent += animIndicator;

            if (this.setStatusText(statusContent, true)) {
              const statusText =
                document.querySelector<HTMLElement>('.bottom-text-left') ||
                document.querySelector<HTMLElement>('.bottom-text');
              if (
                statusText &&
                !statusText.classList.contains('status-downloading')
              ) {
                statusText.classList.add('status-downloading');
              }
            }

            lastUpdateTime = currentTime;
            animationFrame++;
          } else {
            if (statusText.classList.contains('status-downloading')) {
              statusText.classList.remove('status-downloading');

              statusText.offsetHeight;
            }

            if (this.updateInterval) {
              clearInterval(this.updateInterval);
              this.updateInterval = null;
            }

            if (this.currentTab !== 'downloads') {
              if (!this.hasModalOpen() && !this.preservedStatus) {
                this.updateStatus(this.currentTab);
              }
              return;
            }

            if (!this.hasModalOpen() && !this.preservedStatus) {
              if (completedCount > 0) {
                this.setStatusText(
                  this.t('statusBar.downloadsCompleted', {
                    count: completedCount,
                    plural: completedCount !== 1 ? 's' : '',
                  }),
                );
              } else {
                this.setStatusText(this.t('statusBar.downloadsNoActive'));
              }
            }
          }
        } else {
          if (statusText.classList.contains('status-downloading')) {
            statusText.classList.remove('status-downloading');

            statusText.offsetHeight;
          }

          if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
          }

          if (this.currentTab !== 'downloads') {
            if (!this.hasModalOpen() && !this.preservedStatus) {
              this.updateStatus(this.currentTab);
            }
            return;
          }

          if (!this.hasModalOpen() && !this.preservedStatus) {
            this.setStatusText(this.t('statusBar.downloadsReady'));
          }
        }
      } catch (error) {
        console.error('Status bar error:', error);
        statusText.classList.remove('status-downloading');

        if (this.currentTab !== 'downloads') {
          if (!this.hasModalOpen() && !this.preservedStatus) {
            this.updateStatus(this.currentTab);
          }
          return;
        }

        if (!this.hasModalOpen() && !this.preservedStatus) {
          this.setStatusText('Downloads • Ready');
        }
      }
    };

    updateStatus();

    this.updateInterval = setInterval(() => {
      const hasActiveDownloads = this.checkActiveDownloads();
      if (hasActiveDownloads) {
        // Only update status if there's no ongoing FTP with its own loop
        if (!window.downloadManager || !window.downloadManager.ftpTransfer) {
          updateStatus();
        }
      } else {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }

        if (statusText.classList.contains('status-downloading')) {
          statusText.classList.remove('status-downloading');
          statusText.offsetHeight;
        }

        if (this.currentTab && this.currentTab !== 'downloads') {
          this.updateStatus(this.currentTab);
        } else if (this.currentTab === 'downloads') {
          const completedCount =
            window.downloadManager?.completedDownloads?.length || 0;
          if (completedCount > 0) {
            this.setStatusText(
              this.t('statusBar.downloadsCompleted', {
                count: completedCount,
                plural: completedCount !== 1 ? 's' : '',
              }),
            );
          } else {
            this.setStatusText(this.t('statusBar.downloadsNoActive'));
          }
        }
      }
    }, 500);
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Format download speed
   */
  formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond === 0) return '';
    return this.formatBytes(bytesPerSecond) + '/s';
  }

  updateToolsStatus(statusText) {
    const cycleId = this.beginStatusCycle();
    this.applySnapshot(this.getToolsSnapshot(), { cycleId });
    this.startStaticTabPolling('tools', cycleId);
    return;

    const updateStatus = () => {
      if (
        this.currentTab !== 'tools' ||
        this.checkActiveDownloads() ||
        this.hasModalOpen()
      ) {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
        return;
      }

      if (this.preservedStatus) {
        return;
      }

      try {
        if (window.modManager && window.modManager.mods) {
          const mods = window.modManager.mods;

          const enabledMods = mods.filter(
            (mod) => mod.status === 'active',
          ).length;
          const totalMods = mods.length;

          this.setStatusText(
            this.t('statusBar.modsEnabled', {
              enabled: enabledMods,
              total: totalMods,
              plural: totalMods !== 1 ? 's' : '',
            }),
          );
        } else {
          this.setStatusText(this.t('statusBar.modsReady'));
        }
      } catch (error) {
        this.setStatusText(this.t('statusBar.modsReady'));
      }
    };

    updateStatus();

    this.updateInterval = setInterval(updateStatus, 10000);
  }

  /**
   * Update status for Plugins tab
   */
  updatePluginsStatus(statusText) {
    const cycleId = this.beginStatusCycle();
    this.applySnapshot(this.getPluginsSnapshot(), { cycleId });
    this.startStaticTabPolling('plugins', cycleId);
    return;

    const updateStatus = () => {
      if (
        this.currentTab !== 'plugins' ||
        this.checkActiveDownloads() ||
        this.hasModalOpen()
      ) {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
        return;
      }

      if (this.preservedStatus) {
        return;
      }

      try {
        if (window.pluginManager) {
          const plugins = window.pluginManager.plugins || [];
          const enabledPlugins = plugins.filter(
            (p) => p.enabled !== false,
          ).length;

          this.setStatusText(
            this.t('statusBar.pluginsEnabled', {
              enabled: enabledPlugins,
              total: plugins.length,
              plural: plugins.length !== 1 ? 's' : '',
            }),
          );
        } else {
          this.setStatusText(this.t('statusBar.pluginsReady'));
        }
      } catch (error) {
        this.setStatusText(this.t('statusBar.pluginsReady'));
      }
    };

    updateStatus();
    this.updateInterval = setInterval(updateStatus, 10000);
  }

  updateSettingsStatus(statusText) {
    this.applySnapshot(this.getSettingsSnapshot());
    return;

    this.setStatusText(this.t('statusBar.settings'));
  }

  /**
   * Update status for Characters tab
   */
  updateCharactersStatus(statusText) {
    const cycleId = this.beginStatusCycle();
    this.applySnapshot(this.getCharactersSnapshot(), { cycleId });
    this.startStaticTabPolling('characters', cycleId);
    return;

    const updateStatus = () => {
      if (
        this.currentTab !== 'characters' ||
        this.checkActiveDownloads() ||
        this.hasModalOpen()
      ) {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
        return;
      }

      if (this.preservedStatus) {
        return;
      }

      try {
        if (window.charactersManager && window.charactersManager.characters) {
          const characters = window.charactersManager.characters;
          const count = characters.size;

          this.setStatusText(
            this.t('statusBar.charactersAvailable', {
              count: count,
              plural: count !== 1 ? 's' : '',
            }),
          );
        } else {
          this.setStatusText(this.t('statusBar.charactersReady'));
        }
      } catch (error) {
        this.setStatusText(this.t('statusBar.charactersReady'));
      }
    };

    updateStatus();
    this.updateInterval = setInterval(updateStatus, 10000);
  }
  updateStagesStatus(statusText) {
    this.applySnapshot(this.getStagesSnapshot());
    return;

    this.setStatusText(this.t('statusBar.stages'));
  }

  updateCheckingConflictsStatus() {
    const statusRight =
      document.querySelector<HTMLElement>('.bottom-text-right');
    if (!statusRight) return;

    statusRight.innerHTML = '';
    const checkingText = document.createElement('span');
    checkingText.textContent = this.t('statusBar.checkingConflicts');
    checkingText.style.display = 'flex';
    checkingText.style.alignItems = 'center';
    checkingText.style.gap = '6px';

    // Spinner
    const spinner = document.createElement('i');
    spinner.className = 'fas fa-circle-notch fa-spin';
    spinner.style.fontSize = '12px';
    checkingText.appendChild(spinner);

    statusRight.appendChild(checkingText);

    // Small delay to allow check to perform
    setTimeout(() => {
      if (window.modManager && window.modManager.conflictGroups) {
        const conflicts = window.modManager.conflictGroups;
        const conflictCount = conflicts.length;

        const modsWithConflicts = conflicts.reduce<Set<string>>(
          (mods, nextConflict) => {
            return new Set([
              ...Array.from(mods),
              ...nextConflict.conflicts.flatMap((conflict) =>
                conflict.mods.map((mod) => mod.name),
              ),
            ]);
          },
          new Set(),
        );

        if (conflictCount > 0) {
          // Update extended bar
          this.updateExtendedBar({
            type: 'conflict',
            conflictCount,
            modsWithConflictsCount: modsWithConflicts.size,
          });

          statusRight.innerHTML = '';
          const warning = document.createElement('span');
          warning.style.color = 'var(--warning-color)';
          warning.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i> ${conflictCount} conflicts`;
          warning.style.cursor = 'pointer';
          warning.onclick = () => {
            if (window.conflictModalManager) {
              window.conflictModalManager.showConflictModal();
            }
          };
          statusRight.appendChild(warning);
        } else {
          // Clear extended bar if no downloads
          if (!this.hasActiveDownloads) {
            this.updateExtendedBar({ type: 'none' });
          }
          statusRight.textContent = '';
        }
      }
    }, 500);
  }

  updateConflictStatus(conflictCount: number, modsWithConflictsCount: number) {
    const statusRight =
      document.querySelector<HTMLElement>('.bottom-text-right');
    if (!statusRight) return;

    statusRight.innerHTML = '';

    if (conflictCount > 0) {
      this.updateExtendedBar({
        type: 'conflict',
        conflictCount,
        modsWithConflictsCount,
      }); // Update extended bar

      const conflictText = document.createElement('span');

      conflictText.className = 'conflict-link';
      conflictText.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (window.statusBarManager) {
          window.statusBarManager.preserveCurrentStatus();
        }

        if (window.conflictModalManager) {
          window.conflictModalManager.showConflictModal();
        }
      });

      conflictText.textContent = this.t('statusBar.conflictsDetected', {
        count: conflictCount,
        plural: conflictCount !== 1 ? 's' : '',
      });

      statusRight.appendChild(conflictText);
    }
  }

  clear() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    const statusRight =
      document.querySelector<HTMLElement>('.bottom-text-right');
    if (statusRight) {
      statusRight.innerHTML = '';
    }
    if (this.currentTab && !this.preservedStatus) {
      this.updateStatus(this.currentTab);
    }
  }
}

if (typeof window !== 'undefined') {
  window.statusBarManager = new StatusBarManager();

  // Écouter les changements de langue pour mettre à jour la status bar
  window.addEventListener('localeChanged', () => {
    if (window.statusBarManager && window.statusBarManager.currentTab) {
      // Mettre à jour le statut avec l'onglet actuel pour appliquer les nouvelles traductions
      setTimeout(() => {
        window.statusBarManager.updateStatus(
          window.statusBarManager.currentTab,
        );
      }, 100);
    }
  });
}
