type StageEntry = {
  xmlName: string;
  displayName: string;
  imageUrl: string | null;
  canonicalOrder: number;
  isRandom: boolean;
};

type StageLayoutPresetSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

type StageLayoutState = {
  visibleStageNames: string[];
  hiddenStageNames: string[];
};

class StagesManager {
  root: HTMLElement | null;
  grid: HTMLElement | null;
  gridPanel: HTMLElement | null;
  hiddenButton: HTMLButtonElement | null;
  hiddenCount: HTMLElement | null;
  saveButton: HTMLButtonElement | null;
  presetButton: HTMLButtonElement | null;
  presetButtonLabel: HTMLElement | null;
  summaryValue: HTMLElement | null;
  summaryMeta: HTMLElement | null;
  footerNote: HTMLElement | null;
  movableStages: StageEntry[];
  hiddenStages: StageEntry[];
  randomStages: StageEntry[];
  presets: StageLayoutPresetSummary[];
  canonicalStageNames: string[];
  loadedBaselineLayoutState: StageLayoutState;
  fixedOffsetCells: number;
  fixedRandomCells: number;
  gridColumns: number;
  gridRows: number;
  actualGridRows: number;
  overflowCells: number;
  source: 'saved' | 'canonical' | 'preset';
  currentPresetId: string | null;
  basePresetLabel: string;
  isLoading: boolean;
  isSaving: boolean;
  isPresetSaving: boolean;
  isDirty: boolean;
  draggedStageName: string | null;
  stageThumbObserver: IntersectionObserver | null;
  contextMenuInitialized: boolean;

  constructor() {
    this.root = null;
    this.grid = null;
    this.gridPanel = null;
    this.hiddenButton = null;
    this.hiddenCount = null;
    this.saveButton = null;
    this.presetButton = null;
    this.presetButtonLabel = null;
    this.summaryValue = null;
    this.summaryMeta = null;
    this.footerNote = null;
    this.movableStages = [];
    this.hiddenStages = [];
    this.randomStages = [];
    this.presets = [];
    this.canonicalStageNames = [];
    this.loadedBaselineLayoutState = {
      visibleStageNames: [],
      hiddenStageNames: [],
    };
    this.fixedOffsetCells = 0;
    this.fixedRandomCells = 3;
    this.gridColumns = 11;
    this.gridRows = 11;
    this.actualGridRows = 11;
    this.overflowCells = 0;
    this.source = 'canonical';
    this.currentPresetId = null;
    this.basePresetLabel = 'Default Layout';
    this.isLoading = false;
    this.isSaving = false;
    this.isPresetSaving = false;
    this.isDirty = false;
    this.draggedStageName = null;
    this.stageThumbObserver = null;
    this.contextMenuInitialized = false;

    this.setupContextMenu();
  }

  t(key: string, fallback: string, params: Record<string, string | number> = {}) {
    if (!window.i18n?.t) {
      return fallback;
    }

    const normalizedParams = Object.fromEntries(
      Object.entries(params).map(([paramKey, value]) => [paramKey, String(value)]),
    );

    return window.i18n.t(key, normalizedParams) || fallback;
  }

  getTotalCellCount() {
    const requiredCells =
      this.fixedOffsetCells + this.fixedRandomCells + this.movableStages.length;
    return Math.max(this.gridColumns * this.gridRows, requiredCells);
  }

  getCurrentLayoutState() {
    return {
      visibleStageNames: this.movableStages.map((stage) => stage.xmlName),
      hiddenStageNames: this.hiddenStages.map((stage) => stage.xmlName),
    } satisfies StageLayoutState;
  }

  getMovableStageAtGridIndex(gridIndex: number) {
    const movableIndex = gridIndex - this.fixedOffsetCells - this.fixedRandomCells;
    if (movableIndex < 0 || movableIndex >= this.movableStages.length) {
      return null;
    }

    return {
      stage: this.movableStages[movableIndex],
      movableIndex,
    };
  }

  findStage(stageName: string) {
    return this.movableStages.find((stage) => stage.xmlName === stageName)
      || this.hiddenStages.find((stage) => stage.xmlName === stageName)
      || null;
  }

  areStageOrdersEqual(left: string[], right: string[]) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((stageName, index) => stageName === right[index]);
  }

  areLayoutStatesEqual(left: StageLayoutState, right: StageLayoutState) {
    return (
      this.areStageOrdersEqual(left.visibleStageNames, right.visibleStageNames)
      && this.areStageOrdersEqual(left.hiddenStageNames, right.hiddenStageNames)
    );
  }

  updateDirtyState() {
    this.isDirty = !this.areLayoutStatesEqual(
      this.getCurrentLayoutState(),
      this.loadedBaselineLayoutState,
    );
  }

  getDefaultPresetLabel() {
    return this.t('stages.defaultPresetName', 'Default Layout');
  }

  getCurrentLayoutLabel() {
    return this.t('stages.currentLayoutName', 'Current Layout');
  }

  getNewPresetLabel() {
    return this.t('stages.newPresetName', 'New Layout');
  }

  getPresetDisplayName() {
    const presetLabel = this.basePresetLabel || this.getDefaultPresetLabel();
    return this.isDirty ? `${presetLabel} *` : presetLabel;
  }

  bindDom() {
    this.root = document.querySelector<HTMLElement>('#stages-root');
    this.grid = document.querySelector<HTMLElement>('#stages-grid');
    this.gridPanel = document.querySelector<HTMLElement>('.stages-grid-panel');
    this.hiddenCount = document.querySelector<HTMLElement>('#stages-hidden-count');
    this.summaryValue = document.querySelector<HTMLElement>('#stages-summary-value');
    this.summaryMeta = document.querySelector<HTMLElement>('#stages-summary-meta');
    this.footerNote = document.querySelector<HTMLElement>('#stages-footer-note');

    const hiddenButton = document.querySelector<HTMLButtonElement>('#stages-hidden-btn');
    if (hiddenButton && hiddenButton !== this.hiddenButton) {
      const replacement = hiddenButton.cloneNode(true) as HTMLButtonElement;
      hiddenButton.parentNode?.replaceChild(replacement, hiddenButton);
      replacement.addEventListener('click', () => {
        this.openHiddenStagesModal();
      });
      this.hiddenButton = replacement;
      this.hiddenCount = replacement.querySelector<HTMLElement>('#stages-hidden-count');
    } else if (!hiddenButton) {
      this.hiddenButton = null;
    }

    const presetButton = document.querySelector<HTMLButtonElement>('#stages-preset-btn');
    if (presetButton && presetButton !== this.presetButton) {
      const replacement = presetButton.cloneNode(true) as HTMLButtonElement;
      presetButton.parentNode?.replaceChild(replacement, presetButton);
      replacement.addEventListener('click', () => {
        this.openPresetChooser();
      });
      this.presetButton = replacement;
    } else if (!presetButton) {
      this.presetButton = null;
    }

    const saveButton = document.querySelector<HTMLButtonElement>('#stages-save-btn');
    if (saveButton && saveButton !== this.saveButton) {
      const replacement = saveButton.cloneNode(true) as HTMLButtonElement;
      saveButton.parentNode?.replaceChild(replacement, saveButton);
      replacement.addEventListener('click', () => {
        void this.saveLayout();
      });
      this.saveButton = replacement;
    } else if (!saveButton) {
      this.saveButton = null;
    }

    this.presetButtonLabel = document.querySelector<HTMLElement>('#stages-preset-btn-label');
  }

  applyLayoutResult(result: {
    source: 'saved' | 'canonical' | 'preset';
    fixedOffsetCells: number;
    fixedRandomCells: number;
    gridColumns: number;
    gridRows: number;
    actualGridRows: number;
    overflowCells: number;
    randomStages: StageEntry[];
    movableStages: StageEntry[];
    hiddenStages: StageEntry[];
    activePreset: StageLayoutPresetSummary | null;
    presets: StageLayoutPresetSummary[];
    canonicalStageNames: string[];
  }) {
    this.source = result.source;
    this.fixedOffsetCells = result.fixedOffsetCells;
    this.fixedRandomCells = result.fixedRandomCells;
    this.gridColumns = result.gridColumns;
    this.gridRows = result.gridRows;
    this.actualGridRows = result.actualGridRows;
    this.overflowCells = result.overflowCells;
    this.randomStages = result.randomStages;
    this.movableStages = result.movableStages;
    this.hiddenStages = result.hiddenStages;
    this.presets = result.presets;
    this.canonicalStageNames = result.canonicalStageNames;
    this.currentPresetId = result.activePreset?.id || null;
    this.basePresetLabel = result.activePreset?.name
      || (result.source === 'saved'
        ? this.getCurrentLayoutLabel()
        : this.getDefaultPresetLabel());
    this.loadedBaselineLayoutState = this.getCurrentLayoutState();
    this.isDirty = false;
  }

  setupContextMenu() {
    if (this.contextMenuInitialized) {
      return;
    }

    this.contextMenuInitialized = true;

    document.addEventListener('click', (event) => {
      const contextMenu = document.querySelector<HTMLElement>('#stage-context-menu');
      const target = event.target as HTMLElement | null;

      if (
        contextMenu
        && target
        && !contextMenu.contains(target)
        && contextMenu.style.display !== 'none'
      ) {
        this.closeStageContextMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeStageContextMenu();
      }
    });

    document.addEventListener('scroll', () => {
      this.closeStageContextMenu();
    }, true);

    document.addEventListener('click', (event) => {
      const contextMenu = document.querySelector<HTMLElement>('#stage-context-menu');
      const target = event.target as HTMLElement | null;
      const item = target?.closest('.context-menu-item') as HTMLElement | null;

      if (!contextMenu || !item || !contextMenu.contains(item)) {
        return;
      }

      if (item.dataset.action !== 'toggle-stage-visibility') {
        return;
      }

      const stageName = contextMenu.dataset.stageName;
      const action = contextMenu.dataset.visibilityAction;
      if (!stageName || !action) {
        this.closeStageContextMenu();
        return;
      }

      this.closeStageContextMenu();

      if (action === 'hide') {
        this.hideStage(stageName);
      } else if (action === 'unhide') {
        this.unhideStage(stageName);
      }
    });
  }

  closeStageContextMenu() {
    const contextMenu = document.querySelector<HTMLElement>('#stage-context-menu');
    if (!contextMenu) {
      return;
    }

    contextMenu.style.display = 'none';
    contextMenu.removeAttribute('data-stage-name');
    contextMenu.removeAttribute('data-visibility-action');
  }

  showStageContextMenu(event: MouseEvent, stage: StageEntry, action: 'hide' | 'unhide') {
    event.preventDefault();

    const contextMenu = document.querySelector<HTMLElement>('#stage-context-menu');
    if (!contextMenu) {
      return;
    }

    const icon = contextMenu.querySelector<HTMLElement>('#stage-context-icon');
    const text = contextMenu.querySelector<HTMLElement>('#stage-context-text');
    const stageName = contextMenu.querySelector<HTMLElement>('#stage-context-stage');

    if (icon) {
      icon.className = action === 'hide' ? 'bi bi-eye-slash' : 'bi bi-eye';
    }

    if (stageName) {
      stageName.textContent = stage.displayName;
    }

    if (text) {
      text.textContent = action === 'hide'
        ? this.t('stages.hide', 'Hide')
        : this.t('stages.unhide', 'Unhide');
    }

    contextMenu.dataset.stageName = stage.xmlName;
    contextMenu.dataset.visibilityAction = action;
    contextMenu.style.visibility = 'hidden';
    contextMenu.style.display = 'block';

    void contextMenu.offsetWidth;

    const rectWidth = contextMenu.offsetWidth;
    const rectHeight = contextMenu.offsetHeight;

    contextMenu.style.display = 'none';
    contextMenu.style.visibility = '';

    const viewportInset = 12;
    const menuGap = 10;
    const stageCell = event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : null;
    const stageRect = stageCell?.getBoundingClientRect() || null;

    let left = event.clientX + menuGap;
    let top = event.clientY + menuGap;

    if (stageRect) {
      const hasRoomOnRight =
        stageRect.right + menuGap + rectWidth <= window.innerWidth - viewportInset;
      const hasRoomOnLeft =
        stageRect.left - menuGap - rectWidth >= viewportInset;
      const hasRoomBelow =
        stageRect.top + rectHeight <= window.innerHeight - viewportInset;
      const hasRoomAbove =
        stageRect.bottom - rectHeight >= viewportInset;

      if (hasRoomOnRight || (!hasRoomOnLeft && window.innerWidth - stageRect.right >= stageRect.left)) {
        left = stageRect.right + menuGap;
      } else if (hasRoomOnLeft) {
        left = stageRect.left - rectWidth - menuGap;
      }

      if (hasRoomBelow) {
        top = stageRect.top;
      } else if (hasRoomAbove) {
        top = stageRect.bottom - rectHeight;
      }
    }

    left = Math.max(viewportInset, Math.min(left, window.innerWidth - rectWidth - viewportInset));
    top = Math.max(viewportInset, Math.min(top, window.innerHeight - rectHeight - viewportInset));

    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;
    contextMenu.style.display = 'block';
  }

  hideStage(stageName: string) {
    if (this.isLoading || this.isSaving || this.isPresetSaving) {
      return;
    }

    const stageIndex = this.movableStages.findIndex((stage) => stage.xmlName === stageName);
    if (stageIndex < 0) {
      return;
    }

    const [stage] = this.movableStages.splice(stageIndex, 1);
    this.hiddenStages = [...this.hiddenStages, stage].sort(
      (left, right) => left.canonicalOrder - right.canonicalOrder,
    );
    this.render();
  }

  unhideStage(stageName: string) {
    if (this.isLoading || this.isSaving || this.isPresetSaving) {
      return;
    }

    const stageIndex = this.hiddenStages.findIndex((stage) => stage.xmlName === stageName);
    if (stageIndex < 0) {
      return;
    }

    const [stage] = this.hiddenStages.splice(stageIndex, 1);
    this.movableStages = [...this.movableStages, stage];
    this.render();
  }

  async initialize() {
    this.bindDom();

    if (!this.root || !this.grid) {
      return;
    }

    if (this.movableStages.length === 0 && this.hiddenStages.length === 0 && !this.isLoading) {
      await this.loadLayout();
      return;
    }

    this.render();
  }

  async loadLayout() {
    if (this.isLoading) {
      return;
    }

    this.bindDom();
    if (!this.grid) {
      return;
    }

    this.isLoading = true;
    this.updateMeta();
    this.disconnectThumbObserver();
    this.grid.innerHTML = `<div class="stages-empty-state">${this.t('stages.loading', 'Loading stages...')}</div>`;

    try {
      const result = await window.electronAPI.getStageLayout();
      if (!result.success) {
        throw new Error(result.error || this.t('stages.loadFailed', 'Failed to load stage layout'));
      }

      this.applyLayoutResult(result);
      this.render();
    } catch (error) {
      console.error('[StagesManager] Failed to load layout:', error);
      if (this.grid) {
        this.grid.innerHTML = `<div class="stages-empty-state is-error">${this.escapeHtml(error.message || this.t('stages.loadFailed', 'Failed to load stage layout'))}</div>`;
      }
      window.toastManager?.error('toasts.failedToLoadStages', 4000, {
        error: error.message || 'Unknown error',
      });
    } finally {
      this.isLoading = false;
      this.updateMeta();
    }
  }

  updateMeta() {
    this.updateDirtyState();

    if (this.summaryValue) {
      this.summaryValue.textContent = `${this.movableStages.length}`;
    }

    if (this.summaryMeta) {
      this.summaryMeta.textContent = this.t(
        'stages.statsMeta',
        '{{hidden}} hidden - {{random}} fixed random - {{rows}} rows',
        {
          hidden: this.hiddenStages.length,
          random: this.fixedRandomCells,
          rows: this.actualGridRows,
        },
      );
    }

    if (this.hiddenCount) {
      this.hiddenCount.textContent = `${this.hiddenStages.length}`;
    }

    if (this.hiddenButton) {
      this.hiddenButton.hidden = this.hiddenStages.length === 0;
      this.hiddenButton.disabled =
        this.hiddenStages.length === 0
        || this.isSaving
        || this.isLoading
        || this.isPresetSaving;
    }

    if (this.footerNote) {
      this.footerNote.textContent =
        this.overflowCells > 0
          ? this.t(
              'stages.noteOverflow',
              'Current embedded stage data needs {{rows}} rows to display every stage.',
              { rows: this.actualGridRows },
            )
          : this.t(
              'stages.instructions',
              'Drag any visible stage after the Random cells, or right-click a stage to hide it. Right-click a hidden stage to restore it.',
            );
    }

    if (this.presetButton) {
      this.presetButton.disabled = this.isSaving || this.isLoading || this.isPresetSaving;
      this.presetButton.classList.toggle(
        'is-loading',
        this.isLoading || this.isPresetSaving,
      );
    }

    if (this.presetButtonLabel) {
      this.presetButtonLabel.textContent = this.getPresetDisplayName();
    }

    if (this.saveButton) {
      this.saveButton.disabled = this.isSaving || this.isLoading || this.isPresetSaving;
      this.saveButton.classList.toggle('is-loading', this.isSaving);
    }
  }

  render() {
    this.bindDom();
    if (!this.grid) {
      return;
    }

    this.updateMeta();

    const totalCellCount = this.getTotalCellCount();
    this.grid.style.setProperty('--stages-grid-columns', String(this.gridColumns));
    this.grid.style.setProperty('--stages-grid-rows', String(this.actualGridRows));

    const fragment = document.createDocumentFragment();

    for (let gridIndex = 0; gridIndex < totalCellCount; gridIndex += 1) {
      fragment.appendChild(this.createGridCell(gridIndex));
    }

    this.grid.replaceChildren(fragment);
    this.setupThumbObserver();
  }

  openHiddenStagesModal() {
    if (!window.modalManager || this.hiddenStages.length === 0) {
      return;
    }

    const body = document.createElement('div');
    body.className = 'stages-hidden-modal';

    const copy = document.createElement('p');
    copy.className = 'stages-preset-modal-copy';
    copy.textContent = this.t(
      'stages.hiddenModalHint',
      'Use the restore button under a hidden stage to show it again.',
    );
    body.appendChild(copy);

    const list = document.createElement('div');
    list.className = 'stages-hidden-list';
    body.appendChild(list);

    let modal: HTMLElement | null = null;

    const renderList = () => {
      const fragment = document.createDocumentFragment();

      this.hiddenStages.forEach((stage) => {
        const card = document.createElement('div');
        card.className = 'stages-hidden-card';
        card.dataset.stageName = stage.xmlName;
        card.title = stage.displayName;

        const thumbFrame = document.createElement('div');
        thumbFrame.className = 'stages-hidden-thumb-frame';

        const thumb = this.createStageThumb(stage);

        const label = document.createElement('span');
        label.className = 'stages-hidden-stage-name';
        label.textContent = stage.displayName;

        const actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'input-btn stages-hidden-action';
        actionButton.textContent = this.t('stages.unhide', 'Unhide');
        actionButton.addEventListener('click', () => {
          this.unhideStage(stage.xmlName);

          if (this.hiddenStages.length === 0 && modal) {
            this.closeDynamicModal(modal);
            return;
          }

          renderList();
        });

        thumbFrame.appendChild(thumb);
        card.appendChild(thumbFrame);
        card.appendChild(label);
        card.appendChild(actionButton);
        fragment.appendChild(card);
      });

      list.replaceChildren(fragment);
      this.loadThumbImagesWithin(list);
    };

    renderList();

    modal = window.modalManager.showCustomModal({
      title: this.t('stages.hiddenTitle', 'Hidden stages'),
      body,
      buttons: [
        {
          text: this.t('common.cancel', 'Close'),
          type: 'secondary',
        },
      ],
    });
  }

  createStageThumb(stage: StageEntry) {
    const thumb = document.createElement('div');
    thumb.className = 'stages-stage-thumb';

    if (stage.imageUrl) {
      const image = document.createElement('img');
      image.className = 'stages-stage-thumb-image';
      image.alt = stage.displayName;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.draggable = false;
      image.referrerPolicy = 'no-referrer';
      image.dataset.imageUrl = stage.imageUrl;
      image.addEventListener('error', () => {
        this.applyThumbFallback(thumb, stage.displayName);
      });
      thumb.appendChild(image);
    } else {
      this.applyThumbFallback(thumb, stage.displayName);
    }

    return thumb;
  }

  applyThumbFallback(thumb: HTMLElement, displayName: string) {
    thumb.replaceChildren();
    thumb.classList.add('is-fallback');
    thumb.textContent = displayName.slice(0, 1).toUpperCase();
  }

  createGridCell(gridIndex: number) {
    const cell = document.createElement('div');
    cell.className = 'stages-grid-cell';

    if (gridIndex < this.fixedOffsetCells) {
      cell.classList.add('is-offset');
      return cell;
    }

    const randomIndex = gridIndex - this.fixedOffsetCells;
    if (randomIndex >= 0 && randomIndex < this.fixedRandomCells) {
      cell.classList.add('is-random');
      cell.title = this.randomStages[randomIndex]?.displayName || 'Random';
      cell.appendChild(this.createRandomArt(randomIndex));
      return cell;
    }

    const movableStageEntry = this.getMovableStageAtGridIndex(gridIndex);
    if (!movableStageEntry) {
      cell.classList.add('is-trailing');
      return cell;
    }

    const { stage, movableIndex } = movableStageEntry;

    cell.classList.add('is-stage');
    cell.draggable = true;
    cell.dataset.stageName = stage.xmlName;
    cell.dataset.stageIndex = String(movableIndex);
    cell.title = stage.displayName;

    cell.addEventListener('dragstart', (event) =>
      this.handleDragStart(event, stage.xmlName),
    );
    cell.addEventListener('dragend', () => this.handleDragEnd());
    cell.addEventListener('dragover', (event) =>
      this.handleDragOver(event, movableIndex),
    );
    cell.addEventListener('drop', (event) => this.handleDrop(event, movableIndex));
    cell.addEventListener('dragleave', () => {
      cell.classList.remove('is-drop-target');
    });
    cell.addEventListener('contextmenu', (event) => {
      this.showStageContextMenu(event, stage, 'hide');
    });

    const thumb = this.createStageThumb(stage);

    const order = document.createElement('span');
    order.className = 'stages-order-chip';
    order.textContent = String(movableIndex + 1);

    const label = document.createElement('span');
    label.className = 'stages-stage-label';
    label.textContent = stage.displayName;

    cell.appendChild(thumb);
    cell.appendChild(order);
    cell.appendChild(label);

    return cell;
  }

  createRandomArt(randomIndex: number) {
    const art = document.createElement('div');
    art.className = 'stages-random-art';

    const icon = document.createElement('i');
    icon.className = randomIndex === 0 ? 'bi bi-shuffle' : 'bi bi-dice-5';

    art.appendChild(icon);
    return art;
  }

  closeDynamicModal(modal: HTMLElement, onClosed?: () => void) {
    window.modalManager.closeModal(modal, {
      onModalClosed: () => {
        modal.remove();
        onClosed?.();
      },
    });
  }

  formatPresetUpdatedAt(updatedAt: string) {
    try {
      return new Date(updatedAt).toLocaleString();
    } catch {
      return updatedAt;
    }
  }

  openPresetChooser() {
    if (!window.modalManager) {
      return;
    }

    const body = document.createElement('div');
    body.className = 'stages-preset-modal';

    const copy = document.createElement('p');
    copy.className = 'stages-preset-modal-copy';
    copy.textContent = this.t(
      'stages.presetChooserHint',
      'Load a saved stage layout preset, start a fresh one, or save your current arrangement.',
    );
    body.appendChild(copy);

    let chooserModal: HTMLElement | null = null;

    if (this.presets.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'stages-preset-empty';
      emptyState.textContent = this.t(
        'stages.presetEmpty',
        'No saved stage layout presets yet.',
      );
      body.appendChild(emptyState);
    } else {
      const presetList = document.createElement('div');
      presetList.className = 'stages-preset-list';

      this.presets.forEach((preset) => {
        const presetCard = document.createElement('button');
        presetCard.type = 'button';
        presetCard.className = 'stages-preset-card';
        if (preset.id === this.currentPresetId) {
          presetCard.classList.add('is-active');
        }

        const header = document.createElement('div');
        header.className = 'stages-preset-card-header';

        const title = document.createElement('span');
        title.className = 'stages-preset-card-title';
        title.textContent = preset.name;

        header.appendChild(title);

        if (preset.id === this.currentPresetId) {
          const badge = document.createElement('span');
          badge.className = 'stages-preset-card-badge';
          badge.textContent = this.t('stages.presetCurrent', 'Current');
          header.appendChild(badge);
        }

        const meta = document.createElement('div');
        meta.className = 'stages-preset-card-meta';
        meta.textContent = this.t(
          'stages.presetUpdatedAt',
          'Updated {{date}}',
          { date: this.formatPresetUpdatedAt(preset.updatedAt) },
        );

        presetCard.appendChild(header);
        presetCard.appendChild(meta);
        presetCard.addEventListener('click', async () => {
          if (this.isLoading || this.isSaving || this.isPresetSaving) {
            return;
          }

          const loaded = await this.loadPreset(preset.id);
          if (loaded && chooserModal) {
            this.closeDynamicModal(chooserModal);
          }
        });

        presetList.appendChild(presetCard);
      });

      body.appendChild(presetList);
    }

    chooserModal = window.modalManager.showCustomModal({
      title: this.t('stages.presetChooserTitle', 'Stage Layout Presets'),
      body,
      buttons: [
        {
          text: this.t('common.cancel', 'Cancel'),
          type: 'secondary',
        },
        {
          text: this.t('stages.presetNew', 'New'),
          type: 'secondary',
          closeOnClick: false,
          onClick: () => {
            if (!chooserModal) {
              return false;
            }

            this.closeDynamicModal(chooserModal, () => {
              this.resetToNewLayout();
            });
            return false;
          },
        },
        {
          text: this.t('stages.presetSave', 'Save'),
          type: 'primary',
          closeOnClick: false,
          onClick: () => {
            if (!chooserModal) {
              return false;
            }

            this.closeDynamicModal(chooserModal, () => {
              void this.promptAndSavePreset();
            });
            return false;
          },
        },
      ],
    });
  }

  async promptAndSavePreset() {
    if (this.isLoading || this.isSaving || this.isPresetSaving) {
      return;
    }

    const presetName = await this.promptForPresetName(
      this.currentPresetId ? this.basePresetLabel : '',
    );
    if (!presetName) {
      return;
    }

    this.isPresetSaving = true;
    this.updateMeta();

    try {
      const result = await window.electronAPI.saveStageLayoutPreset(
        presetName,
        this.getCurrentLayoutState(),
        this.currentPresetId,
      );

      if (!result.success) {
        throw new Error(result.error || this.t('stages.presetSaveFailed', 'Failed to save preset'));
      }

      this.currentPresetId = result.preset.id;
      this.basePresetLabel = result.preset.name;
      this.presets = result.presets;
      this.loadedBaselineLayoutState = this.getCurrentLayoutState();
      this.isDirty = false;
      this.render();

      window.toastManager?.success('toasts.stagePresetSaved', 3500);
    } catch (error) {
      console.error('[StagesManager] Failed to save preset:', error);
      window.toastManager?.error('toasts.failedToSaveStages', 4500, {
        error: error.message || 'Unknown error',
      });
    } finally {
      this.isPresetSaving = false;
      this.updateMeta();
    }
  }

  promptForPresetName(initialName: string) {
    return new Promise<string | null>((resolve) => {
      if (!window.modalManager) {
        resolve(null);
        return;
      }

      let resolved = false;
      const finish = (value: string | null) => {
        if (resolved) {
          return;
        }

        resolved = true;
        resolve(value);
      };

      const form = document.createElement('div');
      form.className = 'stages-preset-form';

      const inputId = `stage-preset-name-input-${Date.now()}`;

      const label = document.createElement('label');
      label.className = 'modal-label';
      label.htmlFor = inputId;
      label.textContent = this.t('stages.presetNameLabel', 'Preset name');

      const input = document.createElement('input');
      input.id = inputId;
      input.type = 'text';
      input.className = 'modal-input';
      input.placeholder = this.t(
        'stages.presetNamePlaceholder',
        'Enter a name for this layout',
      );
      input.value = initialName;

      const errorText = document.createElement('p');
      errorText.className = 'stages-preset-form-error';

      form.appendChild(label);
      form.appendChild(input);
      form.appendChild(errorText);

      let nameModal: HTMLElement | null = null;

      const submit = () => {
        const presetName = input.value.trim().replace(/\s+/g, ' ');
        if (!presetName) {
          errorText.textContent = this.t(
            'stages.presetNameEmpty',
            'Preset name cannot be empty.',
          );
          input.focus();
          return;
        }

        finish(presetName);
        if (nameModal) {
          this.closeDynamicModal(nameModal);
        }
      };

      input.addEventListener('input', () => {
        errorText.textContent = '';
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });

      nameModal = window.modalManager.showCustomModal({
        title: this.t('stages.presetNameTitle', 'Save Stage Layout Preset'),
        body: form,
        onClose: () => finish(null),
        buttons: [
          {
            text: this.t('common.cancel', 'Cancel'),
            type: 'secondary',
            onClick: () => {
              finish(null);
            },
          },
          {
            text: this.t('common.save', 'Save'),
            type: 'primary',
            closeOnClick: false,
            onClick: () => {
              submit();
              return false;
            },
          },
        ],
      });

      setTimeout(() => {
        input.focus();
        input.select();
      }, 60);
    });
  }

  async loadPreset(presetId: string) {
    if (this.isLoading || this.isSaving || this.isPresetSaving) {
      return false;
    }

    this.isLoading = true;
    this.updateMeta();

    try {
      const result = await window.electronAPI.loadStageLayoutPreset(presetId);
      if (!result.success) {
        throw new Error(result.error || this.t('stages.loadFailed', 'Failed to load stage layout'));
      }

      this.applyLayoutResult(result);
      this.render();
      window.toastManager?.success('toasts.stagePresetLoaded', 3000);
      return true;
    } catch (error) {
      console.error('[StagesManager] Failed to load preset:', error);
      window.toastManager?.error('toasts.failedToLoadStages', 4000, {
        error: error.message || 'Unknown error',
      });
      return false;
    } finally {
      this.isLoading = false;
      this.updateMeta();
    }
  }

  resetToNewLayout() {
    const stagesByName = new Map(
      [...this.movableStages, ...this.hiddenStages].map((stage) => [stage.xmlName, stage]),
    );

    this.movableStages = this.canonicalStageNames
      .map((stageName) => stagesByName.get(stageName) || null)
      .filter((stage): stage is StageEntry => stage !== null);
    this.hiddenStages = [];

    this.currentPresetId = null;
    this.basePresetLabel = this.getNewPresetLabel();
    this.loadedBaselineLayoutState = this.getCurrentLayoutState();
    this.isDirty = false;
    this.render();
  }

  disconnectThumbObserver() {
    if (this.stageThumbObserver) {
      this.stageThumbObserver.disconnect();
      this.stageThumbObserver = null;
    }
  }

  loadThumbImage(image: HTMLImageElement) {
    const imageUrl = image.dataset.imageUrl;
    if (!imageUrl || image.dataset.loaded === 'true') {
      return;
    }

    image.src = imageUrl;
    image.dataset.loaded = 'true';
    image.removeAttribute('data-image-url');
    this.stageThumbObserver?.unobserve(image);
  }

  loadThumbImagesWithin(container: ParentNode) {
    const images = Array.from(
      container.querySelectorAll<HTMLImageElement>('.stages-stage-thumb-image[data-image-url]'),
    );

    images.forEach((image) => {
      this.loadThumbImage(image);
    });
  }

  setupThumbObserver() {
    this.disconnectThumbObserver();

    if (!this.root) {
      return;
    }

    const stageImages = Array.from(
      this.root.querySelectorAll<HTMLImageElement>('.stages-stage-thumb-image[data-image-url]'),
    );
    if (stageImages.length === 0) {
      return;
    }

    const eagerImageCount = Math.min(
      stageImages.length,
      Math.max(this.gridColumns * 3, 24),
    );
    stageImages.slice(0, eagerImageCount).forEach((image) => {
      this.loadThumbImage(image);
    });

    const deferredImages = stageImages.slice(eagerImageCount);
    if (deferredImages.length === 0) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      deferredImages.forEach((image) => {
        this.loadThumbImage(image);
      });
      return;
    }

    this.stageThumbObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          this.loadThumbImage(entry.target as HTMLImageElement);
        });
      },
      {
        root: this.gridPanel,
        threshold: 0.01,
        rootMargin: '240px 0px',
      },
    );

    deferredImages.forEach((image) => {
      this.stageThumbObserver?.observe(image);
    });
  }

  handleDragStart(event: DragEvent, stageName: string) {
    this.draggedStageName = stageName;
    event.dataTransfer?.setData('text/plain', stageName);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    (event.currentTarget as HTMLElement | null)?.classList.add('is-dragging');
  }

  handleDragEnd() {
    this.draggedStageName = null;
    document
      .querySelectorAll<HTMLElement>('.stages-grid-cell.is-dragging, .stages-grid-cell.is-drop-target')
      .forEach((element) => {
        element.classList.remove('is-dragging', 'is-drop-target');
      });
  }

  handleDragOver(event: DragEvent, targetIndex: number) {
    if (!this.draggedStageName) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    (event.currentTarget as HTMLElement | null)?.classList.add('is-drop-target');
  }

  handleDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement | null;
    target?.classList.remove('is-drop-target');

    const stageName =
      this.draggedStageName || event.dataTransfer?.getData('text/plain') || null;
    if (!stageName) {
      return;
    }

    const sourceIndex = this.movableStages.findIndex(
      (stage) => stage.xmlName === stageName,
    );
    if (sourceIndex < 0 || sourceIndex === targetIndex) {
      return;
    }

    const reorderedStages = [...this.movableStages];
    const [movedStage] = reorderedStages.splice(sourceIndex, 1);
    reorderedStages.splice(targetIndex, 0, movedStage);
    this.movableStages = reorderedStages;

    this.render();
  }

  async saveLayout() {
    if (this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.updateMeta();

    try {
      const result = await window.electronAPI.saveStageLayout(
        this.getCurrentLayoutState(),
      );

      if (!result.success) {
        throw new Error(result.error || this.t('stages.saveFailed', 'Failed to save stage layout'));
      }

      this.source = 'saved';
      this.overflowCells = result.overflowCells;
      this.actualGridRows = result.actualGridRows;
      this.loadedBaselineLayoutState = this.getCurrentLayoutState();
      this.isDirty = false;
      this.render();

      window.toastManager?.success('toasts.stagesLayoutSaved', 4500);
      if (window.modManager?.fetchMods) {
        void window.modManager.fetchMods();
      }
    } catch (error) {
      console.error('[StagesManager] Failed to save layout:', error);
      window.toastManager?.error('toasts.failedToSaveStages', 4500, {
        error: error.message || 'Unknown error',
      });
    } finally {
      this.isSaving = false;
      this.updateMeta();
    }
  }

  escapeHtml(text: string) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  (window as any).stagesManager = new StagesManager();
}

export { StagesManager };














