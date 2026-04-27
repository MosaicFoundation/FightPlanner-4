// Minimum shape needed from mods returned by electronAPI.readModsFolder
type ScanMod = { name: string; path: string; status?: string; category?: string; hash?: string };

interface Character {
  id: string;
  name: string;
  info: { name: string; number: string };
  mods: { name: string; path: string; status: string; type?: string }[];
}

class CharactersManager {
  characters: Map<string, Character>;
  allCharacters: any[];
  searchQuery: string;
  initialized: boolean;

  constructor() {
    this.characters = new Map();
    this.allCharacters = [];
    this.searchQuery = '';
    this.initialized = false;

    console.log('Characters Manager created');
  }

  async initialize() {
    if (this.initialized) {
      console.log('Characters already initialized, skipping refresh.');
      return;
    }

    console.log('Initializing Characters Manager...');
    this.showLoading();
    await this.scanMods();
    this.setupEventListeners();
    this.renderCharacters();
    this.initialized = true;
  }

  setupEventListeners() {
    const searchInput =
      document.querySelector<HTMLInputElement>('#characters-search');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = searchInput.value.toLowerCase();
        this.filterCharacters();
      });
    }
  }

  filterCharacters() {
    if (!this.searchQuery) {
      this.renderCharacters();
      return;
    }

    const filtered = this.allCharacters.filter((char) =>
      char.info.name.toLowerCase().includes(this.searchQuery),
    );

    this.renderFilteredCharacters(filtered);
  }

  renderFilteredCharacters(characters: Character[]) {
    const container = document.querySelector<HTMLElement>('#characters-grid');
    if (!container) return;

    if (characters.length === 0) {
      container.innerHTML = `
<div class="characters-empty-state">
<i class="bi bi-search"></i>
<h3>No characters found</h3>
<p>Try a different search term</p>
</div>
`;
      this.updateCharacterCount(0);
      return;
    }

    container.innerHTML = '';
    characters.forEach((char) => {
      const card = this.createCharacterCard(char);
      container.appendChild(card);
    });

    this.updateCharacterCount(characters.length);
  }

  async scanMods() {
    console.log('Scanning mods for character data...');

    if (!window.settingsManager || !window.settingsManager.hasModsPath()) {
      console.warn('No mods path configured');
      this.renderEmptyState();
      return;
    }

    const modsPath = window.settingsManager.getModsPath();
    if (!modsPath) {
      console.warn('Mods path is null');
      this.renderEmptyState();
      return;
    }

    if (!window.electronAPI || !window.electronAPI.readModsFolder) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.readModsFolder(modsPath);

      if (!result.success) {
        console.error('Error reading mods:', result.error);
        return;
      }

      this.characters.clear();

      const allMods = [...result.activeMods.map(m => ({ mod: m, status: 'active' as const })), ...result.disabledMods.map(m => ({ mod: m, status: 'disabled' as const }))];

      for (let i = 0; i < allMods.length; i++) {
        const { mod, status } = allMods[i];
        this.updateLoadingStatus(`Scanning ${mod.name} (${i + 1}/${allMods.length})...`);
        await this.scanModForCharacters(mod, status);
      }

      console.log(`Found ${this.characters.size} characters with mods`);
    } catch (error) {
      console.error('Failed to scan mods:', error);
    }
  }

  async scanModForCharacters(mod: ScanMod, status: 'active' | 'disabled') {
    if (!window.electronAPI || !window.electronAPI.scanMod) {
      return;
    }

    try {
      const scanModResult = await window.electronAPI.scanMod(mod.path);

      if (scanModResult.success && scanModResult.data.fighterNames.length > 0) {
        const resolvedIds = new Set<string>();

        scanModResult.data.fighterNames.forEach((rawFighterId: string) => {
          const fighterId = window.resolveFolderName
            ? window.resolveFolderName(rawFighterId)
            : rawFighterId.toLowerCase();

          if (resolvedIds.has(fighterId)) {
            return;
          }
          resolvedIds.add(fighterId);

          if (!this.characters.has(fighterId)) {
            const charInfo = (window.SSBU_CHARACTERS as Record<string, { name: string; number: string; series: string }>)[fighterId];

            if (charInfo) {
              this.characters.set(fighterId, {
                id: fighterId,
                name: charInfo.name,
                info: charInfo,
                mods: [],
              });
            } else {
              console.warn(
                `Unknown fighter: ${rawFighterId} (resolved to: ${fighterId})`,
              );
            }
          }

          const char = this.characters.get(fighterId);
          if (char) {
            // Determine mod type: use echoManager eligibility check or name heuristic
            let type = '';
            if (window.echoManager && typeof (window.echoManager as any).isEligibleFighterMod === 'function') {
              if ((window.echoManager as any).isEligibleFighterMod(mod)) {
                type = 'fighter';
              } else if (mod.name && mod.name.toLowerCase().includes('echo')) {
                type = 'echo';
              }
            } else if (mod.name && mod.name.toLowerCase().includes('echo')) {
              type = 'echo';
            } else if (mod.category && mod.category.toLowerCase().includes('echo')) {
              type = 'echo';
            }
            char.mods.push({
              name: mod.name,
              path: mod.path,
              status: status,
              type: type,
            });
          }
        });
      }
    } catch (error) {
      console.error(`Error scanning mod ${mod.name}:`, error);
    }
  }

  renderCharacters() {
    const container = document.querySelector<HTMLElement>('#characters-grid');
    if (!container) {
      console.warn('Characters grid container not found');
      return;
    }

    if (this.characters.size === 0) {
      this.renderEmptyState();
      return;
    }

    container.innerHTML = '';

    this.allCharacters = Array.from(this.characters.values()).sort((a, b) => {
      const numA = parseFloat(a.info.number.replace('ε', '.5'));
      const numB = parseFloat(b.info.number.replace('ε', '.5'));
      return numA - numB;
    });

    this.allCharacters.forEach((char) => {
      const card = this.createCharacterCard(char);
      container.appendChild(card);
    });

    this.updateCharacterCount(this.allCharacters.length);
  }

  updateCharacterCount(count: number) {
    const countEl = document.querySelector<HTMLElement>('#characters-count');
    if (countEl) {
      countEl.textContent = `${count} character${count !== 1 ? 's' : ''}`;
    }
  }

  createCharacterCard(char: Character) {
    const card = document.createElement('div');
    card.className = 'character-card';
    card.dataset.characterId = char.id;

    const imageUrl =
      (window.CHARACTER_IMAGES as Record<string, string>)[char.id] ||
      'https://www.smashbros.com/assets_v2/img/fighter/mario/main.png';
    const escapedName = this.escapeHtml(char.info.name);

    card.innerHTML = `
<div class="character-card-header">
  <img src="${imageUrl}" alt="${escapedName}" class="character-image"
    onerror="this.style.display='none'; this.nextElementSibling.classList.add('show-placeholder');">
  <div class="character-image-placeholder">
    <i class="bi bi-person-circle"></i>
    <span class="character-placeholder-text">${escapedName}</span>
  </div>
  <div class="character-overlay">
    <span class="character-number">#${char.info.number}</span>
  </div>
</div>
<div class="character-card-body">
  <h3 class="character-name">${this.escapeHtml(char.info.name)}</h3>
  <div class="character-mod-count">
    <i class="bi bi-file-earmark-code"></i>
    <span>${char.mods.length} mod${char.mods.length > 1 ? 's' : ''}</span>
  </div>
  <div class="character-mods-list">
    ${char.mods
      .map((mod) => {
        // Echo logic integration
        let isEcho = false;
        let isEligible = false;
        let echoBtn = '';
        // Try to get echo eligibility from EchoManager if available
        if (window.echoManager && typeof (window.echoManager as any).isEligibleFighterMod === 'function') {
          isEligible = (window.echoManager as any).isEligibleFighterMod(mod);
        }
        // Heuristic: treat as echo if name or path contains 'echo' or type is 'echo'
        isEcho = (mod.type === 'echo') || !!(mod.name && mod.name.toLowerCase().includes('echo'));
        // Distinct styling for echo mods
        let modClass = `character-mod-item ${mod.status}`;
        if (isEcho) modClass += ' echo-mod';
        // Button logic
        if (isEcho) {
          echoBtn = `<button class="echo-details-btn" data-echo-details="${this.escapeHtml(mod.path)}">View/Change Details</button>`;
        } else if (isEligible) {
          echoBtn = `<button class="echo-create-btn" data-echo-create="${this.escapeHtml(mod.path)}">Create Echo Fighter</button>`;
        }
        return `
          <div class="${modClass}" data-mod-path="${this.escapeHtml(mod.path)}">
            <span class="mod-status-dot"></span>
            <span class="mod-name">${this.escapeHtml(mod.name)}</span>
            ${echoBtn}
          </div>
        `;
      })
      .join('')}
  </div>
</div>
`;


    // Add click handlers for mod items (open in tools tab)
    const modItems = card.querySelectorAll<HTMLElement>('.character-mod-item');
    modItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const modPath = item.dataset.modPath;
        this.openModInToolsTab(modPath);
      });
    });

    // Add click handlers for echo buttons
    const echoCreateBtns = card.querySelectorAll<HTMLElement>('.echo-create-btn');
    echoCreateBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const modPath = btn.getAttribute('data-echo-create');
        if (!window.echoManager || !modPath) {
          window.toastManager?.warning('Echo creation not available.');
          return;
        }
        // Ensure a synthetic visual entry exists for this character so the wizard flow works
        // without requiring the visual planner to have been separately initialized.
        if (!window.echoManager.visualCharactersByKey.has(char.id)) {
          const mod = window.modManager?.mods?.find((m) => m.path === modPath);
          const synthFighterMod = mod
            ? { id: mod.path, name: mod.name, path: mod.path, status: mod.status, type: 'fighter' as const, fighterKeys: [char.id], previewUrl: null }
            : null;
          const synthEntry = {
            fighterKey: char.id,
            name: char.name,
            imageUrl: '',
            modPreviewUrl: null,
            cardKind: 'fighter' as const,
            baseFighterKey: char.id,
            sourceModPath: null,
            fighterMods: synthFighterMod ? [synthFighterMod] : [],
            movesetMods: [],
            echoMods: [],
          };
          window.echoManager.visualCharactersByKey.set(char.id, synthEntry);
          if (!window.echoManager.visualCharacterOrder.includes(char.id)) {
            window.echoManager.visualCharacterOrder.push(char.id);
          }
        }
        window.echoManager.visualSelectedCharacter = char.id;
        await (window.echoManager as any).createEchoDraftFromVisualSelection(modPath);
      });
    });
    const echoDetailsBtns = card.querySelectorAll<HTMLElement>('.echo-details-btn');
    echoDetailsBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const modPath = btn.getAttribute('data-echo-details');
        if (!window.echoManager || !modPath) {
          window.toastManager?.warning('Echo details not available.');
          return;
        }
        // Build the echo card key for this mod so the character quick menu can find the entry.
        const echoCardKey = typeof (window.echoManager as any).createEchoCardKey === 'function'
          ? (window.echoManager as any).createEchoCardKey(char.id, modPath)
          : `echo:${char.id}:${modPath}`;
        if (!window.echoManager.visualCharactersByKey.has(echoCardKey)) {
          const mod = window.modManager?.mods?.find((m) => m.path === modPath);
          const synthEchoMod = mod
            ? { id: mod.path, name: mod.name, path: mod.path, status: mod.status, type: 'echo' as const, fighterKeys: [char.id], previewUrl: null }
            : null;
          const synthEchoEntry = {
            fighterKey: echoCardKey,
            name: mod?.name || char.name,
            imageUrl: '',
            modPreviewUrl: null,
            cardKind: 'echo' as const,
            baseFighterKey: char.id,
            sourceModPath: modPath,
            fighterMods: [],
            movesetMods: [],
            echoMods: synthEchoMod ? [synthEchoMod] : [],
          };
          window.echoManager.visualCharactersByKey.set(echoCardKey, synthEchoEntry);
          if (!window.echoManager.visualCharacterOrder.includes(echoCardKey)) {
            window.echoManager.visualCharacterOrder.push(echoCardKey);
          }
        }
        (window.echoManager as any).openCharacterQuickMenu(echoCardKey);
      });
    });

    card.addEventListener('click', () => {
      this.showCharacterDetails(char);
    });

    return card;
  }

  showCharacterDetails(char: Character) {
    const existingModal = document.querySelector<HTMLElement>(
      '.character-modal-overlay',
    );
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'character-modal-overlay';
    modal.innerHTML = `
<div class="character-modal">
<div class="character-modal-header">
<h2>${this.escapeHtml(char.info.name)}</h2>
<button class="character-modal-close">
<i class="bi bi-x-lg"></i>
</button>
</div>
<div class="character-modal-body">
<p class="character-modal-count">${char.mods.length} mod${char.mods.length > 1 ? 's' : ''} for this character</p>
<div class="character-modal-mods">
${char.mods
        .map(
          (mod) => `
<div class="character-modal-mod-item ${mod.status}" data-mod-path="${this.escapeHtml(mod.path)}">
<span class="mod-status-indicator ${mod.status}"></span>
<span class="mod-name">${this.escapeHtml(mod.name)}</span>
<i class="bi bi-arrow-right-circle"></i>
</div>
`,
        )
        .join('')}
</div>
</div>
</div>
`;

    document.body.appendChild(modal);

    const isNoAnimations = document.body.classList.contains('no-animations');
    if (isNoAnimations) {
      const overlay = modal;
      const modalContent = modal.querySelector<HTMLElement>('.character-modal');
      if (overlay) {
        overlay.style.opacity = '1';
        overlay.style.animation = 'none';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
      }
      if (modalContent) {
        modalContent.style.opacity = '1';
        modalContent.style.transform =
          'scale(1) translateY(-50%) translateX(-50%)';
        modalContent.style.animation = 'none';
        modalContent.style.position = 'absolute';
        modalContent.style.left = '50%';
        modalContent.style.top = '50%';
        modalContent.style.margin = '0';
      }
    }

    const closeBtn = modal.querySelector<HTMLElement>('.character-modal-close');
    closeBtn!.addEventListener('click', (e) => {
      e.stopPropagation();
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    const modalContent = modal.querySelector<HTMLElement>('.character-modal');
    if (modalContent) {
      modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    const modItems = modal.querySelectorAll<HTMLElement>(
      '.character-modal-mod-item',
    );
    modItems.forEach((item) => {
      item.addEventListener('click', () => {
        const modPath = item.dataset.modPath;
        modal.remove();
        this.openModInToolsTab(modPath);
      });
    });

    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  openModInToolsTab(modPath: string | undefined) {
    console.log('Opening mod in tools tab:', modPath);

    const toolsBtn = document.querySelector<HTMLElement>('[data-tab="tools"]');
    if (toolsBtn) {
      toolsBtn.click();
    }

    setTimeout(() => {
      if (window.modManager && window.modManager.mods) {
        const mod = window.modManager.mods.find((m) => m.path === modPath);

        if (mod) {
          window.modManager.selectMod(mod.id);

          setTimeout(() => {
            const modElement = document.querySelector<HTMLElement>(
              `.mod-item[data-mod-id="${mod.id}"]`,
            );
            if (modElement) {
              modElement.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
              });

              modElement.style.animation = 'highlightMod 1.5s ease';
              setTimeout(() => {
                modElement.style.animation = '';
              }, 1500);
            }
          }, 100);
        }
      }
    }, 300);
  }

  renderEmptyState() {
    const container = document.querySelector<HTMLElement>('#characters-grid');
    if (!container) return;

    container.innerHTML = `
<div class="characters-empty-state">
<i class="bi bi-people-fill"></i>
<h3>No Character Mods Found</h3>
<p>Configure your mods folder in Settings to see characters with mods.</p>
<span style="font-size: 13px; margin-top: 10px; color: var(--text-muted);">Go download some on <a href="#" onclick="window.electronAPI.openUrl('https://gamebanana.com/games/6498'); return false;" style="color: var(--primary-color); text-decoration: none; font-weight: 500;">GameBanana</a>!</span>
</div>
`;
  }

  async refresh() {
    console.log('Refreshing characters...');
    this.showLoading();
    this.characters.clear();
    await this.scanMods();
    this.renderCharacters();
  }

  updateLoadingStatus(text: string) {
    const el = document.getElementById('characters-loading-status');
    if (el) {
      el.textContent = text;
    }
  }

  showLoading() {
    const container = document.querySelector<HTMLElement>('#characters-grid');
    if (container) {
      container.innerHTML = `
<div class="characters-loading">
<div id="characters-loading-lottie" style="width: 100px; height: 100px;"></div>
<p>Loading characters...</p>
<p id="characters-loading-status" style="font-size: 13px; color: var(--text-muted); margin-top: 8px;"></p>
</div>
`;
      const lottieContainer = document.getElementById('characters-loading-lottie');
      if (lottieContainer && window.lottie) {
        window.lottie.loadAnimation({
          container: lottieContainer,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: '../../assets/images/loading.json',
        });
      }
    }
    this.updateCharacterCount(0);
  }

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  window.charactersManager = new CharactersManager();
  console.log('Characters Manager initialized globally');
}

export { type CharactersManager };
