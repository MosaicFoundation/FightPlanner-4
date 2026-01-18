class ToastManager {
  container: HTMLElement | null;
  toasts: HTMLElement[];
  toastHistory: Map<string, number>;
  toastCooldown: number;
  groupedToasts: Map<string, any>;
  groupTimeout: number | null;

  constructor() {
    this.container = null;
    this.toasts = [];
    this.toastHistory = new Map();
    this.toastCooldown = 2000;
    this.groupedToasts = new Map();
    this.groupTimeout = null;

    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () =>
        this.setupContainer(),
      );
    } else {
      this.setupContainer();
    }
  }

  setupContainer() {
    this.container = document.querySelector<HTMLElement>('#toast-container');
    if (!this.container) {
      console.warn('Toast container not found');
    }
  }

  /**
   * Translate message if it's a translation key, otherwise return as-is
   * @param {string} message - Message or translation key
   * @param {object} params - Parameters for translation
   * @returns {string} Translated message
   */
  translateMessage(message, params = {}) {
    if (!message) return '';

    // Check if message is a translation key (starts with "toasts.")
    if (message.startsWith('toasts.')) {
      if (window.i18n && window.i18n.t) {
        let translated = window.i18n.t(message, params);
        return translated || message;
      }
      // If i18n not available, return message as-is (fallback)
      return message;
    }

    // If not a translation key, return message as-is
    // But still replace params if they exist
    if (params && Object.keys(params).length > 0) {
      let result = message;
      for (const [key, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
      return result;
    }

    return message;
  }

  /**
   * @param {string} type - Type of toast: 'success', 'error', 'warning', 'info'
   * @param {string} message - Message to display or translation key (e.g., "toasts.modInstalledSuccessfully")
   * @param {number} duration - Duration in ms (default: 3000)
   * @param {object} params - Parameters for translation (e.g., {name: "MyMod", error: "Error message"})
   * @param {object} options - Additional options (e.g., {actionButton: {text: "View Logs", onClick: () => {}}})
   */
  show(
    type,
    message,
    duration = 3000,
    params = {},
    options: { actionButton?: { text: string; onClick?: () => void } } = {},
  ) {
    if (!this.container) {
      this.setupContainer();
      if (!this.container) {
        console.error('Cannot show toast: container not found');
        return;
      }
    }

    const translatedMessage =
      this.translateMessage(message, params) || message || '';
    if (!translatedMessage) {
      console.warn('Toast message is empty, skipping');
      return;
    }
    const toastKey = `${type}:${translatedMessage}`;
    const now = Date.now();

    if (this.toastHistory.has(toastKey)) {
      const lastShown = this.toastHistory.get(toastKey);
      const timeSince = now - lastShown!;

      if (timeSince < this.toastCooldown) {
        console.log(
          '[Toast] Skipping duplicate toast (shown',
          timeSince,
          'ms ago):',
          message,
        );
        return;
      }
    }

    this.toastHistory.set(toastKey, now);

    for (const [key, timestamp] of this.toastHistory.entries()) {
      if (now - timestamp > 10000) {
        this.toastHistory.delete(key);
      }
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = '';
    switch (type) {
      case 'success':
        icon = '<i class="bi bi-check-circle-fill"></i>';
        break;
      case 'error':
        icon = '<i class="bi bi-x-circle-fill"></i>';
        break;
      case 'warning':
        icon = '<i class="bi bi-exclamation-triangle-fill"></i>';
        break;
      case 'info':
        icon = '<i class="bi bi-info-circle-fill"></i>';
        break;
    }

    let actionButtonHtml = '';
    if (options.actionButton) {
      const actionText = options.actionButton.text || 'Action';
      actionButtonHtml = `<button class="toast-action-btn">${this.escapeHtml(actionText)}</button>`;
    }

    toast.innerHTML = `
${icon}
<span class="toast-message">${this.escapeHtml(translatedMessage)}</span>
${actionButtonHtml}
<button class="toast-close">
<i class="bi bi-x"></i>
</button>
`;

    this.container.appendChild(toast);
    this.toasts.push(toast);

    const closeBtn = toast.querySelector<HTMLElement>('.toast-close');
    closeBtn!.addEventListener('click', () => this.hide(toast));

    const onClick = options.actionButton?.onClick;

    if (onClick) {
      const actionBtn = toast.querySelector<HTMLElement>('.toast-action-btn');

      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          onClick();
          this.hide(toast);
        });
      }
    }

    setTimeout(() => {
      toast.classList.add('toast-show');
    }, 10);

    setTimeout(() => {
      this.hide(toast);
    }, duration);
  }

  hide(toast) {
    if (!toast || !toast.parentElement) return;

    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');

    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }

      const index = this.toasts.indexOf(toast);
      if (index > -1) {
        this.toasts.splice(index, 1);
      }
    }, 320);
  }

  success(message, duration?, params?, options?) {
    this.show('success', message, duration, params, options);
  }

  error(message, duration?, params?, options?) {
    this.show('error', message, duration, params, options);
  }

  warning(message, duration?, params?, options?) {
    this.show('warning', message, duration, params, options);
  }

  info(message, duration?, params?, options?) {
    this.show('info', message, duration, params, options);
  }

  /**
   * Clear all toasts
   */
  clear() {
    this.toasts.forEach((toast) => {
      if (toast.parentElement) {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(() => {
          if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
          }
        }, 300);
      }
    });
    this.toasts = [];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  window.toastManager = new ToastManager();
  console.log('Toast Manager initialized');
}

export { type ToastManager };
