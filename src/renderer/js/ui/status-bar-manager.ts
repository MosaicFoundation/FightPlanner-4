class StatusBarManager {
  constructor() {
    this.updateInterval = null;
    this.currentTab = null;
    this.preservedStatus = null;
  }

  t(key, params = {}) {
    if (window.i18n && window.i18n.t) {
      return window.i18n.t(key, params);
    }
    return key;
  }

  updateStatus(tabName) {
    const statusText =
      document.querySelector('.bottom-text-left') ||
      document.querySelector('.bottom-text');
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

    if (typeof tabName === 'string') {
      if (validTabs.includes(tabName)) {
        this.currentTab = tabName;
      } else if (
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

    statusText.classList.add('status-changing');

    if (isReducedAnimations) {
      statusText.style.transition = 'opacity 0.1s ease';
      statusText.style.opacity = '0';
      setTimeout(() => {
        callback();
        setTimeout(() => {
          statusText.style.opacity = '1';
          statusText.style.transform = 'translateY(0)';
          statusText.classList.remove('status-changing');
        }, 10);
      }, 100);
    } else {
      statusText.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      statusText.style.opacity = '0';
      statusText.style.transform = 'translateY(5px)';

      setTimeout(() => {
        callback();

        setTimeout(() => {
          statusText.style.opacity = '1';
          statusText.style.transform = 'translateY(0)';

          setTimeout(() => {
            statusText.style.transition = '';
            statusText.style.opacity = '';
            statusText.style.transform = '';
            statusText.classList.remove('status-changing');
          }, 200);
        }, 10);
      }, 200);
    }
  }

  hasModalOpen() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay && overlay.style.display === 'block') {
      return true;
    }

    const allModals = document.querySelectorAll(
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
      document.querySelector('.bottom-text-left') ||
      document.querySelector('.bottom-text');
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
        document.querySelector('.bottom-text-left') ||
        document.querySelector('.bottom-text');
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
      document.querySelector('.bottom-text-left') ||
      document.querySelector('.bottom-text');
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

  checkActiveDownloads() {
    // Check for FTP transfer first
    if (window.downloadManager && window.downloadManager.ftpTransfer) {
      return true;
    }

    if (window.downloadManager && window.downloadManager.activeDownloads) {
      const activeDownloads = Array.from(
        window.downloadManager.activeDownloads.values(),
      );
      return activeDownloads.length > 0;
    }
    return false;
  }

  checkAndUpdateForDownloads() {
    const modalOpen = this.hasModalOpen();
    const hasActiveDownloads = this.checkActiveDownloads();

    if (modalOpen && !hasActiveDownloads) {
      this.preserveCurrentStatus();
      return;
    }

    const statusText =
      document.querySelector('.bottom-text-left') ||
      document.querySelector('.bottom-text');
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
              const usernameEl = document.getElementById(
                'social-profile-username',
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
              document.querySelector('.bottom-text-left') ||
              document.querySelector('.bottom-text');
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
                document.querySelector('.bottom-text-left') ||
                document.querySelector('.bottom-text');
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
          if (mods.length === 0) {
            return;
          }
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

  /**
   * Update status for Settings tab
   */
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
          const count =
            characters instanceof Map
              ? characters.size
              : Array.isArray(characters)
                ? characters.length
                : 0;
          if (count > 0) {
            this.setStatusText(
              this.t('statusBar.charactersAvailable', {
                count: count,
                plural: count !== 1 ? 's' : '',
              }),
            );
          } else {
            this.setStatusText(this.t('statusBar.charactersReady'));
          }
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
    const statusRight = document.querySelector('.bottom-text-right');
    if (!statusRight) return;

    statusRight.innerHTML = '';
    const checkingText = document.createElement('span');
    checkingText.textContent = this.t('statusBar.checkingConflicts');
    statusRight.appendChild(checkingText);
  }

  updateConflictStatus(conflictCount) {
    const statusRight = document.querySelector('.bottom-text-right');
    if (!statusRight) return;

    statusRight.innerHTML = '';

    if (conflictCount > 0) {
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
        document.querySelector('.bottom-text-left') ||
        document.querySelector('.bottom-text');
      if (statusText && !this.currentTab) {
        statusText.textContent = this.t('statusBar.ready');
      }
    }
    const statusRight = document.querySelector('.bottom-text-right');
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
