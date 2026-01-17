class ModInfoManager {
  constructor() {
    this.currentModPath = null;
    this.currentModData = null;
  }

  getContainer() {
    return document.getElementById('mod-info-content');
  }

  displayModInfo(modData, modPath = null) {
    this.currentModData = modData;
    this.currentModPath = modPath;

    const container = this.getContainer();
    if (!container) {
      console.error('Container not found! Make sure the tab is loaded.');
      return;
    }

    const escapeHtml = (text) => {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    const t = (key) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };

    const formatDescription = (desc) => {
      if (!desc) return t('tools.modInfo.noDescription');
      return escapeHtml(desc).replace(/\n/g, '<br>');
    };

    let html = '';

    if (modData.display_name) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.name')}</div>
<div class="mod-info-value">${escapeHtml(modData.display_name)}</div>
</div>`;
    }

    if (modData.authors) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.authors')}</div>
<div class="mod-info-value">${escapeHtml(modData.authors)}</div>
</div>`;
    }

    if (modData.version) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.version')}</div>
<div class="mod-info-value">${escapeHtml(modData.version)}</div>
</div>`;
    }

    if (modData.category) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.category')}</div>
<div class="mod-info-value">${escapeHtml(modData.category)}</div>
</div>`;
    }

    if (modData.description) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.description')}</div>
<div class="mod-info-value mod-info-description">${formatDescription(
        modData.description,
      )}</div>
</div>`;
    }

    if (modData.url) {
      html += `
<div class="mod-info-item">
<div class="mod-info-label">${t('tools.modInfo.url')}</div>
<div class="mod-info-value">
<a href="#" onclick="window.electronAPI.openUrl('${escapeHtml(
        modData.url,
      )}'); return false;" class="mod-info-link">
${escapeHtml(modData.url)}
</a>
</div>
</div>`;
    }

    if (html === '') {
      html = `<p class="mod-info-placeholder">${t('tools.modInfo.noInformation')}</p>`;
    }

    container.style.animation = 'none';
    container.offsetHeight;
    container.style.animation = '';

    container.innerHTML = html;

    const editBtn = document.getElementById('edit-info-btn');
    if (editBtn && modPath) {
      editBtn.style.display = 'flex';
    }
  }

  clearModInfo() {
    const container = this.getContainer();
    if (!container) return;
    const t = (key) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };
    container.innerHTML = `<p class="mod-info-placeholder">${t('tools.selectMod')}</p>`;

    this.currentModPath = null;
    this.currentModData = null;

    const editBtn = document.getElementById('edit-info-btn');
    if (editBtn) {
      editBtn.style.display = 'none';
    }
  }

  showLoading() {
    const container = this.getContainer();
    if (!container) return;
    const t = (key) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };
    container.innerHTML = `<p class="mod-info-placeholder">${t('tools.modInfo.loading')}</p>`;

    const editBtn = document.getElementById('edit-info-btn');
    if (editBtn) {
      editBtn.style.display = 'none';
    }
  }

  showError(message) {
    const container = this.getContainer();
    if (!container) return;
    const t = (key) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };
    const errorMessage = message || t('tools.modInfo.failedToLoad');
    container.innerHTML = `<p class="mod-info-placeholder" style="color: #ff4444;">${errorMessage}</p>`;

    const editBtn = document.getElementById('edit-info-btn');
    if (editBtn) {
      editBtn.style.display = 'none';
    }
  }
}

window.modInfoManager = new ModInfoManager();

/*
window.modInfoManager.displayModInfo({
name: "Super Smash Bros Ultimate Mod",
version: "1.0.0",
author: "ModAuthor",
description: "An awesome mod for Smash Ultimate",
size: "250 MB",
date: "2024-01-15"
});
*/
