interface Download {
  id: string;
  url: string;
  fileName: string;
  status: 'downloading' | 'completed' | 'failed';
  progress: number;
  receivedBytes: number;
  totalBytes: number;
  startTime: number;
  endTime?: number;
  modName?: string;
  folderPath?: string | null;
  error?: string;
}

class DownloadManager {
  activeDownloads: Map<string, Download>;
  completedDownloads: any[];
  activeDownloadsList: HTMLElement | null;
  completedDownloadsList: HTMLElement | null;
  downloadsEmpty: HTMLElement | null;
  downloadsCount: HTMLElement | null;
  clearCompletedBtn: HTMLButtonElement | null;
  sendToSwitchBtn: HTMLButtonElement | null;
  initialized: boolean;

  ftpTransfer: {
    status: string;
    currentMod: number;
    totalMods: number;
    transferredCount: number;
  } | null;

  constructor() {
    this.activeDownloads = new Map();
    this.completedDownloads = [];
    this.activeDownloadsList = null;
    this.completedDownloadsList = null;
    this.downloadsEmpty = null;
    this.downloadsCount = null;
    this.clearCompletedBtn = null;
    this.sendToSwitchBtn = null;
    this.initialized = false;
    this.ftpTransfer = null;
  }

  initialize() {
    console.log('Initializing Download Manager...');

    this.activeDownloadsList = document.querySelector<HTMLElement>(
      '#active-downloads-list',
    );
    this.completedDownloadsList = document.querySelector<HTMLElement>(
      '#completed-downloads-list',
    );
    this.downloadsEmpty =
      document.querySelector<HTMLElement>('#downloads-empty');
    this.downloadsCount =
      document.querySelector<HTMLElement>('#downloads-count');
    this.clearCompletedBtn = document.querySelector<HTMLButtonElement>(
      '#clear-completed-btn',
    );
    this.sendToSwitchBtn = document.querySelector<HTMLButtonElement>(
      '#send-to-switch-btn',
    );

    if (!this.activeDownloadsList || !this.completedDownloadsList) {
      console.error('Download lists not found');
      return;
    }

    this.initialized = true;

    this.setupEventListeners();

    this.renderAllDownloads();

    this.updateUI();

    console.log('Download Manager initialized');
  }

  /**
   * Render all stored downloads (called when tab is opened)
   */
  renderAllDownloads() {
    if (this.activeDownloadsList) {
      this.activeDownloadsList.innerHTML = '';
    }
    if (this.completedDownloadsList) {
      this.completedDownloadsList.innerHTML = '';
    }

    this.activeDownloads.forEach((download) => {
      this.renderActiveDownload(download);
    });

    this.completedDownloads.forEach((download) => {
      this.renderCompletedDownload(download);
    });
  }

  setupEventListeners() {
    if (this.clearCompletedBtn) {
      this.clearCompletedBtn.addEventListener('click', () => {
        this.clearCompleted();
      });
    }

    if (this.sendToSwitchBtn) {
      this.sendToSwitchBtn.addEventListener('click', () => {
        this.sendToSwitch();
      });
    }
  }

  /**
   * Start a new download
   */
  startDownload(url: string, forcedId: string) {
    const downloadId = forcedId || Date.now().toString();

    const download: Download = {
      id: downloadId,
      url: url,
      fileName: this.extractFileName(url),
      status: 'downloading',
      progress: 0,
      receivedBytes: 0,
      totalBytes: 0,
      startTime: Date.now(),
    };

    this.activeDownloads.set(downloadId, download);

    if (this.initialized) {
      this.renderActiveDownload(download);
      this.updateUI();
    }

    this.updateBadge();

    if (window.statusBarManager) {
      window.statusBarManager.checkAndUpdateForDownloads();
    }

    return downloadId;
  }

  /**
   * Update download progress
   */
  updateProgress(downloadId, progress, receivedBytes, totalBytes) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      return;
    }

    download.progress = progress;
    download.receivedBytes = receivedBytes;
    download.totalBytes = totalBytes;

    const element = document.querySelector<HTMLElement>(
      `[data-download-id="${downloadId}"]`,
    );

    if (element) {
      const progressBar = element.querySelector<HTMLElement>(
        '.download-progress-fill',
      );
      const progressText = element.querySelector<HTMLElement>(
        '.download-progress-text',
      );

      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }

      if (progressText) {
        progressText.textContent = `${progress}% (${this.formatBytes(
          receivedBytes,
        )} / ${this.formatBytes(totalBytes)})`;
      }
    }
  }

  /**
   * Mark extracting phase
   */
  markExtracting(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return;
    const element = document.querySelector<HTMLElement>(
      `[data-download-id="${downloadId}"]`,
    );
    if (element) {
      const statusText = element.querySelector<HTMLElement>(
        '.download-status-text',
      );
      const progressText = element.querySelector<HTMLElement>(
        '.download-progress-text',
      );
      if (statusText)
        statusText.innerHTML = '<i class="bi bi-file-zip"></i> Extracting...';
      if (progressText) progressText.textContent = 'Processing...';
    }
  }

  /**
   * Complete a download
   */
  completeDownload(
    downloadId: string,
    modName: string | null,
    folderPath: string | null = null,
  ) {
    const download = this.activeDownloads.get(downloadId);

    if (!download) {
      const downloads = Array.from(this.activeDownloads.values());

      if (downloads.length > 0) {
        const latestDownload = downloads[downloads.length - 1];
        this.completeDownload(latestDownload.id, modName, folderPath);
      }

      return;
    }

    download.status = 'completed';
    download.progress = 100;
    download.modName = modName || download.fileName;
    download.folderPath = folderPath;
    download.endTime = Date.now();

    this.activeDownloads.delete(downloadId);
    this.completedDownloads.unshift(download);

    if (this.initialized) {
      const element = document.querySelector<HTMLElement>(
        `[data-download-id="${downloadId}"]`,
      );
      if (element) {
        element.remove();
      }

      this.renderCompletedDownload(download);
      this.updateUI();
    }

    this.updateBadge();

    if (window.statusBarManager) {
      window.statusBarManager.checkAndUpdateForDownloads();
    }
  }

  /**
   * Fail a download
   */
  failDownload(downloadId, error) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      const downloads = Array.from(this.activeDownloads.values());
      if (downloads.length > 0) {
        const latestDownload = downloads[downloads.length - 1];
        this.failDownload(latestDownload.id, error);
      }
      return;
    }

    download.status = 'failed';
    download.error = error;

    const element = document.querySelector<HTMLElement>(
      `[data-download-id="${downloadId}"]`,
    );
    if (element) {
      element.classList.add('download-failed');

      const statusText = element.querySelector<HTMLElement>(
        '.download-status-text',
      );

      if (statusText) {
        statusText.innerHTML = `<i class="bi bi-x-circle"></i> Failed: ${error}`;
        statusText.style.color = '#ff4444';
      }
    }

    setTimeout(() => {
      this.activeDownloads.delete(downloadId);
      if (element) {
        element.remove();
      }
      this.updateUI();
      this.updateBadge();

      if (window.statusBarManager) {
        window.statusBarManager.checkAndUpdateForDownloads();
      }
    }, 5000);
  }

  /**
   * Render active download
   */
  renderActiveDownload(download) {
    if (!this.activeDownloadsList) return;

    const element = document.createElement('div');
    element.className = 'download-item download-active';
    element.setAttribute('data-download-id', download.id);
    element.innerHTML = `
<div class="download-icon">
<i class="bi bi-download"></i>
</div>
<div class="download-info">
<div class="download-name">${download.fileName}</div>
<div class="download-url">${this.shortenUrl(download.url)}</div>
<div class="download-progress-container">
<div class="download-progress-bar">
<div class="download-progress-fill" style="width: ${download.progress}%"></div>
</div>
<div class="download-progress-text">0%</div>
</div>
<div class="download-status-text">Downloading...</div>
</div>
<div class="download-actions">
  <button class="download-action-btn" data-action="cancel" title="Cancel"><i class="bi bi-x-circle"></i></button>
</div>
`;

    // Add event listeners for action buttons
    const cancelBtn = element.querySelector<HTMLElement>(
      '[data-action="cancel"]',
    );

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () =>
        this.cancelDownload(download.id),
      );
    }

    this.activeDownloadsList.appendChild(element);
  }

  /**
   * Render completed download
   */
  renderCompletedDownload(download) {
    if (!this.completedDownloadsList) return;

    const element = document.createElement('div');
    element.className = 'download-item download-completed';
    element.setAttribute('data-download-id', download.id);

    // Safely format duration
    let duration = 'N/A';
    if (download.endTime && download.startTime) {
      try {
        duration = this.formatDuration(download.endTime - download.startTime);
      } catch (e) {
        console.warn('Error formatting duration:', e);
      }
    }

    // Safely format file size
    let fileSize = 'Unknown';
    if (download.totalBytes) {
      try {
        fileSize = this.formatBytes(download.totalBytes);
      } catch (e) {
        console.warn('Error formatting bytes:', e);
      }
    }

    element.innerHTML = `
    <div class="download-icon download-icon-success">
      <i class="bi bi-check-circle-fill"></i>
    </div>
    <div class="download-info">
      <div class="download-name">${download.modName || download.fileName}</div>
      <div class="download-url">${this.shortenUrl(download.url)}</div>
      <div class="download-meta">
        <span><i class="bi bi-check-circle"></i> Completed in ${duration}</span>
        <span><i class="bi bi-file-earmark-zip"></i> ${fileSize}</span>
      </div>
    </div>
  `;

    this.completedDownloadsList.appendChild(element);
  }

  /**
   * Update UI visibility
   */
  updateUI() {
    const hasActiveDownloads = this.activeDownloads.size > 0;
    const hasCompletedDownloads = this.completedDownloads.length > 0;
    const hasAnyDownloads = hasActiveDownloads || hasCompletedDownloads;

    if (this.downloadsEmpty) {
      this.downloadsEmpty.style.display = hasAnyDownloads ? 'none' : 'flex';
    }

    const activeSections = document.querySelector<HTMLElement>(
      '#active-downloads-section',
    );
    const completedSections = document.querySelector<HTMLElement>(
      '#completed-downloads-section',
    );

    if (activeSections) {
      activeSections.style.display = hasActiveDownloads ? 'block' : 'none';
    }

    if (completedSections) {
      completedSections.style.display = hasCompletedDownloads
        ? 'block'
        : 'none';
    }

    if (this.downloadsCount) {
      const totalCount =
        this.activeDownloads.size + this.completedDownloads.length;

      this.downloadsCount.textContent = `${totalCount}`;
    }

    if (this.clearCompletedBtn) {
      this.clearCompletedBtn.style.display = hasCompletedDownloads
        ? 'block'
        : 'none';
    }
  }

  /**
   * Update notification badge
   */
  updateBadge() {
    const downloadsBtn = document.querySelector<HTMLElement>(
      '[data-tab="downloads"]',
    );
    if (!downloadsBtn) return;

    let badge = downloadsBtn.querySelector<HTMLElement>('.notification-badge');

    if (this.activeDownloads.size > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'notification-badge';
        downloadsBtn.style.position = 'relative';
        downloadsBtn.appendChild(badge);
      }

      badge.textContent = `${this.activeDownloads.size}`;
      badge.style.display = 'flex';
    } else {
      if (badge) {
        badge.style.display = 'none';
      }
    }
  }

  /**
   * Switch to downloads tab
   */
  switchToDownloadsTab() {
    const downloadsBtn = document.querySelector<HTMLElement>(
      '[data-tab="downloads"]',
    );

    if (downloadsBtn) {
      downloadsBtn.click();
    }
  }

  /**
   * Clear completed downloads
   */
  clearCompleted() {
    this.completedDownloads = [];
    if (this.completedDownloadsList) {
      this.completedDownloadsList.innerHTML = '';
    }
    this.updateUI();
  }

  /**
   * Extract filename from URL
   */
  extractFileName(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
      return filename || 'mod.zip';
    } catch {
      return 'mod.zip';
    }
  }

  /**
   * Shorten URL for display
   */
  shortenUrl(url) {
    if (url.length > 60) {
      return url.substring(0, 57) + '...';
    }
    return url;
  }

  /**
   * Format bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Send newly installed mods to Switch via FTP
   */
  async sendToSwitch() {
    // Check if Switch settings are configured
    if (!window.settingsManager || !window.settingsManager.hasSwitchConfig()) {
      if (window.toastManager) {
        window.toastManager.error('toasts.switchSettingsNotConfigured');
      } else {
        alert('Please configure Switch settings in Settings > Advanced');
      }
      return;
    }

    const transferMethod = window.settingsManager.getSwitchTransferMethod();

    if (transferMethod === 'none') {
      if (window.toastManager) {
        window.toastManager.error('toasts.switchSettingsNotConfigured');
      } else {
        alert('Please configure Switch transfer method in Settings > Advanced');
      }
      return;
    }

    const switchIp = window.settingsManager.getSwitchIp();
    const switchPort = parseInt(window.settingsManager.getSwitchPort());
    const switchFtpPath =
      window.settingsManager.getSwitchFtpPath() || '/switch';
    const switchDriveLetter = window.settingsManager.getSwitchDriveLetter();

    // Get mods path
    if (!window.settingsManager || !window.settingsManager.hasModsPath()) {
      if (window.toastManager) {
        window.toastManager.error('toasts.modsFolderPathNotSet');
      } else {
        alert('Please set the mods folder path in Settings');
      }
      return;
    }

    const modsPath = window.settingsManager.getModsPath();

    // Get all recently completed downloads (newly installed mods)
    const recentMods = this.completedDownloads.filter((download) => {
      // Only include downloads completed in the last 24 hours
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      return download.endTime && download.endTime > oneDayAgo;
    });

    if (recentMods.length === 0) {
      if (window.toastManager) {
        window.toastManager.info('toasts.noRecentDownloads');
      }
    }

    // Call the Electron API to send mods to Switch
    if (!window.electronAPI || !window.electronAPI.sendModsToSwitch) {
      if (window.toastManager) {
        window.toastManager.error('toasts.ftpNotAvailable');
      } else {
        alert('FTP functionality not available');
      }
      console.error('Electron API sendModsToSwitch not available');
      return;
    }

    try {
      if (this.sendToSwitchBtn) {
        this.sendToSwitchBtn.disabled = true;
        const t = (key) =>
          window.i18n && window.i18n.t ? window.i18n.t(key) : key;
        this.sendToSwitchBtn.innerHTML = `<i class="bi bi-arrow-clockwise"></i> ${t(
          'downloads.sending',
        )}`;
      }

      // Update FTP transfer status
      this.ftpTransfer = {
        status: 'uploading',
        currentMod: 0,
        totalMods: recentMods.length || 0,
        transferredCount: 0,
      };

      if (window.statusBarManager) {
        window.statusBarManager.checkAndUpdateForDownloads();
      }

      if (window.toastManager) {
        window.toastManager.info('toasts.startingFtpTransfer');
      }

      const result = await window.electronAPI.sendModsToSwitch({
        switchTransferMethod: transferMethod,
        switchIp,
        switchPort,
        switchFtpPath,
        switchDriveLetter,
        modsPath,
        recentMods: recentMods.map((m) => ({
          id: m.id,
          modName: m.modName || m.fileName,
          folderPath: m.folderPath || null,
        })),
      });

      if (this.sendToSwitchBtn) {
        this.sendToSwitchBtn.disabled = false;
        const t = (key) =>
          window.i18n && window.i18n.t ? window.i18n.t(key) : key;
        this.sendToSwitchBtn.innerHTML = `<i class="bi bi-device-hdd"></i> ${t(
          'downloads.sendToSwitch',
        )}`;
      }

      // Clear FTP transfer status
      this.ftpTransfer = null;

      if (result.success) {
        if (window.toastManager) {
          window.toastManager.success('toasts.modsSentToSwitch', 3000, {
            count: result.transferredCount || 0,
          });
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToSendMods', 3000, {
            error: result.error || 'Unknown error',
          });
        } else {
          alert(`Failed to send mods: ${result.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Error sending mods to Switch:', error);
      if (this.sendToSwitchBtn) {
        this.sendToSwitchBtn.disabled = false;
        const t = (key) =>
          window.i18n && window.i18n.t ? window.i18n.t(key) : key;
        this.sendToSwitchBtn.innerHTML = `<i class="bi bi-device-hdd"></i> ${t(
          'downloads.sendToSwitch',
        )}`;
      }
      this.ftpTransfer = null;
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToSendMods', 3000, {
          error: error.message,
        });
      } else {
        alert(`Error: ${error.message}`);
      }
    }

    if (window.statusBarManager) {
      window.statusBarManager.checkAndUpdateForDownloads();
    }
  }

  /**
   * Cancel a download
   */
  cancelDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) return;

    // Call main process to cancel download
    if (window.electronAPI && window.electronAPI.cancelDownload) {
      window.electronAPI.cancelDownload(downloadId);
    }

    this.activeDownloads.delete(downloadId);

    const element = document.querySelector<HTMLElement>(
      `[data-download-id="${downloadId}"]`,
    );
    if (element) {
      element.classList.add('download-failed');
      const statusText = element.querySelector<HTMLElement>(
        '.download-status-text',
      );
      if (statusText) {
        statusText.innerHTML = '<i class="bi bi-x-circle"></i> Cancelled';
        statusText.style.color = '#ef4444';
      }
    }

    setTimeout(() => {
      if (element && element.parentElement) {
        element.remove();
      }
      this.updateUI();
      this.updateBadge();
    }, 2000);

    if (window.toastManager) {
      window.toastManager.warning('toasts.downloadCancelled');
    }
  }
}

if (typeof window !== 'undefined') {
  window.downloadManager = new DownloadManager();
  console.log('Download Manager created');
}

export { type DownloadManager };
