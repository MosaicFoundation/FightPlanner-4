import type { ModManager } from './mod-manager';

class ModListRenderer {
  modManager: ModManager;
  intersectionObserver: IntersectionObserver | null;

  constructor(modManager: ModManager) {
    this.modManager = modManager;
    this.intersectionObserver = null;

    this.setupIntersectionObserver();
  }

  setupIntersectionObserver() {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const modItem = entry.target as HTMLElement;

          if (modItem.dataset.processed === 'true') {
            return;
          }

          if (entry.isIntersecting) {
            modItem.classList.add('mod-item-visible');
            modItem.dataset.processed = 'true';

            this.intersectionObserver!.unobserve(modItem);
          }
        });
      },
      {
        root: null,
        threshold: 0.01,
        rootMargin: '100px',
      },
    );
  }

  showNonVisibleInstantly() {
    if (!this.modManager || !this.modManager.modListContainer) return;

    const allModItems =
      this.modManager.modListContainer.querySelectorAll<HTMLElement>(
        '.mod-item',
      );

    allModItems.forEach((modItem) => {
      if (modItem.dataset.processed !== 'true') {
        modItem.classList.add('mod-item-instant');
        modItem.dataset.processed = 'true';

        if (this.intersectionObserver) {
          this.intersectionObserver.unobserve(modItem);
        }
      }
    });
  }

  renderModItem(mod, index) {
    const modItem = document.createElement('div');
    modItem.classList.add('mod-item');
    modItem.dataset.modId = mod.id;

    modItem.dataset.processed = 'false';

    // Set CSS variable for staggered animation
    modItem.style.setProperty('--mod-index', index);

    if (mod.status) {
      modItem.classList.add('mod-' + mod.status);
    }

    const statusIcon = document.createElement('div');
    statusIcon.classList.add('mod-status-icon');

    let svgHTML = '';
    if (mod.status === 'conflict') {
      svgHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
<circle cx="10" cy="10" r="9" fill="#FFC107" stroke="#FFA000" stroke-width="2"/>
<path d="M10 6V11M10 14H10.01" stroke="white" stroke-width="2" stroke-linecap="round"/>
</svg>`;
    } else if (mod.status === 'active') {
      svgHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
<circle cx="10" cy="10" r="9" fill="#4CAF50" stroke="#388E3C" stroke-width="2"/>
<path d="M6 10L9 13L14 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    } else if (mod.status === 'disabled') {
      svgHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
<circle cx="10" cy="10" r="9" fill="#F44336" stroke="#D32F2F" stroke-width="2"/>
<path d="M7 7L13 13M13 7L7 13" stroke="white" stroke-width="2" stroke-linecap="round"/>
</svg>`;
    }
    statusIcon.innerHTML = svgHTML;

    const modName = document.createElement('span');
    modName.classList.add('mod-name');
    modName.textContent = mod.name || 'Unknown Mod';

    modItem.appendChild(statusIcon);
    modItem.appendChild(modName);

    modItem.addEventListener('click', () => this.modManager.selectMod(mod.id));
    modItem.addEventListener('contextmenu', (e) => {
      if (this.modManager.contextMenuHandler) {
        this.modManager.contextMenuHandler.showContextMenu(e, mod);
      }
    });

    if (this.intersectionObserver) {
      this.intersectionObserver.observe(modItem);
    }

    return modItem;
  }

  renderModList(
    mods,
    container: HTMLElement,
    searchQuery = '',
    categoryFilter = '',
  ) {
    if (!container) {
      console.warn('Mod list container not found');
      return;
    }

    const existingProcessedStates = new Map();
    const existingItems = container.querySelectorAll<HTMLElement>('.mod-item');
    existingItems.forEach((item) => {
      const modId = item.dataset.modId;
      const processed = item.dataset.processed;
      if (modId && processed === 'true') {
        existingProcessedStates.set(modId, true);
      }
    });

    container.innerHTML = '';

    if (mods.length === 0) {
      container.innerHTML =
        '<div class="no-results-message" style="color: var(--text-muted); text-align: center; padding: 30px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px;">' +
        '<i class="bi bi-folder-x" style="font-size: 32px; opacity: 0.5;"></i>' +
        '<span>No mods available.</span>' +
        '<span style="font-size: 13px;">Go download some on <a href="#" onclick="window.electronAPI.openUrl(\'https://gamebanana.com/games/6498\'); return false;" style="color: var(--primary-color); text-decoration: none; font-weight: 500;">GameBanana</a>!</span>' +
        '</div>';
      return;
    }

    let filteredMods = mods;

    if (searchQuery) {
      filteredMods = filteredMods.filter((mod) =>
        mod.name.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    if (categoryFilter) {
      filteredMods = filteredMods.filter((mod) => {
        if (!mod.category) return false;
        const modCategory = mod.category.toLowerCase();
        const filterCategory = categoryFilter.toLowerCase();

        if (filterCategory === 'fighter') {
          return modCategory === 'fighter' || modCategory === 'skins';
        }

        return modCategory === filterCategory;
      });
    }

    if (filteredMods.length === 0) {
      container.innerHTML =
        '<div class="no-results-message" style="color: var(--text-muted); text-align: center; padding: 30px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px;">' +
        '<i class="bi bi-search" style="font-size: 32px; opacity: 0.5;"></i>' +
        '<span>No mods found for this search/filter.</span>' +
        '<span style="font-size: 13px;">Looking for something new? Check <a href="#" onclick="window.electronAPI.openUrl(\'https://gamebanana.com/games/6498\'); return false;" style="color: var(--primary-color); text-decoration: none; font-weight: 500;">GameBanana</a>!</span>' +
        '</div>';
      return;
    }

    filteredMods.forEach((mod, index) => {
      const modItem = this.renderModItem(mod, index);

      if (existingProcessedStates.has(mod.id)) {
        modItem.dataset.processed = 'true';
        modItem.classList.add('mod-item-instant');
      }

      container.appendChild(modItem);
    });

    setTimeout(() => {
      this.showNonVisibleInstantly();
    }, 150);
  }

  updateVisibility(
    mods,
    container: HTMLElement,
    searchQuery = '',
    categoryFilter = '',
  ) {
    if (!container) return;

    const allModItems = container.querySelectorAll<HTMLElement>('.mod-item');

    if (allModItems.length === 0) {
      return false;
    }

    if (allModItems.length < mods.length) {
      return false;
    }

    let visibleCount = 0;

    allModItems.forEach((item) => {
      const modId = item.dataset.modId;
      const mod = mods.find((m) => m.id === modId);

      if (!mod) {
        item.style.display = 'none';
        return;
      }

      const matchesSearch =
        !searchQuery ||
        mod.name.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesCategory = !categoryFilter;
      if (categoryFilter && mod.category) {
        const modCategory = mod.category.toLowerCase();
        const filterCategory = categoryFilter.toLowerCase();

        if (filterCategory === 'fighter') {
          matchesCategory =
            modCategory === 'fighter' || modCategory === 'skins';
        } else {
          matchesCategory = modCategory === filterCategory;
        }
      }

      if (matchesSearch && matchesCategory) {
        item.style.display = '';
        visibleCount++;

        if (item.dataset.processed !== 'true' && this.intersectionObserver) {
          this.intersectionObserver.observe(item);
        }
      } else {
        item.style.display = 'none';
      }
    });

    const existingMessage = container.querySelector<HTMLElement>(
      '.no-results-message',
    );
    if (visibleCount === 0 && !existingMessage) {
      const message = document.createElement('div');
      message.className = 'no-results-message';
      message.style.cssText =
        'color: var(--text-muted); text-align: center; padding: 30px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px;';
      message.innerHTML =
        '<i class="bi bi-search" style="font-size: 32px; opacity: 0.5;"></i>' +
        '<span>No mods found.</span>' +
        '<span style="font-size: 13px;">Looking for something new? Check <a href="#" onclick="window.electronAPI.openUrl(\'https://gamebanana.com/games/6498\'); return false;" style="color: var(--primary-color); text-decoration: none; font-weight: 500;">GameBanana</a>!</span>';
      container.appendChild(message);
    } else if (visibleCount > 0 && existingMessage) {
      existingMessage.remove();
    }

    return true;
  }
}

if (typeof window !== 'undefined') {
  window.ModListRenderer = ModListRenderer;
}

export { type ModListRenderer };
