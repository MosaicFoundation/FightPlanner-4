type UiBuilderCategory =
  | 'backgrounds'
  | 'fonts'
  | 'borders'
  | 'images'
  | 'animations';

type UiBuilderModAnalysis = {
  name: string;
  path: string;
  status: string;
  category: string | null;
  categories: UiBuilderCategory[];
  categoryMatches: Record<UiBuilderCategory, string[]>;
  uiFiles: string[];
};

type UiBuilderAnalyzeResponse = {
  success: boolean;
  modsPath: string;
  mods: UiBuilderModAnalysis[];
  error?: string;
};

type UiBuilderSkippedConflict = {
  relativePath: string;
  existingModPath: string;
  skippedModPath: string;
  category: UiBuilderCategory;
};

type UiBuilderBuildResponse = {
  success: boolean;
  outputPath: string;
  copiedFiles: string[];
  skippedConflicts: UiBuilderSkippedConflict[];
  selectedCategories: UiBuilderCategory[];
  error?: string;
};

class UICompatManager {
  initialized: boolean;
  modsPath: string;
  analyzedMods: UiBuilderModAnalysis[];
  selectedByCategory: Partial<Record<UiBuilderCategory, string>>;
  outputFolderName: string;

  constructor() {
    this.initialized = false;
    this.modsPath = '';
    this.analyzedMods = [];
    this.selectedByCategory = {};
    this.outputFolderName = '[UI] Smash UI Builder Output';
  }

  t(key: string, params = {}) {
    if (window.i18n?.t) {
      return window.i18n.t(key, params);
    }

    return key;
  }

  escapeHtml(value: string): string {
    return `${value || ''}`
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  getCategoryList(): UiBuilderCategory[] {
    return ['backgrounds', 'fonts', 'borders', 'images', 'animations'];
  }

  getCategoryLabel(category: UiBuilderCategory): string {
    const keyMap: Record<UiBuilderCategory, string> = {
      backgrounds: 'uicompat.categoryBackgrounds',
      fonts: 'uicompat.categoryFonts',
      borders: 'uicompat.categoryBorders',
      images: 'uicompat.categoryImages',
      animations: 'uicompat.categoryAnimations',
    };

    return this.t(keyMap[category]);
  }

  initialize() {
    this.initialized = true;
    this.refresh();
  }

  async refresh() {
    const modsContainer = document.querySelector<HTMLElement>('#uicompat-mods-content');
    const builderContainer = document.querySelector<HTMLElement>('#uicompat-builder-content');

    if (modsContainer) {
      modsContainer.innerHTML = `<p class="echo-loading">${this.escapeHtml(this.t('uicompat.loadingMods'))}</p>`;
    }

    if (builderContainer) {
      builderContainer.innerHTML = `<p class="echo-loading">${this.escapeHtml(this.t('uicompat.loadingBuilder'))}</p>`;
    }

    try {
      const response = (await window.electronAPI.uiBuilderAnalyzeMods?.()) as
        | UiBuilderAnalyzeResponse
        | undefined;

      if (!response?.success) {
        this.renderError(response?.error || this.t('uicompat.failedToLoad'));
        return;
      }

      this.modsPath = response.modsPath;
      this.analyzedMods = response.mods || [];

      this.ensureSelections();
      this.renderModsList();
      this.renderBuilder();
    } catch (error) {
      console.error('Failed to load Smash UI Builder data:', error);
      this.renderError(this.t('uicompat.failedToLoad'));
    }
  }

  renderError(message: string) {
    const modsContainer = document.querySelector<HTMLElement>('#uicompat-mods-content');
    const builderContainer = document.querySelector<HTMLElement>('#uicompat-builder-content');

    if (modsContainer) {
      modsContainer.innerHTML = `<p class="echo-error">${this.escapeHtml(message)}</p>`;
    }

    if (builderContainer) {
      builderContainer.innerHTML = `<p class="echo-error">${this.escapeHtml(message)}</p>`;
    }
  }

  ensureSelections() {
    for (const category of this.getCategoryList()) {
      const currentPath = this.selectedByCategory[category];
      const hasCurrent = this.analyzedMods.some((mod) => {
        return mod.path === currentPath && mod.categories.includes(category);
      });

      if (hasCurrent) {
        continue;
      }

      const firstCategoryMod = this.analyzedMods.find((mod) =>
        mod.categories.includes(category),
      );

      if (firstCategoryMod) {
        this.selectedByCategory[category] = firstCategoryMod.path;
      } else {
        delete this.selectedByCategory[category];
      }
    }
  }

  renderModsList() {
    const container = document.querySelector<HTMLElement>('#uicompat-mods-content');
    if (!container) return;

    if (this.analyzedMods.length === 0) {
      container.innerHTML = `<p class="echo-empty">${this.escapeHtml(this.t('uicompat.noUiModsFound'))}</p>`;
      return;
    }

    const cards = this.analyzedMods
      .map((mod) => {
        const statusLabel =
          mod.status === 'active'
            ? this.t('echo.modStatusActive')
            : this.t('echo.modStatusDisabled');

        const categoryBadges = mod.categories.length
          ? mod.categories
              .map(
                (category) =>
                  `<span class="uicompat-category-badge">${this.escapeHtml(
                    this.getCategoryLabel(category),
                  )}</span>`,
              )
              .join('')
          : `<span class="uicompat-category-badge muted">${this.escapeHtml(this.t('uicompat.uncategorized'))}</span>`;

        const fileRows = mod.uiFiles
          .slice(0, 24)
          .map(
            (filePath) => `<li><code>${this.escapeHtml(filePath)}</code></li>`,
          )
          .join('');

        const hiddenCount = Math.max(0, mod.uiFiles.length - 24);

        return `
          <details class="uicompat-mod-card" open>
            <summary>
              <div>
                <p class="uicompat-mod-title">${this.escapeHtml(mod.name)}</p>
                <p class="uicompat-mod-meta">${this.escapeHtml(statusLabel)}${mod.category ? ` - ${this.escapeHtml(mod.category)}` : ''}</p>
              </div>
              <div class="uicompat-category-list">${categoryBadges}</div>
            </summary>
            <div class="uicompat-mod-body">
              <p class="echo-section-hint">${this.escapeHtml(mod.path)}</p>
              <ul class="uicompat-file-list">${fileRows}</ul>
              ${
                hiddenCount > 0
                  ? `<p class="echo-section-hint">${this.escapeHtml(this.t('uicompat.moreFiles', { count: hiddenCount }))}</p>`
                  : ''
              }
            </div>
          </details>
        `;
      })
      .join('');

    container.innerHTML = cards;
  }

  renderBuilder() {
    const container = document.querySelector<HTMLElement>('#uicompat-builder-content');
    if (!container) return;

    if (this.analyzedMods.length === 0) {
      container.innerHTML = `<p class="echo-empty">${this.escapeHtml(this.t('uicompat.builderPlaceholder'))}</p>`;
      return;
    }

    const categoryRows = this.getCategoryList()
      .map((category) => {
        const modsForCategory = this.analyzedMods.filter((mod) =>
          mod.categories.includes(category),
        );
        const selectedPath = this.selectedByCategory[category] || '';

        const options = [
          `<option value="">${this.escapeHtml(this.t('uicompat.none'))}</option>`,
          ...modsForCategory.map((mod) => {
            const selected = mod.path === selectedPath ? 'selected' : '';
            return `<option value="${this.escapeHtml(mod.path)}" ${selected}>${this.escapeHtml(mod.name)}</option>`;
          }),
        ].join('');

        return `
          <div class="uicompat-builder-row">
            <label class="echo-name-label" for="uicompat-select-${category}">${this.escapeHtml(
              this.getCategoryLabel(category),
            )}</label>
            <select class="echo-compat-select" id="uicompat-select-${category}" data-category="${category}">
              ${options}
            </select>
          </div>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="uicompat-builder-form">
        ${categoryRows}
        <div class="uicompat-builder-row">
          <label class="echo-name-label" for="uicompat-output-name">${this.escapeHtml(this.t('uicompat.outputName'))}</label>
          <input id="uicompat-output-name" class="modal-input" type="text" value="${this.escapeHtml(this.outputFolderName)}" maxlength="80" />
        </div>
        <div class="echo-actions">
          <button class="input-btn" id="uicompat-build-btn" type="button">
            <i class="bi bi-box-seam"></i>
            <span>${this.escapeHtml(this.t('uicompat.buildButton'))}</span>
          </button>
        </div>
      </div>
      <div id="uicompat-build-status"></div>
    `;

    this.bindBuilderControls();
  }

  bindBuilderControls() {
    for (const category of this.getCategoryList()) {
      const select = document.querySelector<HTMLSelectElement>(
        `#uicompat-select-${category}`,
      );

      select?.addEventListener('change', () => {
        const nextPath = select.value || '';
        if (nextPath) {
          this.selectedByCategory[category] = nextPath;
        } else {
          delete this.selectedByCategory[category];
        }
      });
    }

    const outputInput = document.querySelector<HTMLInputElement>('#uicompat-output-name');
    outputInput?.addEventListener('input', () => {
      this.outputFolderName = outputInput.value;
    });

    const buildBtn = document.querySelector<HTMLElement>('#uicompat-build-btn');
    buildBtn?.addEventListener('click', async () => {
      await this.buildBundle();
    });
  }

  async buildBundle() {
    const status = document.querySelector<HTMLElement>('#uicompat-build-status');
    if (!status) return;

    status.innerHTML = `<p class="echo-loading">${this.escapeHtml(this.t('uicompat.building'))}</p>`;

    try {
      const response = (await window.electronAPI.uiBuilderBuildBundle?.({
        outputFolderName: this.outputFolderName,
        categorySelections: this.selectedByCategory,
      })) as UiBuilderBuildResponse | undefined;

      if (!response?.success) {
        status.innerHTML = `<p class="echo-error">${this.escapeHtml(response?.error || this.t('uicompat.buildFailed'))}</p>`;
        return;
      }

      const copiedCount = response.copiedFiles.length;
      const conflictCount = response.skippedConflicts.length;

      status.innerHTML = `
        <div class="uicompat-build-result">
          <p><strong>${this.escapeHtml(this.t('uicompat.buildSuccessTitle'))}</strong></p>
          <p>${this.escapeHtml(this.t('uicompat.buildSuccessSummary', { copied: copiedCount, conflicts: conflictCount }))}</p>
          <p><code>${this.escapeHtml(response.outputPath)}</code></p>
          <div class="echo-actions">
            <button class="input-btn short" id="uicompat-open-output-btn" type="button">
              <i class="bi bi-folder2-open"></i>
              <span>${this.escapeHtml(this.t('uicompat.openOutput'))}</span>
            </button>
          </div>
        </div>
      `;

      const openOutputBtn = document.querySelector<HTMLElement>('#uicompat-open-output-btn');
      openOutputBtn?.addEventListener('click', async () => {
        await window.electronAPI.openFolder(response.outputPath);
      });
    } catch (error) {
      console.error('Failed to build UI bundle:', error);
      status.innerHTML = `<p class="echo-error">${this.escapeHtml(this.t('uicompat.buildFailed'))}</p>`;
    }
  }

  // Legacy bridge for Echo manager; UI Builder no longer provides Echo category plans.
  getCompatibilityOptions(_modPath: string): null {
    return null;
  }
}

if (typeof window !== 'undefined') {
  window.uiCompatManager = new UICompatManager();
}

export { type UICompatManager };
