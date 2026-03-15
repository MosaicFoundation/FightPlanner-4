export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) { console.error('[install-confirm-modal] ModalManagerClass not found'); return; }

  M.prototype.openInstallConfirmModal = async function (url, downloadId, modId, modType = 'Mod') {
  this.installQueue.push({ url, downloadId, modId, modType });

  if (this.installQueue.length === 1) {
    await this._showInstallModal();
  } else {
    this._updateInstallQueueUI();
  }
};

M.prototype._showInstallModal = async function () {
  const item = this.installQueue[0];
  if (!item) return;

  const urlDisplay = document.querySelector<HTMLElement>('#install-url-display');
  if (urlDisplay) {
    urlDisplay.textContent = item.url;
  }

  const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
  if (modal) {
    modal.classList.remove('closing');
    this.showOverlay();
    modal.style.display = 'block';
  }

  const previewContainer = document.querySelector<HTMLElement>('#install-preview-container');
  if (previewContainer) {
    previewContainer.style.display = item.modType === 'Sound' ? 'none' : 'flex';
  }

  const previewImage = document.querySelector<HTMLImageElement>('#install-preview-image');
  const previewLoading = document.querySelector<HTMLElement>('.install-preview-loading');

  if (previewImage) {
    previewImage.src = '';
    previewImage.style.display = 'none';
    previewImage.classList.remove('loaded');
  }
  if (previewLoading) {
    previewLoading.style.display = 'flex';
  }

  if (item.modId && item.modType !== 'Sound' && window.electronAPI?.fetchGameBananaPreview) {
    try {
      const result = await window.electronAPI.fetchGameBananaPreview(item.modId);
      if (result.success && result.imageUrl) {
        previewImage!.onload = () => {
          previewImage!.classList.add('loaded');
          if (previewLoading) previewLoading.style.display = 'none';
        };
        previewImage!.src = result.imageUrl;
        previewImage!.style.display = 'block';
      } else {
        if (previewLoading) previewLoading.style.display = 'none';
      }
    } catch (error) {
      console.error('[_showInstallModal] Failed to fetch preview:', error);
      if (previewLoading) previewLoading.style.display = 'none';
    }
  } else if (item.modType === 'Sound') {
    if (previewLoading) previewLoading.style.display = 'none';
  }

  this._updateInstallQueueUI();
};

M.prototype._updateInstallQueueUI = function () {
  const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
  if (!modal) return;

  const total = this.installQueue.length;

  let badge = modal.querySelector<HTMLElement>('.install-queue-badge');
  if (total > 1) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'install-queue-badge';
      const header = modal.querySelector('.modal-header h3');
      if (header) header.appendChild(badge);
    }
    badge.textContent = `1 / ${total}`;
    badge.style.display = 'inline-flex';
  } else if (badge) {
    badge.style.display = 'none';
  }

  let cancelAllBtn = modal.querySelector<HTMLElement>('#install-cancel-all-btn');
  if (total > 1) {
    if (cancelAllBtn) cancelAllBtn.style.display = 'inline-flex';
  } else if (cancelAllBtn) {
    cancelAllBtn.style.display = 'none';
  }

  const existingCards = Array.from(document.querySelectorAll('.install-stack-card'));

  if (total > 1) {
    const cardsToShow = Math.min(total - 1, 2);
    
    // Remove excess cards
    for (let i = cardsToShow; i < existingCards.length; i++) {
        existingCards[i].remove();
    }

    for (let i = 1; i <= cardsToShow; i++) {
      const item = this.installQueue[i];
      if (!item) continue;

      let card = document.querySelector(`.install-stack-card-${i}`) as HTMLElement;
      let isNew = false;
      if (!card) {
          card = modal.cloneNode(true) as HTMLElement;
          card.removeAttribute('id');
          card.className = `modal install-stack-card install-stack-card-${i} install-stack-card-enter`;
          modal.parentElement?.insertBefore(card, modal);
          isNew = true;
          setTimeout(() => {
            card.classList.remove('install-stack-card-enter');
          }, 400);
      }

      const urlDisplay = card.querySelector('.install-url-display');
      if (urlDisplay) urlDisplay.textContent = item.url;

      const cardBadge = card.querySelector('.install-queue-badge');
      if (cardBadge) cardBadge.textContent = `${i + 1} / ${total}`;

      const cardPreviewContainer = card.querySelector('.install-preview-container') as HTMLElement;
      const cardPreviewImage = card.querySelector('.install-preview-image') as HTMLImageElement;
      const cardPreviewLoading = card.querySelector('.install-preview-loading') as HTMLElement;

      if (cardPreviewContainer) {
        cardPreviewContainer.style.display = item.modType === 'Sound' ? 'none' : 'flex';
      }
      if (isNew) {
        if (cardPreviewImage) {
          cardPreviewImage.src = '';
          cardPreviewImage.style.display = 'none';
          cardPreviewImage.classList.remove('loaded');
          cardPreviewImage.removeAttribute('id');
        }
        if (cardPreviewLoading) {
          cardPreviewLoading.style.display = 'flex';
        }

        if (item.modId && item.modType !== 'Sound' && window.electronAPI?.fetchGameBananaPreview) {
          window.electronAPI.fetchGameBananaPreview(item.modId).then(result => {
            if (result.success && result.imageUrl) {
              cardPreviewImage.onload = () => {
                cardPreviewImage.classList.add('loaded');
                if (cardPreviewLoading) cardPreviewLoading.style.display = 'none';
              };
              cardPreviewImage.src = result.imageUrl;
              cardPreviewImage.style.display = 'block';
            } else {
              if (cardPreviewLoading) cardPreviewLoading.style.display = 'none';
            }
          }).catch(() => {
            if (cardPreviewLoading) cardPreviewLoading.style.display = 'none';
          });
        }
      }
    }
  } else {
    existingCards.forEach(c => c.remove());
  }
};

M.prototype._clearInstallQueueUI = function () {
  const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
  if (modal) {
    const badge = modal.querySelector<HTMLElement>('.install-queue-badge');
    if (badge) badge.style.display = 'none';

    const cancelAllBtn = modal.querySelector<HTMLElement>('#install-cancel-all-btn');
    if (cancelAllBtn) cancelAllBtn.style.display = 'none';
  }

  document.querySelectorAll('.install-stack-card').forEach((c) => c.remove());
};

M.prototype._resetInstallPreview = function () {
  const previewContainer = document.querySelector<HTMLElement>('#install-preview-container');
  const previewImage = document.querySelector<HTMLImageElement>('#install-preview-image');
  const previewLoading = document.querySelector<HTMLElement>('.install-preview-loading');

  if (previewContainer) previewContainer.style.display = 'flex';
  if (previewImage) {
    previewImage.src = '';
    previewImage.style.display = 'none';
    previewImage.classList.remove('loaded');
  }
  if (previewLoading) previewLoading.style.display = 'flex';
};

M.prototype.closeInstallConfirmModal = function () {
  this._clearInstallQueueUI();
  this._removeBubble();

  this.closeModal('install-confirm-modal', {
    onModalClosed: () => {
      this._resetInstallPreview();
    },
  });

  this.installQueue = [];
  this.confirmedInstalls = [];
};

M.prototype._getOrCreateBubble = function (): HTMLElement {
  let bubble = document.querySelector<HTMLElement>('#install-confirm-bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.id = 'install-confirm-bubble';
    bubble.className = 'install-confirm-bubble';
    bubble.textContent = '0';
    document.body.appendChild(bubble);
  }
  return bubble;
};

M.prototype._advanceInstallQueue = function (useDynamicIsland = false) {
  this.installQueue.shift();

  if (this.installQueue.length > 0) {
    const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
    if (!modal) { this._showInstallModal(); return; }

    const noAnimations = document.body.classList.contains('no-animations');

    const bubble = this._getOrCreateBubble();
    bubble.style.display = 'flex';

    if (useDynamicIsland) {
      const count = this.confirmedInstalls ? this.confirmedInstalls.length : 0;
      bubble.textContent = `${count}`;
      bubble.classList.add('install-bubble-pop');
      setTimeout(() => bubble.classList.remove('install-bubble-pop'), 300);
    }

    if (noAnimations) {
      modal.style.display = 'none';
      this._showInstallModal();
      return;
    }

    modal.classList.add('install-slide-out-top-right');

    setTimeout(() => {
      modal.style.display = 'none';
      modal.classList.remove('install-slide-out-top-right');
      modal.classList.add('install-slide-in-right');
      this._showInstallModal();

      setTimeout(() => {
        modal.classList.remove('install-slide-in-right');
      }, 400);
    }, 350);
  } else {
    this._clearInstallQueueUI();

    if (useDynamicIsland && this.confirmedInstalls && this.confirmedInstalls.length > 0) {
      this._launchAllConfirmedInstalls();
      this._animateModalToStatusBar();

      setTimeout(() => {
        this._animateBubbleToStatusBar();
      }, 300);
    } else {
      this._removeBubble();
      this.closeModal('install-confirm-modal', {
        onModalClosed: () => {
          this._resetInstallPreview();
        },
      });
    }
  }
};

M.prototype._removeBubble = function () {
  const bubble = document.querySelector<HTMLElement>('#install-confirm-bubble');
  if (bubble) bubble.remove();
};

M.prototype._animateBubbleToStatusBar = function () {
  const bubble = document.querySelector<HTMLElement>('#install-confirm-bubble');
  const statusBar = document.getElementById('main-status-bar');
  if (!bubble || !statusBar) {
    this._removeBubble();
    return;
  }

  const gsapRef = (window as any).gsap;
  if (!gsapRef) {
    this._removeBubble();
    return;
  }

  const statusBarRect = statusBar.getBoundingClientRect();

  gsapRef.to(bubble, {
    duration: 0.4,
    left: statusBarRect.left + statusBarRect.width / 2,
    top: statusBarRect.top + statusBarRect.height / 2,
    scale: 0.3,
    opacity: 0,
    ease: 'power3.in',
    onComplete: () => {
      bubble.remove();
    },
  });
};

M.prototype._launchAllConfirmedInstalls = function () {
  if (!this.confirmedInstalls) return;

  for (const item of this.confirmedInstalls) {
    if (window.electronAPI?.confirmProtocolInstall) {
      window.electronAPI.confirmProtocolInstall(item.url, item.downloadId).catch((error) => {
        console.error('[_launchAllConfirmedInstalls] Error confirming install:', error);
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToStartInstallation');
        }
      });
    }
  }

  this.confirmedInstalls = [];
};

M.prototype._animateModalToStatusBar = function () {
  const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
  const statusBar = document.getElementById('main-status-bar');
  if (!modal || !statusBar) {
    this.closeModal('install-confirm-modal', {
      onModalClosed: () => this._resetInstallPreview(),
    });
    return;
  }

  const noAnimations = document.body.classList.contains('no-animations');
  if (noAnimations) {
    this.closeModal('install-confirm-modal', {
      onModalClosed: () => this._resetInstallPreview(),
    });
    return;
  }

  if (window.statusBarManager) {
    window.statusBarManager.pendingDynamicIsland = true;
    const bottomBar = document.getElementById('main-status-bar');
    if (bottomBar) {
      bottomBar.classList.remove('expanded');
      const extContent = bottomBar.querySelector('.extended-content') as HTMLElement;
      if (extContent) extContent.style.display = 'none';
    }
  }

  modal.style.animation = 'none';
  modal.style.transition = 'none';
  modal.style.overflow = 'hidden';

  const statusBarRect = statusBar.getBoundingClientRect();
  const targetX = statusBarRect.left + 210;
  const targetY = statusBarRect.top;

  const overlay = document.querySelector<HTMLElement>('#modal-overlay');

  const gsapRef = (window as any).gsap;

  gsapRef.set(modal, {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
  });

  const self = this;

  const tl = gsapRef.timeline({
    onComplete: () => {
      modal.style.display = 'none';
      modal.removeAttribute('style');
      modal.style.display = 'none';
      self._resetInstallPreview();

      if (overlay) {
        overlay.style.display = 'none';
        overlay.removeAttribute('style');
        overlay.style.display = 'none';
      }

      const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '90,90,122';
      gsapRef.fromTo(statusBar, {
        boxShadow: `0 -2px 25px 6px rgba(${accentRgb}, 0.6)`,
        filter: 'brightness(1.2)',
      }, {
        duration: 0.8,
        boxShadow: `0 -2px 0px 0px rgba(${accentRgb}, 0)`,
        filter: 'brightness(1)',
        ease: 'power2.out',
        onComplete: () => {
          statusBar.style.boxShadow = '';
          statusBar.style.filter = '';
        },
      });

      setTimeout(() => {
        if (window.statusBarManager) {
          window.statusBarManager.pendingDynamicIsland = false;
          window.statusBarManager.userDismissedExtendedBar = false;
          window.statusBarManager.checkActiveDownloads();
        }
      }, 200);
    },
  });

  tl.to(modal, {
    duration: 0.45,
    top: targetY,
    left: targetX,
    scale: 0.12,
    borderRadius: '24px',
    opacity: 0.7,
    filter: 'blur(2px)',
    ease: 'power3.in',
  });

  tl.to(modal, {
    duration: 0.12,
    opacity: 0,
    scale: 0.05,
    filter: 'blur(12px)',
    ease: 'power2.in',
  });

  if (overlay) {
    overlay.style.animation = 'none';
    overlay.style.transition = 'none';
    gsapRef.to(overlay, {
      duration: 0.4,
      opacity: 0,
      ease: 'power2.inOut',
    });
  }
};

M.prototype.confirmInstall = function () {
  const item = this.installQueue[0];
  if (!item) return;

  if (!this.confirmedInstalls) this.confirmedInstalls = [];
  this.confirmedInstalls.push(item);

  this._advanceInstallQueue(true);
};

M.prototype.cancelInstallConfirm = function () {
  const item = this.installQueue[0];
  if (item && window.electronAPI?.cancelProtocolInstall) {
    window.electronAPI.cancelProtocolInstall(item.downloadId);
  }
  this._advanceInstallQueue();
};

M.prototype.cancelAllInstalls = function () {
  for (const item of this.installQueue) {
    if (window.electronAPI?.cancelProtocolInstall) {
      window.electronAPI.cancelProtocolInstall(item.downloadId);
    }
  }

  if (this.confirmedInstalls) {
    for (const item of this.confirmedInstalls) {
      if (window.electronAPI?.cancelProtocolInstall) {
        window.electronAPI.cancelProtocolInstall(item.downloadId);
      }
    }
    this.confirmedInstalls = [];
  }

  this.closeInstallConfirmModal();
};
})();

