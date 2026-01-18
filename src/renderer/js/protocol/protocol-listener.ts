class ProtocolListener {
  idMap: Map<string, string>;

  constructor() {
    this.idMap = new Map();
    this.setupListeners();
  }

  setupListeners() {
    if (!window.electronAPI) {
      console.error('Electron API not available');
      return;
    }

    window.electronAPI.onModInstallStart((data) => {
      console.log('Mod installation started:', data);

      if (window.downloadManager) {
        const rendererId = window.downloadManager.startDownload(
          data.url,
          data.downloadId,
        );
        this.idMap.set(data.downloadId, rendererId);

        if (data.modName && window.downloadManager.activeDownloads) {
          const download =
            window.downloadManager.activeDownloads.get(rendererId);
          if (download) {
            download.modName = data.modName;
          }
        }
      }

      if (window.toastManager) {
        window.toastManager.info('toasts.downloadStarted');
      }
    });

    window.electronAPI.onModDownloadProgress((data) => {
      if (window.downloadManager && data.downloadId) {
        const rendererId = this.idMap.get(data.downloadId) || data.downloadId;
        window.downloadManager.updateProgress(
          rendererId,
          data.progress,
          data.receivedBytes,
          data.totalBytes,
        );
      }
    });

    window.electronAPI.onModExtractStart((data) => {
      if (window.downloadManager && data.downloadId) {
        const rendererId = this.idMap.get(data.downloadId) || data.downloadId;
        window.downloadManager.markExtracting(rendererId);
      }
    });
    window.electronAPI.onModExtractComplete((data) => {
      if (window.downloadManager && data.downloadId) {
        const rendererId = this.idMap.get(data.downloadId) || data.downloadId;
        window.downloadManager.updateProgress(rendererId, 100, 0, 0);
      }
    });

    window.electronAPI.onModInstallSuccess((data) => {
      console.log('Mod installed successfully:', data);

      if (window.downloadManager) {
        const rendererId = this.idMap.get(data.downloadId) || data.downloadId;
        window.downloadManager.completeDownload(
          rendererId,
          data.modName,
          data.folderPath,
        );
      }

      if (window.toastManager) {
        window.toastManager.success('toasts.modInstalledSuccess');
      }

      setTimeout(() => {
        if (window.modManager) {
          console.log('Refreshing mod list...');
          window.modManager.fetchMods();
        }
      }, 500);

      if (data.downloadId) this.idMap.delete(data.downloadId);
    });

    window.electronAPI.onModInstallError((data) => {
      console.error('Mod installation failed:', data);

      if (window.downloadManager && data.downloadId) {
        const rendererId = this.idMap.get(data.downloadId) || data.downloadId;
        window.downloadManager.failDownload(rendererId, data.error);
      }

      if (window.toastManager) {
        window.toastManager.error('toasts.installationFailed', 3000, {
          error: data.error,
        });
      }

      if (data.downloadId) this.idMap.delete(data.downloadId);
    });
  }
}

if (typeof window !== 'undefined') {
  window.protocolListener = new ProtocolListener();
  console.log('Protocol Listener initialized');
}

export { type ProtocolListener };
