class SocialGameBananaManager extends SocialManagerBase {
  [key: string]: any;
  async loadDiscover() {
    const discoverContent = document.querySelector<HTMLElement>(
      '#social-discover-content',
    );
    if (!discoverContent) return;

    discoverContent.innerHTML =
      '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading mods...</p></div>';

    try {
      const [submissionsData, subfeedData] = await Promise.all([
        this.fetchWithCache(
          this.GAMEBANANA_TOP_SUBS_URL,
          {},
          'gameBananaTopSubs',
        ),
        this.fetchGameBananaModsPage(1, this.gameBananaSearchQuery),
      ]);

      const submissions: GameBananaTopSubmission[] = Array.isArray(
        submissionsData,
      )
        ? submissionsData
        : [];
      const mods = submissions.filter(
        (submission) => submission._sModelName === 'Mod',
      );

      if (mods.length === 0) {
        discoverContent.innerHTML =
          '<div class="social-empty-state"><i class="bi bi-inbox"></i><p>No featured GameBanana mods found</p></div>';
        return;
      }

      const featuredMods = mods.slice(0, 6);
      this.gameBananaFeaturedMods = featuredMods;
      this.gameBananaFeaturedIndex = 0;
      this.gameBananaModsPage = 1;
      featuredMods.forEach((mod) => this.cacheGameBananaSubmission(mod));

      discoverContent.innerHTML = `
        <div class="social-gamebanana-featured">
          <div class="social-gamebanana-carousel-header">
            <h3 class="social-gamebanana-section-title">Featured</h3>
            <div class="social-gamebanana-carousel-actions">
              <button class="social-gamebanana-carousel-btn" data-direction="prev" aria-label="Previous featured mod">
                <i class="bi bi-chevron-left"></i>
              </button>
              <button class="social-gamebanana-carousel-btn" data-direction="next" aria-label="Next featured mod">
                <i class="bi bi-chevron-right"></i>
              </button>
            </div>
          </div>
          <div id="social-gamebanana-carousel" class="social-gamebanana-carousel">
            ${this.renderGameBananaFeaturedStack()}
          </div>
        </div>
        <div class="social-gamebanana-mods">
          <div class="social-gamebanana-mods-header">
            <div class="social-gamebanana-mods-title-row">
              <h3 class="social-gamebanana-section-title">Mods</h3>
              ${this.renderGameBananaSearchControl()}
            </div>
            <div id="social-gamebanana-pagination" class="social-gamebanana-pagination">
              ${this.renderGameBananaPagination(subfeedData)}
            </div>
          </div>
          <div id="social-gamebanana-mods-content">
            ${this.renderGameBananaModsPage(subfeedData)}
          </div>
        </div>
      `;

      this.setGameBananaFeaturedCardPositions();
    } catch (error) {
      console.error('[Social] Error loading GameBanana featured mods:', error);
      discoverContent.innerHTML =
        '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load GameBanana mods</p></div>';
    }
  }

  renderGameBananaSearchControl() {
    const query = this.escapeHtml(this.gameBananaSearchQuery);

    return `
      <label class="social-gamebanana-search" for="social-gamebanana-search-input">
        <i class="bi bi-search"></i>
        <input id="social-gamebanana-search-input" type="search" value="${query}" placeholder="Search GameBanana mods" autocomplete="off">
      </label>
    `;
  }

  setupGameBananaSearchEvents() {
    if (this.gameBananaSearchListenerBound) return;
    this.gameBananaSearchListenerBound = true;

    document.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      if (input?.id !== 'social-gamebanana-search-input') return;

      const query = input.value;
      if (this.gameBananaSearchDebounce) {
        clearTimeout(this.gameBananaSearchDebounce);
      }

      this.gameBananaSearchDebounce = setTimeout(() => {
        this.loadGameBananaModsPage(1, query);
      }, 350);
    });
  }

  getGameBananaSubfeedUrl(page = 1, searchQuery = '') {
    const params = new URLSearchParams({
      _nPage: String(Math.max(1, page)),
      _sSort: 'default',
      _csvModelExclusions: 'Question,Tutorial,Request',
    });
    const trimmedSearch = searchQuery.trim();
    if (trimmedSearch) {
      params.set('_sName', trimmedSearch);
    }

    return `${this.GAMEBANANA_SUBFEED_URL}?${params.toString()}`;
  }

  async fetchGameBananaModsPage(
    page = 1,
    searchQuery = this.gameBananaSearchQuery,
  ): Promise<GameBananaSubfeedResponse> {
    const response = await fetch(
      this.getGameBananaSubfeedUrl(page, searchQuery),
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`GameBanana Subfeed failed: ${response.status}`);
    }

    const metadata = data?._aMetadata || {};
    const perPage = Number(metadata._nPerpage || 15);
    const recordCount = Number(metadata._nRecordCount || 0);
    this.gameBananaModsTotalPages = Math.max(
      1,
      Math.ceil(recordCount / perPage),
    );

    return data;
  }

  async loadGameBananaModsPage(
    page: number,
    searchQuery = this.gameBananaSearchQuery,
  ) {
    this.gameBananaSearchQuery = searchQuery.trim();
    const requestId = ++this.gameBananaModsRequestId;
    const nextPage = Math.max(1, Math.min(page, this.gameBananaModsTotalPages));
    const modsContent = document.querySelector<HTMLElement>(
      '#social-gamebanana-mods-content',
    );
    const pagination = document.querySelector<HTMLElement>(
      '#social-gamebanana-pagination',
    );
    if (!modsContent || !pagination) return;

    this.gameBananaModsPage = nextPage;
    modsContent.innerHTML =
      '<div class="social-loading social-gamebanana-mods-loading"><i class="bi bi-hourglass-split"></i><p>Loading mods...</p></div>';

    try {
      const subfeedData = await this.fetchGameBananaModsPage(
        nextPage,
        this.gameBananaSearchQuery,
      );
      if (requestId !== this.gameBananaModsRequestId) return;

      modsContent.innerHTML = this.renderGameBananaModsPage(subfeedData);
      pagination.innerHTML = this.renderGameBananaPagination(subfeedData);
    } catch (error) {
      console.error('[Social] Error loading GameBanana mods page:', error);
      modsContent.innerHTML =
        '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load mods</p></div>';
    }
  }

  renderGameBananaModsPage(subfeedData: GameBananaSubfeedResponse) {
    const records = (Array.isArray(subfeedData?._aRecords)
      ? subfeedData._aRecords
      : []
    ).filter((submission) => submission._sModelName !== 'Request');
    records.forEach((mod) => this.cacheGameBananaSubmission(mod));

    if (records.length === 0) {
      return '<div class="social-empty-state"><i class="bi bi-inbox"></i><p>No mods found</p></div>';
    }

    return `
      <div class="social-gamebanana-grid">
        ${records.map((mod) => this.renderGameBananaModCard(mod)).join('')}
      </div>
    `;
  }

  cacheGameBananaSubmission(mod: GameBananaTopSubmission) {
    if (!mod?._idRow) return;

    const model = mod._sModelName || 'Mod';
    this.gameBananaSubmissionCache.set(`${model}:${mod._idRow}`, mod);
  }

  getCachedGameBananaSubmission(modelName: string, submissionId: string) {
    return this.gameBananaSubmissionCache.get(`${modelName}:${submissionId}`);
  }

  getGameBananaModelPath(modelName = 'Mod') {
    const normalized = modelName.toLowerCase();
    const paths: Record<string, string> = {
      mod: 'mods',
      sound: 'sounds',
      wip: 'wips',
      tool: 'tools',
      spray: 'sprays',
      map: 'maps',
    };

    return paths[normalized] || `${normalized}s`;
  }

  getGameBananaModelFromPath(path: string) {
    const normalized = path.toLowerCase();
    const models: Record<string, string> = {
      mods: 'Mod',
      sounds: 'Sound',
      wips: 'Wip',
      tools: 'Tool',
      sprays: 'Spray',
      maps: 'Map',
    };

    return models[normalized] || '';
  }

  getGameBananaProfileUrl(modelName: string, submissionId: string) {
    return `https://gamebanana.com/${this.getGameBananaModelPath(modelName)}/${submissionId}`;
  }

  getGameBananaInfoFromProfileUrl(url?: string) {
    if (!url) return null;

    try {
      const parsedUrl = new URL(url);
      if (!parsedUrl.hostname.includes('gamebanana.com')) return null;

      const [, section, submissionId] = parsedUrl.pathname.split('/');
      const modelName = this.getGameBananaModelFromPath(section || '');
      if (!modelName || !submissionId || !/^\d+$/.test(submissionId)) {
        return null;
      }

      return { modelName, submissionId };
    } catch (error) {
      return null;
    }
  }

  getGameBananaInfoFromFightPlannerLink(link?: string) {
    if (!link) return null;

    const match = link.match(/mmdl\/\d+,([^,]+),(\d+)/i);
    if (!match?.[1] || !match?.[2]) return null;

    return {
      modelName: match[1],
      submissionId: match[2],
    };
  }

  getGameBananaInfoFromSocialMod(mod: any) {
    const linkInfo = this.getGameBananaInfoFromFightPlannerLink(mod?.link);
    if (linkInfo) return linkInfo;

    if (mod?.modId) {
      return {
        modelName: 'Mod',
        submissionId: String(mod.modId),
      };
    }

    return null;
  }

  renderGameBananaPagination(subfeedData: GameBananaSubfeedResponse) {
    const metadata = subfeedData?._aMetadata || {};
    const isComplete = metadata._bIsComplete === true;
    const canGoBack = this.gameBananaModsPage > 1;
    const canGoNext =
      !isComplete && this.gameBananaModsPage < this.gameBananaModsTotalPages;

    return `
      <button class="social-gamebanana-page-btn" data-page-action="prev" ${canGoBack ? '' : 'disabled'}>
        <i class="bi bi-chevron-left"></i>
      </button>
      <span class="social-gamebanana-page-label">Page ${this.gameBananaModsPage} / ${this.gameBananaModsTotalPages}</span>
      <button class="social-gamebanana-page-btn" data-page-action="next" ${canGoNext ? '' : 'disabled'}>
        <i class="bi bi-chevron-right"></i>
      </button>
    `;
  }

  renderGameBananaFeaturedStack() {
    if (this.gameBananaFeaturedMods.length === 0) return '';

    return this.gameBananaFeaturedMods
      .map((mod, index) => {
        const position = this.getGameBananaFeaturedPosition(index);
        return this.renderGameBananaFeaturedCard(mod, index, position);
      })
      .join('');
  }

  getGameBananaFeaturedPosition(index: number) {
    const total = this.gameBananaFeaturedMods.length;
    if (total === 0) return 'hidden';

    const active = this.gameBananaFeaturedIndex;
    const previous = (active - 1 + total) % total;
    const next = (active + 1) % total;

    if (index === active) return 'active';
    if (index === previous) return 'previous';
    if (index === next) return 'next';
    return 'hidden';
  }

  renderGameBananaFeaturedCard(
    mod: GameBananaTopSubmission,
    index: number,
    position: string,
  ) {
    const name = this.escapeHtml(mod._sName || 'Unknown Mod');
    const url = this.escapeHtml(mod._sProfileUrl || '');
    const imageUrl = this.escapeHtml(this.getGameBananaSubmissionImage(mod));
    const creator = this.escapeHtml(mod._aSubmitter?._sName || 'Unknown');
    const category = this.escapeHtml(mod._aRootCategory?._sName || 'Mod');
    const period = this.escapeHtml(this.formatGameBananaPeriod(mod._sPeriod));
    const likes = Number(mod._nLikeCount || 0);
    const comments = Number(mod._nPostCount || 0);
    const model = this.escapeHtml(mod._sModelName || 'Mod');
    const id = this.escapeHtml(mod._idRow);

    return `
      <article class="social-gamebanana-card social-gamebanana-card-featured is-${position}" data-url="${url}" data-gb-id="${id}" data-gb-model="${model}" data-featured-index="${index}" data-featured-position="${position}">
        ${
          imageUrl
            ? `<img src="${imageUrl}" alt="${name}" class="social-gamebanana-featured-image">`
            : '<div class="social-gamebanana-image-placeholder"><i class="bi bi-image"></i></div>'
        }
        <div class="social-gamebanana-featured-body">
          <div class="social-gamebanana-meta">
            <span>${category}</span>
            <span>${period}</span>
          </div>
          <h3 class="social-gamebanana-card-title">${name}</h3>
          <p class="social-gamebanana-card-creator">by ${creator}</p>
          <div class="social-gamebanana-card-footer">
            <span><i class="bi bi-hand-thumbs-up"></i> ${likes}</span>
            <span><i class="bi bi-chat-left"></i> ${comments}</span>
          </div>
        </div>
      </article>
    `;
  }

  renderGameBananaModCard(mod: GameBananaTopSubmission) {
    const name = this.escapeHtml(mod._sName || 'Unknown Mod');
    const url = this.escapeHtml(mod._sProfileUrl || '');
    const imageUrl = this.escapeHtml(this.getGameBananaSubmissionImage(mod));
    const creator = this.escapeHtml(mod._aSubmitter?._sName || 'Unknown');
    const category = this.escapeHtml(
      mod._aSubCategory?._sName ||
        mod._aRootCategory?._sName ||
        mod._sSingularTitle ||
        mod._sModelName ||
        'Mod',
    );
    const likes = Number(mod._nLikeCount || 0);
    const views = Number(mod._nViewCount || 0);
    const model = this.escapeHtml(mod._sModelName || 'Mod');
    const id = this.escapeHtml(mod._idRow);

    return `
      <article class="social-gamebanana-card social-gamebanana-card-compact" data-url="${url}" data-gb-id="${id}" data-gb-model="${model}">
        ${
          imageUrl
            ? `<img src="${imageUrl}" alt="${name}" class="social-gamebanana-card-image">`
            : '<div class="social-gamebanana-card-image social-gamebanana-image-placeholder"><i class="bi bi-image"></i></div>'
        }
        <div class="social-gamebanana-card-body">
          <p class="social-gamebanana-card-category">${category}</p>
          <h3 class="social-gamebanana-card-title">${name}</h3>
          <p class="social-gamebanana-card-creator">by ${creator}</p>
          <div class="social-gamebanana-card-footer">
            <span><i class="bi bi-hand-thumbs-up"></i> ${likes}</span>
            <span><i class="bi bi-eye"></i> ${views}</span>
            <button class="social-gamebanana-open-btn" data-url="${url}">
              <i class="bi bi-info-circle"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }

  getGameBananaSubmissionImage(mod: GameBananaTopSubmission) {
    return this.getGameBananaSubmissionImageInfo(mod).url;
  }

  getGameBananaPreviewImages(mod: GameBananaTopSubmission) {
    const images = mod._aPreviewMedia?._aImages;
    if (!Array.isArray(images)) return [];

    return images
      .map((image) => {
        if (!image?._sBaseUrl) return null;
        const fullFile = image._sFile || image._sFile800 || image._sFile530;
        const thumbFile =
          image._sFile220 || image._sFile100 || image._sFile530 || fullFile;
        if (!fullFile) return null;

        return {
          url: `${image._sBaseUrl}/${fullFile}`,
          thumbUrl: `${image._sBaseUrl}/${thumbFile}`,
          caption: image._sCaption || '',
          width: image._wFile || image._wFile800 || image._wFile530,
          height: image._hFile || image._hFile800 || image._hFile530,
        };
      })
      .filter(Boolean) as {
      url: string;
      thumbUrl: string;
      caption: string;
      width?: number;
      height?: number;
    }[];
  }

  getGameBananaSubmissionImageInfo(mod: GameBananaTopSubmission) {
    const previewImages = mod._aPreviewMedia?._aImages || [];
    for (const image of previewImages) {
      if (!image?._sBaseUrl) continue;

      const candidates = [
        {
          file: image._sFile800,
          width: image._wFile800,
          height: image._hFile800,
        },
        {
          file: image._sFile530,
          width: image._wFile530,
          height: image._hFile530,
        },
        { file: image._sFile, width: image._wFile, height: image._hFile },
        {
          file: image._sFile220,
          width: image._wFile220,
          height: image._hFile220,
        },
      ];

      const candidate = candidates.find((item) => item.file);
      if (candidate?.file) {
        return {
          url: `${image._sBaseUrl}/${candidate.file}`,
          width: candidate.width,
          height: candidate.height,
        };
      }
    }

    return { url: mod._sImageUrl || mod._sThumbnailUrl || '' };
  }

  stripGameBananaHtml(value) {
    const container = document.createElement('div');
    container.innerHTML = value == null ? '' : String(value);

    const blockTags = new Set([
      'ARTICLE',
      'BLOCKQUOTE',
      'DIV',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'LI',
      'OL',
      'P',
      'PRE',
      'SECTION',
      'TABLE',
      'TR',
      'UL',
    ]);
    let text = '';

    const addLineBreak = () => {
      if (text && !text.endsWith('\n')) {
        text += '\n';
      }
    };

    const appendNodeText = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as HTMLElement;
      const tagName = element.tagName;
      if (tagName === 'BR' || tagName === 'HR') {
        addLineBreak();
        return;
      }

      if (blockTags.has(tagName)) {
        addLineBreak();
      }

      element.childNodes.forEach(appendNodeText);

      if (blockTags.has(tagName)) {
        addLineBreak();
      }
    };

    container.childNodes.forEach(appendNodeText);

    return text
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t\f\v]+\n/g, '\n')
      .replace(/\n[ \t\f\v]+/g, '\n')
      .replace(/[ \t\f\v]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  getGameBananaSubmissionDescription(
    details: any,
    fallback?: GameBananaTopSubmission,
  ) {
    const rawDescription =
      details?._sText ||
      details?._sDescription ||
      details?._sSummary ||
      details?._aProfile?._sText ||
      details?._aProfile?._sDescription ||
      details?._aPreviewMedia?._aMetadata?._sSnippet ||
      fallback?._sDescription ||
      fallback?._aPreviewMedia?._aMetadata?._sSnippet ||
      '';

    return this.stripGameBananaHtml(rawDescription);
  }

  getGameBananaSubmissionDate(mod: GameBananaTopSubmission) {
    if (!mod._tsDateAdded) return '';

    try {
      return new Date(mod._tsDateAdded * 1000).toLocaleDateString();
    } catch (e) {
      return '';
    }
  }

  normalizeDependencyName(value: string) {
    return String(value || '')
      .toLowerCase()
      .replace(/\.nro$/i, '')
      .replace(/^lib/, '')
      .replace(/[^a-z0-9]/g, '');
  }

  getDependencyAliases(requirementName: string) {
    const normalized = this.normalizeDependencyName(requirementName);
    const aliases: Record<string, string[]> = {
      arcropolis: ['arcropolis', 'arcroplois', 'libarcropolis'],
      nrohook: ['nrohook', 'nrohookplugin', 'libnrohook'],
      smashline2: [
        'smashline2',
        'smashline',
        'smashlineplugin',
        'smashlinehook',
        'libsmashlinehook',
        'libsmashlineplugin',
      ],
      paramconfig: ['paramconfig', 'libparamconfig'],
      skyline: ['skyline', 'libskyline'],
    };

    return new Set([normalized, ...(aliases[normalized] || [])]);
  }

  isSkylineRequirement(requirementName: string) {
    return this.getDependencyAliases(requirementName).has('skyline');
  }

  normalizeLocalPath(value: string) {
    return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
  }

  getSkylineRomfsDirsFromSettings() {
    const candidates = new Set<string>();
    const pluginsPath = this.normalizeLocalPath(
      window.settingsManager?.getPluginsPath?.() ||
        window.pluginManager?.pluginsPath ||
        '',
    );
    const modsPath = this.normalizeLocalPath(
      window.settingsManager?.getModsPath?.() || '',
    );

    const addFromConfiguredPath = (configuredPath: string) => {
      if (!configuredPath) return;

      const contentMatch = configuredPath.match(
        /^(.*?)(?:\/ultimate\/contents|\/atmosphere\/contents)\/01006A800016E000(?:\/|$)/i,
      );
      if (contentMatch?.[1]) {
        candidates.add(
          `${contentMatch[1]}/atmosphere/contents/01006A800016E000/romfs/skyline`,
        );
      }

      const pluginsMatch = configuredPath.match(
        /^(.*\/(?:atmosphere|ultimate)\/contents\/01006A800016E000)\/romfs\/skyline\/plugins(?:\/|$)/i,
      );
      if (pluginsMatch?.[1]) {
        const contentDir = pluginsMatch[1].replace(
          /\/ultimate\/contents\/01006A800016E000$/i,
          '/atmosphere/contents/01006A800016E000',
        );
        candidates.add(`${contentDir}/romfs/skyline`);
      }

      const skylineRomfsMatch = configuredPath.match(
        /^(.*\/(?:atmosphere|ultimate)\/contents\/01006A800016E000\/romfs\/skyline)(?:\/|$)/i,
      );
      if (skylineRomfsMatch?.[1]) {
        candidates.add(
          skylineRomfsMatch[1].replace(
            /\/ultimate\/contents\/01006A800016E000\/romfs\/skyline$/i,
            '/atmosphere/contents/01006A800016E000/romfs/skyline',
          ),
        );
      }
    };

    addFromConfiguredPath(pluginsPath);
    addFromConfiguredPath(modsPath);
    (window.pluginManager?.plugins || []).forEach((plugin) => {
      addFromConfiguredPath(this.normalizeLocalPath(plugin.filePath || ''));
    });

    const modsMatch = modsPath.match(/^(.*)\/ultimate\/mods(?:\/|$)/i);
    if (modsMatch?.[1]) {
      candidates.add(
        `${modsMatch[1]}/atmosphere/contents/01006A800016E000/romfs/skyline`,
      );
    }

    return Array.from(candidates);
  }

  async refreshSkylineDependencyStatus() {
    if (!window.electronAPI?.folderExists) {
      this.skylineInstalledCache = false;
      return false;
    }

    const skylineDirs = this.getSkylineRomfsDirsFromSettings();
    for (const skylineDir of skylineDirs) {
      try {
        const result = await window.electronAPI.folderExists(skylineDir);
        if (result?.success && result.exists) {
          this.skylineInstalledCache = true;
          return true;
        }
      } catch (error) {
        console.warn('[Social] Failed to check Skyline installation:', error);
      }
    }

    this.skylineInstalledCache = false;
    return false;
  }

  getGameBananaRequirements(
    mod: GameBananaTopSubmission & { _aRequirements?: any },
  ) {
    const requirements = mod._aRequirements;
    if (!Array.isArray(requirements)) return [];

    return requirements
      .map((requirement) => {
        const name = Array.isArray(requirement)
          ? requirement[0]
          : requirement?._sName || requirement?.name || requirement?.title;
        const url = Array.isArray(requirement)
          ? requirement[1]
          : requirement?._sUrl || requirement?.url || requirement?._sProfileUrl;

        if (!name) return null;
        return {
          name: String(name),
          url: String(url || ''),
        };
      })
      .filter(Boolean) as { name: string; url: string }[];
  }

  findInstalledDependency(requirementName: string) {
    if (
      this.isSkylineRequirement(requirementName) &&
      this.skylineInstalledCache
    ) {
      return {
        id: 'skyline',
        name: 'Skyline',
        size: '',
        status: 'active',
        filePath: '',
      };
    }

    const aliases = this.getDependencyAliases(requirementName);
    const plugins = window.pluginManager?.plugins || [];

    return plugins.find((plugin) => {
      const candidates = [
        plugin.name,
        plugin.id,
        plugin.filePath?.split(/[\\/]/).pop() || '',
      ].map((value) => this.normalizeDependencyName(value));

      return candidates.some(
        (candidate) =>
          aliases.has(candidate) ||
          Array.from(aliases).some(
            (alias) =>
              candidate.includes(alias) || alias.includes(candidate),
          ),
      );
    });
  }

  findMarketplaceDependency(requirementName: string, url = '') {
    const marketplacePlugins = window.pluginMarketplace?.getPlugins?.() || [];
    const aliases = this.getDependencyAliases(requirementName);
    const normalizedUrl = this.normalizeDependencyName(url);

    return marketplacePlugins.find((plugin) => {
      const candidates = [
        plugin.name,
        plugin.repo,
        plugin.repo?.split('/').pop() || '',
        plugin.description,
        plugin.url,
      ].map((value) => this.normalizeDependencyName(value));

      return (
        candidates.some((candidate) => aliases.has(candidate)) ||
        (!!normalizedUrl &&
          candidates.some(
            (candidate) => candidate && normalizedUrl.includes(candidate),
          ))
      );
    });
  }

  renderGameBananaRequirements(
    mod: GameBananaTopSubmission & { _aRequirements?: any },
  ) {
    const requirements = this.getGameBananaRequirements(mod);
    if (!requirements.length) return '';

    return `
      <div class="social-gamebanana-requirements">
        <h4 class="social-gamebanana-requirements-title">Requirements</h4>
        <div class="social-gamebanana-requirements-list">
          ${requirements
            .map((requirement) =>
              this.renderGameBananaRequirementItem(requirement),
            )
            .join('')}
        </div>
      </div>
    `;
  }

  renderGameBananaRequirementItem(requirement: { name: string; url: string }) {
    const installedPlugin = this.findInstalledDependency(requirement.name);
    const marketplacePlugin = this.findMarketplaceDependency(
      requirement.name,
      requirement.url,
    );
    const name = this.escapeHtml(requirement.name);
    const url = this.escapeHtml(requirement.url);
    const searchQuery = this.escapeHtml(
      `${requirement.name} Super Smash Bros Ultimate GameBanana`,
    );
    const statusClass = installedPlugin
      ? 'is-installed'
      : marketplacePlugin
        ? 'is-installable'
        : 'is-external';
    const statusText = installedPlugin
      ? installedPlugin.status === 'disabled'
        ? 'Installed disabled'
        : 'Installed'
      : marketplacePlugin
        ? 'Not installed'
        : 'Manual search';
    const installButton =
      !installedPlugin && marketplacePlugin
        ? `<button class="social-gamebanana-requirement-install" data-plugin-name="${this.escapeHtml(marketplacePlugin.name)}" data-plugin-repo="${this.escapeHtml(marketplacePlugin.repo)}">
            <i class="bi bi-download"></i>
            <span>Install</span>
          </button>`
        : '';
    const openButton = url
      ? `<button class="social-gamebanana-requirement-link" data-url="${url}">
          <i class="bi bi-box-arrow-up-right"></i>
          <span>Open</span>
        </button>`
      : '';

    return `
      <div class="social-gamebanana-requirement ${statusClass}">
        <div class="social-gamebanana-requirement-main">
          <strong>${name}</strong>
          <span>${statusText}</span>
        </div>
        <div class="social-gamebanana-requirement-actions">
          ${installButton}
          ${openButton}
          ${
            !marketplacePlugin
              ? `<button class="social-gamebanana-requirement-search" data-query="${searchQuery}" data-provider="gamebanana">
                  <i class="bi bi-search"></i>
                  <span>GameBanana</span>
                </button>
                <button class="social-gamebanana-requirement-search" data-query="${searchQuery}" data-provider="google">
                  <i class="bi bi-google"></i>
                  <span>Google</span>
                </button>`
              : ''
          }
        </div>
      </div>
    `;
  }

  async installGameBananaRequirement(pluginName: string, repo: string) {
    if (!window.pluginMarketplace) return;

    const downloadInfo =
      await window.pluginMarketplace.getLatestReleaseDownloadUrl(repo);
    if (!downloadInfo) {
      window.toastManager?.error(
        `No downloadable release found for ${pluginName}`,
      );
      return;
    }

    await window.pluginMarketplace.downloadAndInstallPlugin(
      pluginName,
      repo,
      downloadInfo,
    );
  }

  getGameBananaRequirementSearchUrl(query: string, provider: string) {
    const encodedQuery = encodeURIComponent(query);
    if (provider === 'gamebanana') {
      return `https://gamebanana.com/search?_sSearchString=${encodedQuery}`;
    }

    return `https://www.google.com/search?q=${encodedQuery}`;
  }

  getMissingGameBananaRequirements() {
    if (!this.gameBananaCurrentDetail) return [];

    const merged = {
      ...this.gameBananaCurrentDetail.fallback,
      ...this.gameBananaCurrentDetail.details,
    } as GameBananaTopSubmission & { _aRequirements?: any };

    return this.getGameBananaRequirements(merged)
      .map((requirement) => {
        const installedPlugin = this.findInstalledDependency(requirement.name);
        const marketplacePlugin = this.findMarketplaceDependency(
          requirement.name,
          requirement.url,
        );
        const isDisabled = installedPlugin?.status === 'disabled';
        const isMissing = !installedPlugin || isDisabled;

        if (!isMissing) return null;

        return {
          ...requirement,
          reason: isDisabled ? 'Installed but disabled' : 'Missing',
          marketplacePlugin,
        };
      })
      .filter(Boolean) as {
      name: string;
      url: string;
      reason: string;
      marketplacePlugin?: any;
    }[];
  }

  confirmMissingGameBananaRequirements() {
    const missingRequirements = this.getMissingGameBananaRequirements();
    if (!missingRequirements.length) return Promise.resolve(true);

    if (!window.modalManager?.showCustomModal) {
      return Promise.resolve(
        window.confirm(
          `This mod has ${missingRequirements.length} missing or disabled requirement(s). Continue anyway?`,
        ),
      );
    }

    const items = missingRequirements
      .map((requirement) => {
        const source = requirement.marketplacePlugin
          ? 'Available in marketplace'
          : 'Manual install needed';

        return `
          <li class="social-gamebanana-missing-requirement">
            <strong>${this.escapeHtml(requirement.name)}</strong>
            <span>${this.escapeHtml(requirement.reason)} - ${source}</span>
          </li>
        `;
      })
      .join('');

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      window.modalManager.showCustomModal({
        id: 'social-gamebanana-requirements-warning-modal',
        title: 'Missing requirements',
        body: `
          <div class="social-gamebanana-requirements-warning">
            <p>This mod lists requirements that are not currently active in your plugins folder.</p>
            <ul>${items}</ul>
            <p>You can continue, but the mod may crash or not work correctly until these dependencies are installed and enabled.</p>
          </div>
        `,
        size: 'normal',
        clickOverlayToClose: false,
        escapeToClose: false,
        onClose: () => settle(false),
        buttons: [
          {
            text: 'Cancel',
            type: 'secondary',
            onClick: () => settle(false),
          },
          {
            text: 'Continue anyway',
            type: 'primary',
            onClick: () => settle(true),
          },
        ],
      });
    });
  }

  getGameBananaDetailImageStyle(mod: GameBananaTopSubmission) {
    const image = this.getGameBananaSubmissionImageInfo(mod);
    const width = Number(image.width || 0);
    const height = Number(image.height || 0);

    if (width > 0 && height > 0) {
      return ` style="aspect-ratio: ${width} / ${height};"`;
    }

    return '';
  }

  renderGameBananaImageGallery(mod: GameBananaTopSubmission, name: string) {
    const images = this.getGameBananaPreviewImages(mod);
    const fallbackImage = this.getGameBananaSubmissionImage(mod);
    const galleryImages = images.length
      ? images
      : fallbackImage
        ? [{ url: fallbackImage, thumbUrl: fallbackImage, caption: '' }]
        : [];

    if (!galleryImages.length) {
      return '<div class="social-gamebanana-detail-image social-gamebanana-image-placeholder"><i class="bi bi-image"></i></div>';
    }

    const activeImage = galleryImages[0];
    const activeCaption = this.escapeHtml(activeImage.caption || '');
    const imageStyle =
      activeImage.width && activeImage.height
        ? ` style="aspect-ratio: ${activeImage.width} / ${activeImage.height};"`
        : this.getGameBananaDetailImageStyle(mod);

    return `
      <div class="social-gamebanana-gallery" data-gallery-index="0">
        <div class="social-gamebanana-gallery-main">
          <img src="${this.escapeHtml(activeImage.url)}" alt="${name}" class="social-gamebanana-detail-image"${imageStyle}>
          <div class="social-gamebanana-gallery-loading" aria-hidden="true">
            <div class="social-gamebanana-gallery-skeleton social-gamebanana-skeleton-block"></div>
            <div class="social-gamebanana-gallery-skeleton-caption">
              <span class="social-gamebanana-skeleton-block"></span>
              <span class="social-gamebanana-skeleton-block"></span>
            </div>
          </div>
          ${
            galleryImages.length > 1
              ? `<button class="social-gamebanana-gallery-nav is-prev" data-gallery-direction="-1" title="Previous image">
                  <i class="bi bi-chevron-left"></i>
                </button>
                <button class="social-gamebanana-gallery-nav is-next" data-gallery-direction="1" title="Next image">
                  <i class="bi bi-chevron-right"></i>
                </button>`
              : ''
          }
        </div>
        ${activeCaption ? `<p class="social-gamebanana-gallery-caption">${activeCaption}</p>` : ''}
        ${
          galleryImages.length > 1
            ? `<div class="social-gamebanana-gallery-thumbs">
                ${galleryImages
                  .map(
                    (image, index) =>
                      `<button class="social-gamebanana-gallery-thumb ${index === 0 ? 'active' : ''}" data-gallery-index="${index}" data-image-url="${this.escapeHtml(image.url)}" data-caption="${this.escapeHtml(image.caption)}" data-width="${this.escapeHtml(image.width || '')}" data-height="${this.escapeHtml(image.height || '')}" title="Image ${index + 1}">
                        <img src="${this.escapeHtml(image.thumbUrl)}" alt="${name} ${index + 1}">
                      </button>`,
                  )
                  .join('')}
              </div>`
            : ''
        }
      </div>
    `;
  }

  async showGameBananaSubmissionDetails(
    modelName: string,
    submissionId: string,
    sourceCard?: HTMLElement,
  ) {
    const fallback =
      this.getCachedGameBananaSubmission(modelName, submissionId) || null;
    const sourceRect = this.getGameBananaSourcePreviewRect(sourceCard);

    if (fallback) {
      this.renderGameBananaDetailPage(null, fallback, false, [], true);
      this.scrollGameBananaDetailToTop();
      this.animateGameBananaPreviewToDetail(sourceCard, sourceRect);
      await this.fadeGameBananaDetailInfo('in');
    } else {
      this.renderGameBananaDetailPage(null, fallback, true);
      this.scrollGameBananaDetailToTop();
      await this.fadeGameBananaDetailInfo('in');
    }

    try {
      const [detailsResult, filesResult] = await Promise.all([
        window.electronAPI?.fetchGameBananaDetails
          ? window.electronAPI.fetchGameBananaDetails(modelName, submissionId)
          : Promise.resolve(null),
        window.electronAPI?.fetchGameBananaFiles
          ? window.electronAPI.fetchGameBananaFiles(modelName, submissionId)
          : Promise.resolve(null),
      ]);

      let detailData: any = null;
      let filesData: GameBananaFileEntry[] = [];
      if (detailsResult?.success) {
        detailData = detailsResult.data;
      } else if (detailsResult) {
        console.warn(
          '[Social] Failed to fetch GameBanana details:',
          detailsResult,
        );
      }

      if (filesResult?.success && Array.isArray(filesResult.files)) {
        filesData = filesResult.files;
      } else if (filesResult) {
        console.warn('[Social] Failed to fetch GameBanana files:', filesResult);
      }

      if (fallback && this.gameBananaPreviewAnimation) {
        await this.gameBananaPreviewAnimation;
      }

      await this.refreshSkylineDependencyStatus();
      this.renderGameBananaDetailPage(detailData, fallback, false, filesData);
      this.scrollGameBananaDetailToTop();
      if (!fallback) {
        this.animateGameBananaPreviewToDetail(sourceCard, sourceRect);
      }
      await this.fadeGameBananaDetailInfo('in');
    } catch (error) {
      console.error('[Social] Error loading GameBanana details:', error);
      this.renderGameBananaDetailPage(null, fallback, false);
      this.scrollGameBananaDetailToTop();
      if (!fallback) {
        this.animateGameBananaPreviewToDetail(sourceCard, sourceRect);
      }
      await this.fadeGameBananaDetailInfo('in');
    }
  }

  getGameBananaSourcePreviewRect(sourceCard?: HTMLElement) {
    const sourceImage = sourceCard?.querySelector<HTMLElement>(
      '.social-gamebanana-featured-image, .social-gamebanana-card-image, .social-mod-image',
    );
    const source = sourceImage || sourceCard;
    return source?.getBoundingClientRect() || null;
  }

  getSocialMainScrollTop() {
    const mainContent = document.querySelector<HTMLElement>(
      '.social-main-content',
    );
    return mainContent?.scrollTop || 0;
  }

  setSocialMainScrollTop(scrollTop: number) {
    const mainContent = document.querySelector<HTMLElement>(
      '.social-main-content',
    );
    if (mainContent) {
      mainContent.scrollTop = scrollTop;
    }
  }

  scrollGameBananaDetailToTop() {
    this.setSocialMainScrollTop(0);
    const discoverContent = document.querySelector<HTMLElement>(
      '#social-discover-content',
    );
    if (discoverContent) {
      discoverContent.scrollTop = 0;
    }

    requestAnimationFrame(() => {
      this.setSocialMainScrollTop(0);
      if (discoverContent) {
        discoverContent.scrollTop = 0;
      }
    });
  }

  getActiveSocialSection() {
    const activeSection = document.querySelector<HTMLElement>(
      '.social-section.active',
    );
    return activeSection?.id.replace('social-section-', '') || 'discover';
  }

  activateSocialSectionWithoutLoading(sectionName: string) {
    const navItems = document.querySelectorAll<HTMLElement>('.social-nav-item');
    navItems.forEach((item) => {
      item.classList.toggle(
        'active',
        item.getAttribute('data-section') === sectionName,
      );
    });

    const sections = document.querySelectorAll<HTMLElement>('.social-section');
    sections.forEach((section) => {
      section.classList.toggle(
        'active',
        section.id === `social-section-${sectionName}`,
      );
      section.style.opacity = '';
      section.style.transform = '';
      section.style.transition = '';
    });
  }

  createGameBananaFallbackFromSocialCard(
    card: HTMLElement,
    modelName: string,
    submissionId: string,
  ): GameBananaTopSubmission {
    const name = card.getAttribute('data-gb-name') || 'Unknown Mod';
    const imageUrl = card.getAttribute('data-gb-image') || '';
    const creator = card.getAttribute('data-gb-creator') || 'Unknown';

    return {
      _idRow: Number(submissionId),
      _sModelName: modelName,
      _sName: name,
      _sProfileUrl: this.getGameBananaProfileUrl(modelName, submissionId),
      _sImageUrl: imageUrl,
      _aSubmitter: {
        _sName: creator,
      },
    };
  }

  async openSocialModGameBananaDetails(card: HTMLElement) {
    const modelName = card.getAttribute('data-gb-model') || 'Mod';
    const submissionId = card.getAttribute('data-gb-id');
    if (!submissionId) return;

    const previousSection = this.getActiveSocialSection();
    this.gameBananaDetailReturnSection =
      previousSection !== 'discover' ? previousSection : null;
    this.gameBananaDetailReturnScrollTop = this.getSocialMainScrollTop();

    this.activateSocialSectionWithoutLoading('discover');
    this.captureGameBananaDiscoverSnapshot();
    this.setSocialMainScrollTop(0);

    const fallback = this.createGameBananaFallbackFromSocialCard(
      card,
      modelName,
      submissionId,
    );
    this.cacheGameBananaSubmission(fallback);

    this.gameBananaLastDetailSource = {
      modelName,
      submissionId,
      sourceKind: 'social',
      page: this.gameBananaModsPage,
      scrollTop: this.getSocialMainScrollTop(),
    };

    await this.showGameBananaSubmissionDetails(modelName, submissionId);
  }

  keepGameBananaTargetVisible(target: HTMLElement) {
    const mainContent = document.querySelector<HTMLElement>(
      '.social-main-content',
    );
    if (!mainContent) return;

    const containerRect = mainContent.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const padding = 24;

    if (targetRect.top < containerRect.top + padding) {
      mainContent.scrollTop -= containerRect.top + padding - targetRect.top;
    } else if (targetRect.bottom > containerRect.bottom - padding) {
      mainContent.scrollTop +=
        targetRect.bottom - (containerRect.bottom - padding);
    }
  }

  getGameBananaCardSourceKind(card: HTMLElement): 'featured' | 'grid' {
    return card.classList.contains('social-gamebanana-card-featured')
      ? 'featured'
      : 'grid';
  }

  findGameBananaReturnTarget(
    source: NonNullable<SocialManagerBase['gameBananaLastDetailSource']>,
  ) {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('.social-gamebanana-card'),
    ).filter(
      (card) =>
        card.getAttribute('data-gb-model') === source.modelName &&
        card.getAttribute('data-gb-id') === source.submissionId,
    );

    return (
      cards.find(
        (card) => this.getGameBananaCardSourceKind(card) === source.sourceKind,
      ) ||
      cards[0] ||
      null
    );
  }

  captureGameBananaDiscoverSnapshot() {
    const discoverContent = document.querySelector<HTMLElement>(
      '#social-discover-content',
    );
    if (!discoverContent) return;

    this.gameBananaDiscoverSnapshot = {
      html: discoverContent.innerHTML,
      page: this.gameBananaModsPage,
      scrollTop: this.getSocialMainScrollTop(),
    };
  }

  fadeGameBananaDetailInfo(direction: 'in' | 'out') {
    const gsapRef = window.gsap as any;
    const detailInfo = document.querySelector<HTMLElement>(
      '.social-gamebanana-detail-info',
    );
    if (!detailInfo) return Promise.resolve();

    if (!gsapRef) {
      detailInfo.style.opacity = direction === 'in' ? '1' : '0';
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      gsapRef.to(detailInfo, {
        autoAlpha: direction === 'in' ? 1 : 0,
        y: direction === 'in' ? 0 : 8,
        duration: 0.16,
        ease: 'power1.out',
        onComplete: resolve,
      });
    });
  }

  fadeGameBananaRestoredBackground() {
    const gsapRef = window.gsap as any;
    const discoverContent = document.querySelector<HTMLElement>(
      '#social-discover-content',
    );
    if (!gsapRef || !discoverContent) return;

    gsapRef.fromTo(
      discoverContent,
      { autoAlpha: 0.86 },
      {
        autoAlpha: 1,
        duration: 0.18,
        ease: 'power1.out',
        overwrite: 'auto',
      },
    );
  }

  fadeGameBananaDetailOverlayOut(discoverContent: HTMLElement) {
    const gsapRef = window.gsap as any;
    if (!gsapRef) return;

    const rect = discoverContent.getBoundingClientRect();
    const overlay = discoverContent.cloneNode(true) as HTMLElement;
    overlay.style.position = 'fixed';
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.margin = '0';
    overlay.style.overflow = 'hidden';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '9999';
    document.body.appendChild(overlay);

    gsapRef.to(overlay, {
      autoAlpha: 0,
      duration: 0.18,
      ease: 'power1.out',
      onComplete: () => overlay.remove(),
    });
  }

  animateGameBananaPreviewToDetail(
    sourceCard?: HTMLElement,
    sourceRect?: DOMRect | null,
  ) {
    const gsapRef = window.gsap as any;
    const targetImage = document.querySelector<HTMLElement>(
      '.social-gamebanana-detail-image',
    );
    const sourceImage = sourceCard?.querySelector<HTMLImageElement>(
      '.social-gamebanana-featured-image, .social-gamebanana-card-image',
    );

    if (!gsapRef || !sourceRect || !targetImage || !sourceImage?.src) {
      this.gameBananaPreviewAnimation = null;
      return Promise.resolve();
    }

    const targetRect = targetImage.getBoundingClientRect();
    const clone = document.createElement('img');
    clone.src = sourceImage.src;
    clone.className = 'social-gamebanana-preview-flyout';
    clone.style.objectFit = 'cover';
    clone.style.objectPosition = 'center';
    clone.style.left = `${sourceRect.left}px`;
    clone.style.top = `${sourceRect.top}px`;
    clone.style.width = `${sourceRect.width}px`;
    clone.style.height = `${sourceRect.height}px`;
    document.body.appendChild(clone);

    gsapRef.set(targetImage, { autoAlpha: 0 });
    this.gameBananaPreviewAnimation = new Promise<void>((resolve) => {
      gsapRef.fromTo(
        clone,
        {
          x: 0,
          y: 0,
          width: sourceRect.width,
          height: sourceRect.height,
        },
        {
          x: targetRect.left - sourceRect.left,
          y: targetRect.top - sourceRect.top,
          width: targetRect.width,
          height: targetRect.height,
          duration: 0.46,
          ease: 'power3.out',
          onComplete: () => {
            clone.remove();
            gsapRef.to(targetImage, {
              autoAlpha: 1,
              duration: 0.12,
              ease: 'power1.out',
              onComplete: () => {
                this.gameBananaPreviewAnimation = null;
                resolve();
              },
            });
          },
        },
      );
    });

    gsapRef.fromTo(
      '.social-gamebanana-detail-info',
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.28, delay: 0.12, ease: 'power2.out' },
    );

    return this.gameBananaPreviewAnimation;
  }

  async returnFromGameBananaDetail() {
    if (this.gameBananaDetailReturnInProgress) return;
    this.gameBananaDetailReturnInProgress = true;

    try {
      const detailImage = document.querySelector<HTMLImageElement>(
        '.social-gamebanana-detail-image',
      );
      const firstGalleryImageSrc =
        this.startGameBananaGalleryBackToFirstImage();
      const source = this.gameBananaLastDetailSource;
      const detailRect = detailImage?.getBoundingClientRect() || null;
      const detailSrc = firstGalleryImageSrc || detailImage?.src || '';
      const snapshot = this.gameBananaDiscoverSnapshot;
      const returnSection = this.gameBananaDetailReturnSection;
      const returnScrollTop = this.gameBananaDetailReturnScrollTop;

      if (snapshot) {
        const discoverContent = document.querySelector<HTMLElement>(
          '#social-discover-content',
        );
        if (discoverContent) {
          this.fadeGameBananaDetailOverlayOut(discoverContent);
          discoverContent.innerHTML = snapshot.html;
          discoverContent.style.opacity = '1';
          discoverContent.style.visibility = 'visible';
          discoverContent.style.transform = '';
          discoverContent.style.transition = '';
        }
        this.gameBananaModsPage = snapshot.page;
        this.setGameBananaFeaturedCardPositions();
        this.setSocialMainScrollTop(snapshot.scrollTop);
        this.fadeGameBananaRestoredBackground();
      } else {
        const pageToRestore = source?.page || 1;
        await this.loadDiscover();
        if (pageToRestore > 1) {
          await this.loadGameBananaModsPage(pageToRestore);
        }
        this.setSocialMainScrollTop(source?.scrollTop || 0);
        this.fadeGameBananaRestoredBackground();
      }

      this.gameBananaDiscoverSnapshot = null;
      this.gameBananaCurrentDetail = null;
      this.gameBananaLastDetailSource = null;
      this.gameBananaDetailReturnSection = null;
      this.gameBananaDetailReturnScrollTop = 0;

      if (returnSection && returnSection !== 'discover') {
        this.switchSection(returnSection);
        setTimeout(() => this.setSocialMainScrollTop(returnScrollTop), 280);
        return;
      }

      if (!source || !detailRect || !detailSrc) {
        return;
      }

      const targetCard = this.findGameBananaReturnTarget(source);
      const targetImage = targetCard?.querySelector<HTMLElement>(
        '.social-gamebanana-featured-image, .social-gamebanana-card-image',
      );
      if (targetCard) {
        this.keepGameBananaTargetVisible(targetCard);
      }
      const targetRect = targetImage?.getBoundingClientRect() || null;

      if (!targetImage || !targetRect) return;

      this.animateGameBananaDetailToPreview(detailRect, detailSrc, targetImage);
    } finally {
      this.gameBananaDetailReturnInProgress = false;
    }
  }

  startGameBananaGalleryBackToFirstImage() {
    const gallery = document.querySelector<HTMLElement>(
      '.social-gamebanana-gallery',
    );
    const image = gallery?.querySelector<HTMLImageElement>(
      '.social-gamebanana-detail-image',
    );
    const firstThumb = gallery?.querySelector<HTMLButtonElement>(
      '.social-gamebanana-gallery-thumb[data-gallery-index="0"]',
    );
    if (!gallery || !image || !firstThumb) return '';

    const currentIndex = Number(
      gallery.getAttribute('data-gallery-index') || 0,
    );
    if (currentIndex === 0) return image.src || '';

    const firstImageUrl = firstThumb.getAttribute('data-image-url');
    if (!firstImageUrl) return image.src || '';
    if (image.src === firstImageUrl) return firstImageUrl;

    const width = Number(firstThumb.getAttribute('data-width'));
    const height = Number(firstThumb.getAttribute('data-height'));
    if (width > 0 && height > 0) {
      image.style.aspectRatio = `${width} / ${height}`;
    } else {
      image.style.aspectRatio = '';
    }

    image.style.transition = 'opacity 0.18s ease';
    image.style.opacity = '0.55';
    image.src = firstImageUrl;
    this.updateGameBananaGalleryCaption(
      gallery,
      firstThumb.getAttribute('data-caption') || '',
    );
    gallery.setAttribute('data-gallery-index', '0');
    gallery
      .querySelectorAll<HTMLButtonElement>('.social-gamebanana-gallery-thumb')
      .forEach((thumb) => {
        thumb.classList.toggle(
          'active',
          thumb.getAttribute('data-gallery-index') === '0',
        );
      });

    requestAnimationFrame(() => {
      image.style.opacity = '1';
      window.setTimeout(() => {
        image.style.transition = '';
      }, 190);
    });

    return firstImageUrl;
  }

  animateGameBananaDetailToPreview(
    detailRect: DOMRect,
    detailSrc: string,
    targetImage: HTMLElement,
  ) {
    const gsapRef = window.gsap as any;
    const targetRect = targetImage.getBoundingClientRect();

    if (!gsapRef || !targetRect) return;

    const clone = document.createElement('img');
    clone.src = detailSrc;
    clone.className = 'social-gamebanana-preview-flyout';
    clone.style.objectFit = 'cover';
    clone.style.objectPosition = 'center';
    clone.style.left = `${detailRect.left}px`;
    clone.style.top = `${detailRect.top}px`;
    clone.style.width = `${detailRect.width}px`;
    clone.style.height = `${detailRect.height}px`;
    document.body.appendChild(clone);

    gsapRef.fromTo(
      clone,
      {
        x: 0,
        y: 0,
        width: detailRect.width,
        height: detailRect.height,
      },
      {
        x: targetRect.left - detailRect.left,
        y: targetRect.top - detailRect.top,
        width: targetRect.width,
        height: targetRect.height,
        duration: 0.42,
        ease: 'power3.out',
        onComplete: () => {
          gsapRef.to(targetImage, {
            autoAlpha: 1,
            duration: 0.12,
            ease: 'power1.out',
          });
          clone.remove();
        },
      },
    );
  }

  renderGameBananaDetailPage(
    details: any,
    fallback: GameBananaTopSubmission | null,
    loading: boolean,
    files: GameBananaFileEntry[] = [],
    contentLoading = false,
  ) {
    const discoverContent = document.querySelector<HTMLElement>(
      '#social-discover-content',
    );
    if (!discoverContent) return;

    this.gameBananaCurrentDetail = loading
      ? null
      : {
          details,
          fallback,
          files,
        };

    const merged = {
      ...fallback,
      ...details,
      _aSubmitter: details?._aSubmitter || fallback?._aSubmitter,
      _sModelName: details?._sModelName || fallback?._sModelName,
      _aRootCategory:
        details?._aRootCategory ||
        details?._aCategory ||
        fallback?._aRootCategory,
      _aSubCategory: details?._aSubCategory || fallback?._aSubCategory,
      _aPreviewMedia: details?._aPreviewMedia || fallback?._aPreviewMedia,
    } as GameBananaTopSubmission & { _aAdditionalInfo?: any };

    const name = this.escapeHtml(merged._sName || 'Unknown Mod');
    const creator = this.escapeHtml(merged._aSubmitter?._sName || 'Unknown');
    const model = this.escapeHtml(merged._sModelName || 'Mod');
    const rootCategory = this.escapeHtml(
      merged._aRootCategory?._sName || 'Unknown',
    );
    const subCategory = this.escapeHtml(merged._aSubCategory?._sName || '');
    const profileUrl = this.escapeHtml(merged._sProfileUrl || '');
    const description = this.escapeHtml(
      this.getGameBananaSubmissionDescription(details, fallback || undefined) ||
        'No description available.',
    );
    const likes = Number(merged._nLikeCount || 0);
    const comments = Number(merged._nPostCount || 0);
    const views = Number(merged._nViewCount || 0);
    const dateAdded = this.escapeHtml(this.getGameBananaSubmissionDate(merged));

    const detailImage = loading
      ? '<div class="social-gamebanana-detail-image social-gamebanana-detail-image-skeleton social-gamebanana-skeleton-block"></div>'
      : this.renderGameBananaImageGallery(merged, name);
    const detailInfo = loading
      ? this.renderGameBananaDetailSkeletonInfo()
      : `
        <div class="social-gamebanana-detail-info">
          <div class="social-gamebanana-detail-meta">
            <span>${model}</span>
            <span>${rootCategory}${subCategory ? ` / ${subCategory}` : ''}</span>
            ${dateAdded ? `<span>${dateAdded}</span>` : ''}
          </div>
          <h3 class="social-gamebanana-detail-name">${name}</h3>
          <p class="social-gamebanana-detail-author">by ${creator}</p>
          <div class="social-gamebanana-detail-stats">
            <span><i class="bi bi-hand-thumbs-up"></i> ${likes}</span>
            <span><i class="bi bi-chat-left"></i> ${comments}</span>
            <span><i class="bi bi-eye"></i> ${views}</span>
          </div>
          ${
            contentLoading
              ? this.renderGameBananaDescriptionSkeleton()
              : `<p class="social-gamebanana-detail-description">${description}</p>`
          }
          ${this.renderGameBananaWipInfo(merged)}
          ${this.renderGameBananaRequirements(merged)}
          ${this.renderGameBananaFileList(files, contentLoading)}
        </div>
      `;

    discoverContent.innerHTML = `
      <div class="social-gamebanana-detail-page">
        <div class="social-gamebanana-detail-toolbar">
          <button class="social-back-button social-gamebanana-detail-back">
            <i class="bi bi-arrow-left"></i> Back
          </button>
          ${
            profileUrl
              ? `<button class="social-gamebanana-external-btn" data-url="${profileUrl}">
                  <i class="bi bi-box-arrow-up-right"></i>
                  <span>GameBanana</span>
                </button>`
              : ''
          }
        </div>
        <div class="social-gamebanana-detail-layout">
          ${detailImage}
          ${detailInfo}
        </div>
      </div>
    `;
  }

  renderGameBananaWipInfo(
    mod: GameBananaTopSubmission & { _aAdditionalInfo?: any },
  ) {
    if (String(mod._sModelName || '').toLowerCase() !== 'wip') return '';

    const additionalInfo = mod._aAdditionalInfo || {};
    const state =
      additionalInfo._sDevelopmentState || additionalInfo._akDevelopmentState;
    const completion = Number(additionalInfo._iCompletionPercentage);
    const hasCompletion = Number.isFinite(completion);
    const finishedWork = additionalInfo._aFinishedWork || {};
    const gameBananaWorks = Array.isArray(
      finishedWork._aFinishedWorksOnGameBanana,
    )
      ? finishedWork._aFinishedWorksOnGameBanana
      : [];
    const remoteWorks = Array.isArray(finishedWork._aRemoteFinishedWorkUrls)
      ? finishedWork._aRemoteFinishedWorkUrls
      : [];

    if (
      !state &&
      !hasCompletion &&
      !gameBananaWorks.length &&
      !remoteWorks.length
    ) {
      return '';
    }

    return `
      <div class="social-gamebanana-wip-info">
        <h4 class="social-gamebanana-wip-title">WiP Progress</h4>
        <div class="social-gamebanana-wip-grid">
          ${
            state
              ? `<div class="social-gamebanana-wip-item">
                  <span>Development state</span>
                  <strong>${this.escapeHtml(state)}</strong>
                </div>`
              : ''
          }
          ${
            hasCompletion
              ? `<div class="social-gamebanana-wip-item">
                  <span>Completion</span>
                  <strong>${Math.max(0, Math.min(100, completion))}%</strong>
                </div>`
              : ''
          }
        </div>
        ${
          hasCompletion
            ? `<div class="social-gamebanana-wip-progress" aria-label="Completion ${Math.max(0, Math.min(100, completion))}%">
                <span style="width: ${Math.max(0, Math.min(100, completion))}%"></span>
              </div>`
            : ''
        }
        ${this.renderGameBananaWipFinishedWork(gameBananaWorks, remoteWorks)}
      </div>
    `;
  }

  renderGameBananaWipFinishedWork(gameBananaWorks: any[], remoteWorks: any[]) {
    const links = [
      ...gameBananaWorks.map((work) => ({
        label:
          work?._sName || work?.name || work?._sProfileUrl || 'Finished work',
        url: work?._sProfileUrl || work?.url || '',
      })),
      ...remoteWorks.map((work) => ({
        label: work?.description || work?.title || work?.url || 'Remote work',
        url: work?.url || work?._sUrl || '',
      })),
    ].filter((work) => work.url);

    if (!links.length) return '';

    return `
      <div class="social-gamebanana-wip-finished">
        <span>Finished work</span>
        ${links
          .map((work) => {
            const gameBananaInfo = this.getGameBananaInfoFromProfileUrl(
              work.url,
            );
            return gameBananaInfo
              ? `<button class="social-gamebanana-finished-work-btn" data-url="${this.escapeHtml(work.url)}" data-gb-model="${this.escapeHtml(gameBananaInfo.modelName)}" data-gb-id="${this.escapeHtml(gameBananaInfo.submissionId)}">
                <i class="bi bi-arrow-right-circle"></i>
                <span>${this.escapeHtml(work.label)}</span>
              </button>`
              : `<button class="social-gamebanana-external-btn" data-url="${this.escapeHtml(work.url)}">
                <i class="bi bi-box-arrow-up-right"></i>
                <span>${this.escapeHtml(work.label)}</span>
              </button>`;
          })
          .join('')}
      </div>
    `;
  }

  updateGameBananaGallery(gallery: HTMLElement, nextIndex: number) {
    const thumbs = Array.from(
      gallery.querySelectorAll<HTMLButtonElement>(
        '.social-gamebanana-gallery-thumb',
      ),
    );
    if (!thumbs.length) return;

    const normalizedIndex = (nextIndex + thumbs.length) % thumbs.length;
    const currentIndex = Number(
      gallery.getAttribute('data-gallery-index') || 0,
    );
    if (
      normalizedIndex === currentIndex ||
      gallery.classList.contains('is-loading')
    ) {
      return;
    }

    const thumb = thumbs[normalizedIndex];
    const image = gallery.querySelector<HTMLImageElement>(
      '.social-gamebanana-detail-image',
    );
    const imageUrl = thumb.getAttribute('data-image-url');
    if (!image || !imageUrl) return;

    const width = Number(thumb.getAttribute('data-width'));
    const height = Number(thumb.getAttribute('data-height'));
    const nextCaption = thumb.getAttribute('data-caption') || '';
    const direction = normalizedIndex > currentIndex ? 'next' : 'prev';
    const preload = new Image();

    gallery.classList.add('is-loading');

    preload.onload = () => {
      gallery.classList.remove('is-loading');
      gallery.classList.remove('slide-next', 'slide-prev');

      if (width > 0 && height > 0) {
        image.style.aspectRatio = `${width} / ${height}`;
      } else {
        image.style.aspectRatio = '';
      }
      image.src = imageUrl;
      image.classList.remove('is-sliding');
      void image.offsetWidth;
      gallery.classList.add(direction === 'next' ? 'slide-next' : 'slide-prev');
      image.classList.add('is-sliding');

      this.updateGameBananaGalleryCaption(gallery, nextCaption);

      thumbs.forEach((item, index) => {
        item.classList.toggle('active', index === normalizedIndex);
      });
      gallery.setAttribute('data-gallery-index', String(normalizedIndex));

      window.setTimeout(() => {
        image.classList.remove('is-sliding');
        gallery.classList.remove('slide-next', 'slide-prev');
      }, 260);
    };

    preload.onerror = () => {
      gallery.classList.remove('is-loading');
    };

    preload.src = imageUrl;
  }

  updateGameBananaGalleryCaption(gallery: HTMLElement, nextCaption: string) {
    const caption = gallery.querySelector<HTMLElement>(
      '.social-gamebanana-gallery-caption',
    );

    if (caption) {
      caption.textContent = nextCaption;
      caption.style.display = nextCaption ? '' : 'none';
      return;
    }

    if (nextCaption) {
      const nextCaptionEl = document.createElement('p');
      nextCaptionEl.className = 'social-gamebanana-gallery-caption';
      nextCaptionEl.textContent = nextCaption;
      gallery
        .querySelector<HTMLElement>('.social-gamebanana-gallery-main')
        ?.after(nextCaptionEl);
    }
  }

  renderGameBananaDetailSkeletonInfo() {
    return `
      <div class="social-gamebanana-detail-info">
        <div class="social-gamebanana-detail-meta social-gamebanana-skeleton-row">
          <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-pill"></span>
          <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-pill social-gamebanana-skeleton-pill-wide"></span>
        </div>
        <div class="social-gamebanana-skeleton-block social-gamebanana-skeleton-title"></div>
        <div class="social-gamebanana-skeleton-block social-gamebanana-skeleton-author"></div>
        <div class="social-gamebanana-detail-stats social-gamebanana-skeleton-row">
          <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-stat"></span>
          <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-stat"></span>
          <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-stat"></span>
        </div>
        ${this.renderGameBananaDescriptionSkeleton()}
        ${this.renderGameBananaFileList([], true)}
      </div>
    `;
  }

  renderGameBananaDescriptionSkeleton() {
    return `
      <div class="social-gamebanana-detail-description social-gamebanana-description-skeleton">
        <span class="social-gamebanana-skeleton-block"></span>
        <span class="social-gamebanana-skeleton-block"></span>
        <span class="social-gamebanana-skeleton-block"></span>
        <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-line-short"></span>
      </div>
    `;
  }

  renderGameBananaFileList(files: GameBananaFileEntry[], loading = false) {
    if (loading) {
      return `
        <div class="social-gamebanana-files">
          <h4 class="social-gamebanana-files-title">Files</h4>
          <div class="social-gamebanana-files-list">
            ${Array.from({ length: 3 }, () => this.renderGameBananaFileSkeletonCard()).join('')}
          </div>
        </div>
      `;
    }

    if (!Array.isArray(files) || files.length === 0) {
      return `
        <div class="social-gamebanana-files">
          <h4 class="social-gamebanana-files-title">Files</h4>
          <p class="social-gamebanana-files-empty">No downloadable files found.</p>
        </div>
      `;
    }

    return `
      <div class="social-gamebanana-files">
        <h4 class="social-gamebanana-files-title">Files</h4>
        <div class="social-gamebanana-files-list">
          ${files.map((file) => this.renderGameBananaFileCard(file)).join('')}
        </div>
      </div>
    `;
  }

  renderGameBananaFileSkeletonCard() {
    return `
      <div class="social-gamebanana-file-card social-gamebanana-file-card-skeleton">
        <div class="social-gamebanana-file-info">
          <div class="social-gamebanana-skeleton-block social-gamebanana-skeleton-file-name"></div>
          <div class="social-gamebanana-skeleton-block social-gamebanana-skeleton-file-description"></div>
          <div class="social-gamebanana-file-meta social-gamebanana-skeleton-row">
            <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-file-meta"></span>
            <span class="social-gamebanana-skeleton-block social-gamebanana-skeleton-file-meta"></span>
          </div>
        </div>
        <div class="social-gamebanana-skeleton-block social-gamebanana-skeleton-download-btn"></div>
      </div>
    `;
  }

  renderGameBananaFileCard(file: GameBananaFileEntry) {
    const fileName = this.escapeHtml(file._sFile || 'Download');
    const description = this.escapeHtml(file._sDescription || '');
    const size = this.escapeHtml(
      this.formatGameBananaFileSize(file._nFilesize),
    );
    const downloads = Number(file._nDownloadCount || 0);
    const downloadUrl = this.escapeHtml(this.getGameBananaFileInstallUrl(file));
    const analysis = this.escapeHtml(file._sAnalysisResult || '');
    const av = this.escapeHtml(file._sAvResult || '');

    return `
      <div class="social-gamebanana-file-card">
        <div class="social-gamebanana-file-info">
          <h5 class="social-gamebanana-file-name">${fileName}</h5>
          ${description ? `<p class="social-gamebanana-file-description">${description}</p>` : ''}
          <div class="social-gamebanana-file-meta">
            ${size ? `<span>${size}</span>` : ''}
            <span><i class="bi bi-download"></i> ${downloads}</span>
            ${analysis ? `<span>${analysis}</span>` : ''}
            ${av ? `<span>${av}</span>` : ''}
          </div>
        </div>
        <button class="social-gamebanana-file-download-btn" data-download-url="${downloadUrl}" data-file-id="${this.escapeHtml(file._idRow || '')}" ${downloadUrl ? '' : 'disabled'}>
          <i class="bi bi-download"></i>
          <span>Download</span>
        </button>
      </div>
    `;
  }

  createSocialDocumentId() {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 10 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join('');
  }

  getCurrentSocialUsername() {
    const usernameEl = document.querySelector<HTMLElement>(
      '#social-profile-username',
    );
    return (
      usernameEl?.textContent?.trim() ||
      this.userData?.displayName ||
      this.userData?.email?.split('@')[0] ||
      'User'
    );
  }

  getDownloadIdFromGameBananaUrl(url: string) {
    return (
      url.match(/\/dl\/(\d+)/)?.[1] || url.match(/\/mmdl\/(\d+)/)?.[1] || ''
    );
  }

  getGameBananaFileExtension(fileName: string) {
    const extension = fileName.split('.').pop()?.trim();
    return extension || 'zip';
  }

  getGameBananaFileByDownloadId(downloadId: string) {
    const files = this.gameBananaCurrentDetail?.files || [];
    return files.find((file) => {
      const fileId = file._idRow ? String(file._idRow) : '';
      const urlId = file._sDownloadUrl
        ? this.getDownloadIdFromGameBananaUrl(file._sDownloadUrl)
        : '';
      const protocolId = file._sFightPlannerDownloadUrl
        ? this.getDownloadIdFromGameBananaUrl(file._sFightPlannerDownloadUrl)
        : '';
      return (
        fileId === downloadId ||
        urlId === downloadId ||
        protocolId === downloadId
      );
    });
  }

  getGameBananaFileInstallUrl(file: GameBananaFileEntry) {
    return file._sFightPlannerDownloadUrl || file._sDownloadUrl || '';
  }

  createGameBananaSocialPayload(downloadUrl: string) {
    if (!this.gameBananaCurrentDetail || !this.gameBananaLastDetailSource) {
      return null;
    }

    const downloadId = this.getDownloadIdFromGameBananaUrl(downloadUrl);
    if (!downloadId) return null;

    const { details, fallback, files } = this.gameBananaCurrentDetail;
    const merged = {
      ...fallback,
      ...details,
      _aSubmitter: details?._aSubmitter || fallback?._aSubmitter,
      _aPreviewMedia: details?._aPreviewMedia || fallback?._aPreviewMedia,
    } as GameBananaTopSubmission;
    const selectedFile = this.getGameBananaFileByDownloadId(downloadId);
    const fileName = selectedFile?._sFile || 'download.zip';
    const modId = String(
      merged._idRow || this.gameBananaLastDetailSource.submissionId,
    );
    const extension = this.getGameBananaFileExtension(fileName);
    const link =
      selectedFile?._sFightPlannerDownloadUrl ||
      `fightplanner:https://gamebanana.com/mmdl/${downloadId},${merged._sModelName || 'Mod'},${modId},${extension}`;
    const imageUrl = this.getGameBananaSubmissionImage(merged);
    const availableFiles = files.map((file) => ({
      id: file._idRow || '',
      name: file._sFile || 'Download',
      description: file._sDescription || '',
      size: Number(file._nFilesize || 0),
      downloads: Number(file._nDownloadCount || 0),
    }));

    return {
      link,
      downloadId,
      modId,
      modName: merged._sName || 'Unknown Mod',
      creator: merged._aSubmitter?._sName || 'Unknown',
      imageUrl,
      availableFiles,
    };
  }

  registerPendingGameBananaSocialDownload(downloadUrl: string) {
    const payload = this.createGameBananaSocialPayload(downloadUrl);
    if (!payload) return;

    this.pendingGameBananaSocialDownloads.set(payload.downloadId, payload);
  }

  async fetchSocialLinksWithRefresh() {
    if (!this.authToken) return [];

    const response = await this.fetchWithAuth(
      `${this.API_URL}/list/links?idToken=${this.authToken}`,
    );

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data) ? data : data.documents || [];
  }

  async writeSocialLinkDocument(docId: string, body: Record<string, any>) {
    if (!this.authToken) return false;

    const response = await this.fetchWithAuth(
      `${this.API_URL}/write/links/${docId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...body,
          _idToken: this.authToken,
        }),
      },
    );

    return response.ok;
  }

  async saveInstalledGameBananaDownloadToSocial(downloadUrl: string) {
    if (!this.authToken || !this.userData) return;

    const downloadId = this.getDownloadIdFromGameBananaUrl(downloadUrl);
    if (!downloadId) return;

    const pending = this.pendingGameBananaSocialDownloads.get(downloadId);
    if (!pending) return;

    try {
      const links = await this.fetchSocialLinksWithRefresh();
      const username = this.getCurrentSocialUsername();
      const existing = links.find((mod) => {
        const link = String(mod.link || '');
        const sameLink = link === pending.link;
        const sameDownload =
          this.getDownloadIdFromGameBananaUrl(link) === downloadId;
        const isOwner =
          mod.userId === this.userData?.localId ||
          (username && mod.pseudo === username);
        return isOwner && (sameLink || sameDownload);
      });
      const docId = existing?.id || this.createSocialDocumentId();
      const payload = {
        id: docId,
        availableFiles: JSON.stringify(pending.availableFiles),
        createdAt: existing?.createdAt || new Date().toISOString(),
        creator: pending.creator,
        image_url: pending.imageUrl,
        isHidden: false,
        link: pending.link,
        modId: pending.modId,
        modInstalled: true,
        mod_name: pending.modName,
        needsFileSelection:
          pending.availableFiles.length > 1 ? 'true' : 'false',
        pseudo: username,
        userId: this.userData.localId,
      };

      const written = await this.writeSocialLinkDocument(docId, payload);
      if (written) {
        this.invalidateCache('links');
        this.pendingGameBananaSocialDownloads.delete(downloadId);
      }
    } catch (error) {
      console.error('[Social] Failed to save GameBanana download:', error);
    }
  }

  formatGameBananaFileSize(bytes?: number) {
    const value = Number(bytes || 0);
    if (!value) return '';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  formatGameBananaPeriod(period?: string) {
    const labels = {
      today: 'Today',
      week: 'This week',
      month: 'This month',
      '3month': '3 months',
      '6month': '6 months',
      year: 'This year',
      alltime: 'All time',
    };

    return period && labels[period] ? labels[period] : 'Featured';
  }

  updateGameBananaFeaturedStack(index: number, direction = 0) {
    if (this.gameBananaFeaturedMods.length === 0) return;

    const total = this.gameBananaFeaturedMods.length;
    const previousIndex = this.gameBananaFeaturedIndex;
    this.gameBananaFeaturedIndex = (index + total) % total;

    const carousel = document.querySelector<HTMLElement>(
      '#social-gamebanana-carousel',
    );
    if (!carousel) return;

    const cards = carousel.querySelectorAll<HTMLElement>(
      '.social-gamebanana-card-featured',
    );

    if (cards.length === 0) {
      carousel.innerHTML = this.renderGameBananaFeaturedStack();
      return;
    }

    cards.forEach((card) => {
      const cardIndex = Number(card.getAttribute('data-featured-index'));
      const position = this.getGameBananaFeaturedPosition(cardIndex);

      card.classList.remove(
        'is-active',
        'is-previous',
        'is-next',
        'is-hidden',
        'was-active',
      );
      card.classList.add(`is-${position}`);
      if (
        cardIndex === previousIndex &&
        previousIndex !== this.gameBananaFeaturedIndex
      ) {
        card.classList.add('was-active');
      }
      card.setAttribute('data-featured-position', position);
    });

    this.animateGameBananaFeaturedCards(direction);
  }

  scrollGameBananaCarousel(direction: number) {
    this.updateGameBananaFeaturedStack(
      this.gameBananaFeaturedIndex + direction,
      direction,
    );
  }

  getGameBananaFeaturedOffset() {
    const carousel = document.querySelector<HTMLElement>(
      '#social-gamebanana-carousel',
    );
    const activeCard = carousel?.querySelector<HTMLElement>(
      '.social-gamebanana-card-featured.is-active',
    );
    const width = carousel?.clientWidth || 900;
    const cardWidth = activeCard?.offsetWidth || Math.min(560, width * 0.68);
    const containedOffset = Math.max(0, (width - cardWidth * 0.88) / 2 - 12);
    const preferredOffset = Math.max(120, Math.min(300, width * 0.24));

    return Math.min(preferredOffset, containedOffset);
  }

  getGameBananaFeaturedCardState(position: string) {
    const offset = this.getGameBananaFeaturedOffset();
    const isSmall = window.innerWidth <= 720;
    const sideY = isSmall ? 16 : 18;
    const sideRotation = isSmall ? 6 : 8;

    switch (position) {
      case 'active':
        return {
          xPercent: -50,
          x: 0,
          y: 0,
          scale: 1,
          rotationY: 0,
          autoAlpha: 1,
          zIndex: 4,
          filter: 'brightness(1)',
        };
      case 'previous':
        return {
          xPercent: -50,
          x: -offset,
          y: sideY,
          scale: 0.88,
          rotationY: sideRotation,
          autoAlpha: 0.72,
          zIndex: 2,
          filter: 'brightness(0.78)',
        };
      case 'next':
        return {
          xPercent: -50,
          x: offset,
          y: sideY,
          scale: 0.88,
          rotationY: -sideRotation,
          autoAlpha: 0.72,
          zIndex: 2,
          filter: 'brightness(0.78)',
        };
      default:
        return {
          xPercent: -50,
          x: 0,
          y: 42,
          scale: 0.78,
          rotationY: 0,
          autoAlpha: 0,
          zIndex: 1,
          filter: 'brightness(0.65)',
        };
    }
  }

  setGameBananaFeaturedCardPositions() {
    const gsapRef = window.gsap as any;
    const cards = document.querySelectorAll<HTMLElement>(
      '#social-gamebanana-carousel .social-gamebanana-card-featured',
    );

    cards.forEach((card) => {
      const position = card.getAttribute('data-featured-position') || 'hidden';
      const state = this.getGameBananaFeaturedCardState(position);

      if (gsapRef) {
        gsapRef.set(card, state);
      } else {
        card.style.zIndex = `${state.zIndex}`;
      }
    });
  }

  animateGameBananaFeaturedCards(direction: number) {
    const gsapRef = window.gsap as any;
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#social-gamebanana-carousel .social-gamebanana-card-featured',
      ),
    );

    if (!gsapRef || cards.length === 0) {
      this.setGameBananaFeaturedCardPositions();
      return;
    }

    if (this.gameBananaFeaturedTimeline) {
      this.gameBananaFeaturedTimeline.kill();
    }

    this.gameBananaFeaturedTimeline = gsapRef.timeline({
      defaults: {
        duration: 0.48,
        ease: 'power3.out',
        overwrite: 'auto',
      },
      onComplete: () => {
        cards.forEach((card) => card.classList.remove('was-active'));
        this.gameBananaFeaturedTimeline = null;
      },
    });

    cards.forEach((card) => {
      const position = card.getAttribute('data-featured-position') || 'hidden';
      const state = this.getGameBananaFeaturedCardState(position);

      gsapRef.set(card, { zIndex: state.zIndex });

      this.gameBananaFeaturedTimeline.to(
        card,
        {
          xPercent: state.xPercent,
          x: state.x,
          y: state.y,
          scale: state.scale,
          rotationY: state.rotationY,
          autoAlpha: state.autoAlpha,
          filter: state.filter,
          duration: position === 'hidden' ? 0.34 : 0.5,
          ease: 'power3.out',
        },
        0,
      );
    });

    void direction;
  }
}
