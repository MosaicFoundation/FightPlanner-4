class ModDragDropHandler {
  dragOverlay: HTMLElement | null;
  isDragging: boolean;
  dragAnimation: gsap.core.Timeline | null;

  constructor() {
    this.dragOverlay = null;
    this.isDragging = false;
    this.dragAnimation = null;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupWindowDropListener();
  }

  setupWindowDropListener() {}

  setupEventListeners() {
    document.addEventListener('dragover', (e) => this.handleDragOver(e));
    document.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    document.addEventListener('drop', (e) => this.handleDrop(e));
  }

  isToolsTabActive() {
    const activeTab = document.querySelector<HTMLElement>(
      '.tab-content.active',
    );

    return activeTab && activeTab.id === 'tab-tools';
  }

  createDragOverlay() {
    if (this.dragOverlay) return this.dragOverlay;

    this.dragOverlay = document.createElement('div');
    this.dragOverlay.id = 'drag-overlay';
    this.dragOverlay.className = 'drag-overlay';

    const container = document.createElement('div');
    container.className = 'drag-overlay-container';

    const icon = document.createElement('div');
    icon.className = 'drag-overlay-icon';
    icon.innerHTML = '<i class="bi bi-cloud-upload"></i>';

    const text = document.createElement('div');
    text.className = 'drag-overlay-text';
    text.textContent = 'Drop mod here';

    const subtitle = document.createElement('div');
    subtitle.className = 'drag-overlay-subtitle';
    subtitle.textContent = 'Supports: ZIP, RAR, 7Z, folders';

    container.appendChild(icon);
    container.appendChild(text);
    container.appendChild(subtitle);
    this.dragOverlay.appendChild(container);
    document.body.appendChild(this.dragOverlay);

    return this.dragOverlay;
  }

  showDragOverlay() {
    const overlay = this.createDragOverlay();
    overlay.style.display = 'flex';

    if (this.dragAnimation) {
      this.dragAnimation.kill();
    }

    this.dragAnimation = gsap.timeline();
    this.dragAnimation.to(overlay, {
      opacity: 1,
      duration: 0.3,
      ease: 'power2.out',
    });

    this.dragAnimation.to(
      overlay,
      {
        boxShadow: '0 0 30px rgba(74, 158, 255, 0.6)',
        duration: 0.8,
        repeat: -1,
        yoyo: true,
        ease: 'power1.inOut',
      },
      0,
    );

    const iconContainer =
      overlay.querySelector<HTMLElement>('.drag-overlay-icon');
    const iconElement = iconContainer
      ? iconContainer.querySelector<HTMLElement>('i')
      : null;
    const text = overlay.querySelector<HTMLElement>('.drag-overlay-text');
    const subtitle = overlay.querySelector<HTMLElement>(
      '.drag-overlay-subtitle',
    );

    if (iconContainer && iconElement) {
      this.dragAnimation.to(
        iconContainer,
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.4,
          ease: 'back.out(1.7)',
        },
        0.1,
      );

      this.dragAnimation.to(
        iconElement,
        {
          y: -10,
          duration: 1.5,
          repeat: -1,
          yoyo: true,
          ease: 'power1.inOut',
        },
        0.5,
      );
    }

    if (text) {
      this.dragAnimation.to(
        text,
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power2.out',
        },
        0.2,
      );
    }

    if (subtitle) {
      this.dragAnimation.to(
        subtitle,
        {
          opacity: 0.8,
          y: 0,
          duration: 0.4,
          ease: 'power2.out',
        },
        0.3,
      );
    }
  }

  hideDragOverlay() {
    if (!this.dragOverlay) return;

    if (this.dragAnimation) {
      this.dragAnimation.kill();
    }

    this.dragAnimation = gsap.timeline({
      onComplete: () => {
        if (this.dragOverlay) {
          this.dragOverlay.style.display = 'none';
        }
      },
    });

    this.dragAnimation.to(this.dragOverlay, {
      opacity: 0,
      duration: 0.2,
      ease: 'power2.in',
    });
  }

  handleDragOver(e) {
    if (!this.isToolsTabActive()) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (!this.isDragging) {
      this.isDragging = true;
      this.showDragOverlay();
    }
  }

  handleDragLeave(e) {
    if (!this.isToolsTabActive()) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.clientX === 0 && e.clientY === 0) {
      this.isDragging = false;
      this.hideDragOverlay();
    }
  }

  async handleDrop(e) {
    if (!this.isToolsTabActive()) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    this.isDragging = false;
    this.hideDragOverlay();

    const files: File[] = Array.from(e.dataTransfer.files);

    if (files.length === 0) {
      return;
    }

    const filePaths: string[] = [];

    for (const file of files) {
      try {
        const filePath = window.electronAPI.getPathForFile(file);

        if (filePath) {
          filePaths.push(filePath);
        }
      } catch (error) {
        console.error('Error getting file path:', error);
      }
    }

    if (filePaths.length === 0) {
      if (window.toastManager) {
        window.toastManager.error('toasts.couldNotAccessFilePaths');
      }
      return;
    }

    try {
      const modsPath = await window.electronAPI.store.get('modsPath');
      if (!modsPath) {
        if (window.toastManager) {
          window.toastManager.error('toasts.modsFolderNotConfigured');
        }
        return;
      }

      if (window.toastManager) {
        window.toastManager.info('toasts.installingFiles', 3000, {
          count: filePaths.length,
        });
      }

      for (const filePath of filePaths) {
        try {
          const result = await window.electronAPI.installModFromPath(
            filePath,
            modsPath,
          );
          if (result && result.success) {
            if (window.toastManager) {
              window.toastManager.success(
                'toasts.modInstalledSuccessfully',
                3000,
                { name: result.modName },
              );
            }

            setTimeout(() => {
              if (window.modManager) {
                window.modManager.fetchMods();
              }
            }, 500);
          } else {
            if (window.toastManager) {
              window.toastManager.error('toasts.installationError', 3000, {
                error: result?.error || 'Unknown error',
              });
            }
          }
        } catch (error) {
          if (window.toastManager) {
            window.toastManager.error('toasts.errorInstallingMod', 3000, {
              error: error.message,
            });
          }
        }
      }
    } catch (error) {
      if (window.toastManager) {
        window.toastManager.error(`Error: ${error.message}`);
      }
    }
  }
}

window.modDragDropHandler = new ModDragDropHandler();

export { type ModDragDropHandler };
