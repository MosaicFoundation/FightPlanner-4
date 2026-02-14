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

interface DownloadUpdate {
  type: 'download';
  fileName: string;
  progress: number;
  speedText: string;
}

export class StatusBarManager {
  updateInterval: ReturnType<typeof setTimeout> | null;
  currentTab: string | null;
  preservedStatus: string | null;
  animationTimeout: ReturnType<typeof setTimeout> | null;
  hasActiveDownloads: boolean = false;
  userDismissedExtendedBar: boolean = false;
  lastExtendedBarData: string | null = null;

  constructor() {
    this.updateInterval = null;
    this.currentTab = null;
    this.preservedStatus = null;
    this.animationTimeout = null;
    this.userDismissedExtendedBar = false;
    this.lastExtendedBarData = null;

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

  updateStatus(tabName) {
    // Target the new structure directly
    const statusText = document.querySelector<HTMLElement>(
      '#main-status-bar .bottom-text-left',
    );

    if (!statusText) return;

    const modalOpen = this.hasModalOpen();
    const hasActiveDownloads = this.checkActiveDownloads();

    if (modalOpen && !hasActiveDownloads) {
      this.preserveCurrentStatus();
      return;
    }

    if (this.preservedStatus && !modalOpen && !hasActiveDownloads) {
      this.preservedStatus = null;
    }

    const validTabs = [
      'social',
      'downloads',
      'tools',
      'plugins',
      'settings',
      'characters',
      'stages',
      'fightplanner',
    ];

    // Force update the current tab tracker
    if (validTabs.includes(tabName)) {
      this.currentTab = tabName;
    }

    if (typeof tabName === 'string') {
      if (
        tabName.startsWith('statusBar.') ||
        tabName.includes('...') ||
        tabName.includes('…')
      ) {
        if (!this.preservedStatus) {
          this.animateStatusChange(statusText, () => {
            this.setStatusText(this.t(tabName));
          });
        }
        return;
      }
    }

    if (!tabName && !this.currentTab) {
      return;
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (hasActiveDownloads) {
      this.preservedStatus = null;
      this.updateDownloadsStatus(statusText);
    } else {
      // Ensure we're not stuck in 'downloading' state visual
      const bottomBar = document.getElementById('main-status-bar');
      if (bottomBar && bottomBar.classList.contains('expanded')) {
        this.updateExtendedBar({ type: 'none' });
      }

      this.animateStatusChange(statusText, () => {
        const tab = this.currentTab;
        switch (tab) {
          case 'social':
            this.updateSocialStatus(statusText);
            break;
          case 'downloads':
            this.updateDownloadsStatus(statusText);
            break;
          case 'tools':
            this.updateToolsStatus(statusText);
            break;
          case 'plugins':
            this.updatePluginsStatus(statusText);
            break;
          case 'settings':
            this.updateSettingsStatus(statusText);
            break;
          case 'characters':
            this.updateCharactersStatus(statusText);
            break;
          case 'stages':
            this.updateStagesStatus(statusText);
            break;
          case 'fightplanner':
            // FightPlanner status if needed
            break;
          default:
            if (!this.currentTab) {
              return;
            }
        }
      });
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

    if (isNoAnimations) {
      callback();
      return;
    }

    // Cancel any pending animation callback to prevent racing conditions
    if (this.animationTimeout) {
      clearTimeout(this.animationTimeout);
      this.animationTimeout = null;
    }

    statusText.classList.add('status-changing');

    if (isReducedAnimations) {
      statusText.style.transition = 'opacity 0.1s ease';
      statusText.style.opacity = '0';

      this.animationTimeout = setTimeout(() => {
        callback();
        this.animationTimeout = null;

        setTimeout(() => {
          statusText.style.opacity = '1';
          statusText.style.transform = 'translateY(0)';
          statusText.classList.remove('status-changing');
        }, 50);
      }, 150); // slightly longer wait
    } else {
      statusText.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      statusText.style.opacity = '0';
      statusText.style.transform = 'translateY(5px)';

      this.animationTimeout = setTimeout(() => {
        callback();
        this.animationTimeout = null;

        setTimeout(() => {
          statusText.style.opacity = '1';
          statusText.style.transform = 'translateY(0)';

          setTimeout(() => {
            statusText.style.transition = '';
            statusText.style.opacity = '';
            statusText.style.transform = '';
            statusText.classList.remove('status-changing');
          }, 200);
        }, 50); // slight delay to ensure DOM update
      }, 250); // Wait longer than transition (0.2s) to ensure text is fully hidden
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
    const statusText =
      document.querySelector<HTMLElement>('.bottom-text-left') ||
      document.querySelector<HTMLElement>('.bottom-text');
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
      !this.checkActiveDownloads() &&
      !this.hasModalOpen()
    ) {
      const statusText =
        document.querySelector<HTMLElement>('.bottom-text-left') ||
        document.querySelector<HTMLElement>('.bottom-text');
      if (statusText) {
        statusText.textContent = this.preservedStatus;
        this.preservedStatus = null;
        if (this.currentTab) {
          setTimeout(() => {
            if (!this.hasModalOpen() && !this.checkActiveDownloads()) {
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
    if (this.preservedStatus) {
      return false;
    }
    const statusText =
      document.querySelector<HTMLElement>('.bottom-text-left') ||
      document.querySelector<HTMLElement>('.bottom-text');
    if (statusText) {
      if (useInnerHTML) {
        statusText.innerHTML = content;
      } else {
        statusText.textContent = content;
      }
      return true;
    }
    return false;
  }

  updateExtendedBar(
    update: NoneUpdate | SuccessUpdate | ConflictUpdate | DownloadUpdate,
  ) {
    const bottomBar = document.getElementById('main-status-bar');
    if (!bottomBar) return;

    const content = bottomBar.querySelector('.extended-content');
    const enabled =
      window.settingsManager?.settings.enhancedStatusBar !== false;

    if (update.type === 'none' || !enabled || !content) {
      if (update.type === 'none') {
        this.userDismissedExtendedBar = true;
      }

      if (content) (content as HTMLElement).style.display = 'none';

      if (bottomBar.classList.contains('expanded')) {
        bottomBar.classList.remove('expanded');
        setTimeout(() => {
          if (!bottomBar.classList.contains('expanded')) {
            bottomBar.classList.remove('download-mode', 'conflict-mode');
          }
        }, 300);
      }
      return;
    }

    if (update.type === 'download') {
      if (!bottomBar.classList.contains('download-mode')) {
        bottomBar.classList.remove('conflict-mode');
        bottomBar.classList.add('download-mode');
      }

      if (!bottomBar.classList.contains('expanded')) {
        bottomBar.classList.add('expanded');
      }

      // Ensure content is visible
      (content as HTMLElement).style.display = 'flex';

      const progress = Math.round(update.progress || 0);
      const speed = update.speedText || '';

      content.innerHTML = `
        <div class="ext-download-card">
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
                    <span class="ext-status-badge">Downloading</span>
                    <span class="ext-filename" title="${update.fileName}">${update.fileName || 'Unknown file'}</span>
                </div>
                
                <div class="ext-progress-container">
                    <div class="ext-progress-track">
                        <div class="ext-progress-fill" style="width: ${progress}%">
                            <div class="ext-progress-glare"></div>
                        </div>
                    </div>
                </div>
                
                <div class="ext-card-meta">
                    <span class="ext-percentage">${progress}%</span>
                    <span class="ext-separator">•</span>
                    <span class="ext-speed">${speed}</span>
                </div>
            </div>
        </div>
      `;
    } else if (update.type === 'success') {
      if (!bottomBar.classList.contains('success-mode')) {
        bottomBar.classList.remove('download-mode', 'conflict-mode');
        bottomBar.classList.add('success-mode');
      }

      if (!bottomBar.classList.contains('expanded')) {
        bottomBar.classList.add('expanded');
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
                        <span class="ext-status-badge" style="background: #28a745; border-color: #28a745;">Completed</span>
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
          this.updateExtendedBar({ type: 'download', ...active });
        }

        // Also update standard status bar as fallback or complement
        const statusRight =
          document.querySelector<HTMLElement>('.bottom-text-right');
        if (statusRight) {
          statusRight.textContent = '';
        }

        if (this.currentTab !== 'downloads') {
          let statusText =
            document.querySelector<HTMLElement>('.bottom-text-left');
          if (!statusText) {
            statusText = document.querySelector<HTMLElement>('.bottom-text');
          }

          if (statusText) {
            statusText.classList.add('status-downloading');
            statusText.textContent = this.t('statusBar.downloadsDownloading', {
              count: activeDownloads.length,
              percent: Math.round(active.progress),
            });
          }
        }
        return true;
      } else {
        const wasActive = this.hasActiveDownloads;
        this.hasActiveDownloads = false;

        const statusText = document.querySelector<HTMLElement>(
          '.bottom-text-left, .bottom-text',
        );
        if (statusText) {
          statusText.classList.remove('status-downloading');
        }

        // Check if a download JUST finished to show success state
        if (wasActive) {
          const completed =
            (window.downloadManager as any).completedDownloads || [];
          if (completed.length > 0) {
            const last = completed[0];
            // If finished within last 5 seconds
            if (Date.now() - (last.endTime || 0) < 5000) {
              this.userDismissedExtendedBar = false; // Always show success
              this.updateExtendedBar({
                type: 'success',
                fileName: last.modName || last.fileName,
              });

              // Wait 3 seconds then retract
              setTimeout(() => {
                this.updateExtendedBar({ type: 'none' });
                this.refreshStandardStatus();
              }, 3000);

              return false;
            }
          }
        }

        if (!wasActive) {
          // Only verify conflicts if we weren't just downloading (avoid flashing)
          if (window.modManager && window.modManager.conflicts) {
            const conflicts = window.modManager.conflicts;

            const modsWithConflicts = conflicts.reduce<Set<string>>(
              (mods, nextConflict) => {
                return new Set([
                  ...Array.from(mods),
                  ...nextConflict.mods.map((mod) => mod.name),
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
            !bottomBar.classList.contains('conflict-mode')
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
    // Attempt to detect current tab if null
    if (!this.currentTab) {
      const activeBtn = document.querySelector('.nav-btn.active');
      if (activeBtn) {
        const tabId = activeBtn.getAttribute('data-tab');
        if (tabId) this.currentTab = tabId;
      }
    }

    if (this.currentTab) {
      this.updateStatus(this.currentTab);
    } else {
      const statusLeft = document.querySelector<HTMLElement>(
        '#main-status-bar .bottom-text-left',
      );
      if (statusLeft) {
        statusLeft.classList.remove('status-downloading');

        const hash = window.location.hash;
        if (hash.includes('settings')) {
          this.updateStatus('settings');
        } else if (hash.includes('social')) {
          this.updateStatus('social');
        } else {
          this.updateStatus('tools');
        }
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

    const statusText =
      document.querySelector<HTMLElement>('.bottom-text-left') ||
      document.querySelector<HTMLElement>('.bottom-text');
    if (!statusText) return;

    if (hasActiveDownloads) {
      this.preservedStatus = null;
      this.animateStatusChange(statusText, () => {
        this.updateDownloadsStatus(statusText);
      });
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

  /**
   * Update status for Tools tab
   */
  /**
   * Update status for Tools tab
   */
  updateToolsStatus(statusText) {
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
    this.setStatusText(this.t('statusBar.settings'));
  }

  /**
   * Update status for Characters tab
   */
  updateCharactersStatus(statusText) {
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
      if (window.modManager && window.modManager.conflicts) {
        const conflicts = window.modManager.conflicts;
        const conflictCount = conflicts.length;

        const modsWithConflicts = conflicts.reduce<Set<string>>(
          (mods, nextConflict) => {
            return new Set([
              ...Array.from(mods),
              ...nextConflict.mods.map((mod) => mod.name),
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
    if (!this.preservedStatus) {
      const statusText =
        document.querySelector<HTMLElement>('.bottom-text-left') ||
        document.querySelector<HTMLElement>('.bottom-text');
      if (statusText && !this.currentTab) {
        statusText.textContent = this.t('statusBar.ready');
      }
    }
    const statusRight =
      document.querySelector<HTMLElement>('.bottom-text-right');
    if (statusRight) {
      statusRight.innerHTML = '';
    }
    this.currentTab = null;
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
