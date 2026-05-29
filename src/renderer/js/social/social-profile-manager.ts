class SocialProfileManager extends SocialFeedManager {
  [key: string]: any;
  parseFirestoreFieldValue(value: any): any {
    if (!value || typeof value !== 'object') return value;
    if ('stringValue' in value) return value.stringValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('arrayValue' in value) {
      const values = value.arrayValue?.values;
      return Array.isArray(values)
        ? values.map((entry) => this.parseFirestoreFieldValue(entry))
        : [];
    }
    if ('mapValue' in value) {
      const fields = value.mapValue?.fields || {};
      return Object.fromEntries(
        Object.entries(fields).map(([key, entry]) => [
          key,
          this.parseFirestoreFieldValue(entry),
        ]),
      );
    }

    return Object.values(value)[0];
  }

  parseFirestoreFields<T extends Record<string, any>>(fields: any): T {
    return Object.fromEntries(
      Object.entries(fields || {}).map(([key, value]) => [
        key,
        this.parseFirestoreFieldValue(value),
      ]),
    ) as T;
  }

  getProfileBadgeMeta(badge: string) {
    const normalized = String(badge || '')
      .trim()
      .toLowerCase();
    const badgeMap: Record<
      string,
      { label: string; icon: string; className: string }
    > = {
      owner: {
        label: 'Owner',
        icon: 'bi-shield-fill-check',
        className: 'badge-owner',
      },
      fightplanner_creator: {
        label: 'FightPlanner Creator',
        icon: 'bi-stars',
        className: 'badge-fightplanner-creator',
      },
      tester: {
        label: 'Tester',
        icon: 'bi-bug-fill',
        className: 'badge-tester',
      },
    };

    return (
      badgeMap[normalized] || {
        label:
          normalized
            .split('_')
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ') || 'Badge',
        icon: 'bi-patch-check-fill',
        className: `badge-${normalized.replace(/[^a-z0-9-]/g, '-')}`,
      }
    );
  }

  renderProfileBadges(badges: string[] = []) {
    const uniqueBadges = Array.from(
      new Set(
        badges.map((badge) => String(badge || '').trim()).filter(Boolean),
      ),
    );

    return uniqueBadges
      .map((badge) => {
        const meta = this.getProfileBadgeMeta(badge);
        return `<span class="social-profile-badge ${this.escapeHtml(meta.className)}" title="${this.escapeHtml(meta.label)}">
<i class="bi ${this.escapeHtml(meta.icon)}"></i>
<span>${this.escapeHtml(meta.label)}</span>
</span>`;
      })
      .join('');
  }

  applyProfileBadges(selector: string, badges?: string[]) {
    const badgesEl = document.querySelector<HTMLElement>(selector);
    if (!badgesEl) return;
    badgesEl.innerHTML = Array.isArray(badges)
      ? this.renderProfileBadges(badges)
      : '';
  }

  setupProfileMediaButtons() {
    if (this.profileMediaListenersBound) return;

    const avatarButton = document.querySelector<HTMLElement>(
      '#social-profile-edit-avatar',
    );
    const bannerButton = document.querySelector<HTMLElement>(
      '#social-profile-edit-banner',
    );
    const avatarInput = document.querySelector<HTMLInputElement>(
      '#social-profile-avatar-input',
    );
    const bannerInput = document.querySelector<HTMLInputElement>(
      '#social-profile-banner-input',
    );

    if (!avatarButton || !bannerButton || !avatarInput || !bannerInput) return;
    this.profileMediaListenersBound = true;

    avatarButton.addEventListener('click', () => avatarInput.click());
    bannerButton.addEventListener('click', () => bannerInput.click());

    avatarInput.addEventListener('change', () => {
      const file = avatarInput.files?.[0];
      avatarInput.value = '';
      if (file) this.openProfileMediaCropper(file, 'avatar');
    });

    bannerInput.addEventListener('change', () => {
      const file = bannerInput.files?.[0];
      bannerInput.value = '';
      if (file) this.openProfileMediaCropper(file, 'banner');
    });

    document
      .querySelector<HTMLElement>('#social-crop-close')
      ?.addEventListener('click', () => this.closeProfileMediaCropper());
    document
      .querySelector<HTMLElement>('#social-crop-cancel')
      ?.addEventListener('click', () => this.closeProfileMediaCropper());
    document
      .querySelector<HTMLElement>('#social-crop-confirm')
      ?.addEventListener('click', () => this.confirmProfileMediaCrop());

    const zoomInput =
      document.querySelector<HTMLInputElement>('#social-crop-zoom');
    zoomInput?.addEventListener('input', () => {
      if (!this.profileMediaCropState) return;
      this.profileMediaCropState.zoom = Number(zoomInput.value) || 1;
      this.drawProfileMediaCrop();
    });

    const canvas = document.querySelector<HTMLCanvasElement>(
      '#social-crop-canvas',
    );
    canvas?.addEventListener('pointerdown', (event) => {
      if (!this.profileMediaCropState) return;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
      this.profileMediaCropState.dragging = true;
      this.profileMediaCropState.lastX = event.clientX;
      this.profileMediaCropState.lastY = event.clientY;
    });
    canvas?.addEventListener('pointermove', (event) => {
      const state = this.profileMediaCropState;
      if (!state?.dragging) return;
      state.offsetX += event.clientX - state.lastX;
      state.offsetY += event.clientY - state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      this.drawProfileMediaCrop();
    });
    canvas?.addEventListener('pointerup', (event) => {
      if (!this.profileMediaCropState) return;
      canvas.releasePointerCapture(event.pointerId);
      canvas.classList.remove('is-dragging');
      this.profileMediaCropState.dragging = false;
    });
  }

  openProfileMediaCropper(file: File, type: ProfileMediaType) {
    if (!file.type.startsWith('image/')) {
      if (window.toastManager) window.toastManager.error('Image only');
      return;
    }

    this.closeProfileMediaCropper();

    const modal = document.querySelector<HTMLElement>(
      '#social-profile-media-crop-modal',
    );
    const title = document.querySelector<HTMLElement>('#social-crop-title');
    const frame = document.querySelector<HTMLElement>('#social-crop-frame');
    const zoomInput =
      document.querySelector<HTMLInputElement>('#social-crop-zoom');
    if (!modal || !frame || !zoomInput) return;

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      this.profileMediaCropState = {
        type,
        file,
        objectUrl,
        image,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        dragging: false,
        lastX: 0,
        lastY: 0,
      };
      frame.classList.toggle('is-avatar', type === 'avatar');
      frame.classList.toggle('is-banner', type === 'banner');
      if (title) {
        title.textContent =
          type === 'avatar' ? 'Crop profile photo' : 'Crop banner';
      }
      zoomInput.value = '1';
      modal.style.display = 'flex';
      this.drawProfileMediaCrop();
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (window.toastManager)
        window.toastManager.error('Failed to load image');
    };
    image.src = objectUrl;
  }

  closeProfileMediaCropper(clearState = true) {
    this.setProfileMediaUploadLoading(false);
    const modal = document.querySelector<HTMLElement>(
      '#social-profile-media-crop-modal',
    );
    if (modal) modal.style.display = 'none';
    if (clearState && this.profileMediaCropState) {
      URL.revokeObjectURL(this.profileMediaCropState.objectUrl);
      this.profileMediaCropState = null;
    }
  }

  setProfileMediaUploadLoading(isLoading: boolean) {
    const overlay = document.querySelector<HTMLElement>(
      '#social-crop-upload-loading',
    );
    const lottieContainer = document.querySelector<HTMLElement>(
      '#social-crop-upload-lottie',
    );
    const closeButton =
      document.querySelector<HTMLButtonElement>('#social-crop-close');
    const cancelButton = document.querySelector<HTMLButtonElement>(
      '#social-crop-cancel',
    );
    const zoomInput =
      document.querySelector<HTMLInputElement>('#social-crop-zoom');

    overlay?.classList.toggle('is-active', isLoading);
    if (overlay) overlay.style.display = isLoading ? 'flex' : 'none';
    if (closeButton) closeButton.disabled = isLoading;
    if (cancelButton) cancelButton.disabled = isLoading;
    if (zoomInput) zoomInput.disabled = isLoading;

    if (isLoading && lottieContainer && window.lottie) {
      if (this.profileMediaUploadAnim) return;
      lottieContainer.innerHTML = '';
      this.profileMediaUploadAnim = window.lottie.loadAnimation({
        container: lottieContainer,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '../images/loading.json',
      });
      return;
    }

    if (!isLoading && this.profileMediaUploadAnim) {
      try {
        this.profileMediaUploadAnim.destroy();
      } catch (error) {
        console.warn('Error destroying upload animation:', error);
      }
      this.profileMediaUploadAnim = null;
      if (lottieContainer) lottieContainer.innerHTML = '';
    }
  }

  getProfileMediaOutputSize(type: ProfileMediaType) {
    return type === 'avatar'
      ? { width: 512, height: 512 }
      : { width: 1500, height: 500 };
  }

  drawProfileMediaCrop() {
    const state = this.profileMediaCropState;
    const canvas = document.querySelector<HTMLCanvasElement>(
      '#social-crop-canvas',
    );
    if (!state || !canvas) return;

    const { width, height } = this.getProfileMediaOutputSize(state.type);
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coverScale = Math.max(
      width / state.image.naturalWidth,
      height / state.image.naturalHeight,
    );
    const scale = coverScale * state.zoom;
    const drawWidth = state.image.naturalWidth * scale;
    const drawHeight = state.image.naturalHeight * scale;
    const maxOffsetX = Math.max(0, (drawWidth - width) / 2);
    const maxOffsetY = Math.max(0, (drawHeight - height) / 2);
    state.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, state.offsetX));
    state.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, state.offsetY));
    const x = (width - drawWidth) / 2 + state.offsetX;
    const y = (height - drawHeight) / 2 + state.offsetY;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(state.image, x, y, drawWidth, drawHeight);
  }

  async confirmProfileMediaCrop() {
    const state = this.profileMediaCropState;
    const canvas = document.querySelector<HTMLCanvasElement>(
      '#social-crop-canvas',
    );
    const confirmButton = document.querySelector<HTMLButtonElement>(
      '#social-crop-confirm',
    );
    if (!state || !canvas || !this.authToken || !this.userData) return;
    if (confirmButton?.disabled) return;

    if (confirmButton) confirmButton.disabled = true;
    this.setProfileMediaUploadLoading(true);

    try {
      this.drawProfileMediaCrop();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9),
      );
      if (!blob) throw new Error('Crop export failed');

      const previousPublicId = await this.getCurrentProfileMediaPublicId(
        state.type,
      );
      const fileName =
        state.type === 'avatar' ? 'profile-photo.jpg' : 'profile-banner.jpg';
      const formData = new FormData();
      formData.append('idToken', this.authToken);
      formData.append(
        'file',
        new File([blob], fileName, { type: 'image/jpeg' }),
      );
      if (previousPublicId) {
        formData.append('previousPublicId', previousPublicId);
      }

      const uploadResponse = await this.fetchWithAuth(
        `${this.API_URL}/upload-profile-photo`,
        {
          method: 'POST',
          body: formData,
        },
      );
      const uploadResponseText = await uploadResponse.text();
      let uploadData: any = {};
      try {
        uploadData = uploadResponseText ? JSON.parse(uploadResponseText) : {};
      } catch (parseError) {
        uploadData = { message: uploadResponseText };
      }
      const uploadedUrl =
        uploadData.secureUrl || uploadData.secure_url || uploadData.url || '';
      const uploadedPublicId =
        uploadData.publicId || uploadData.public_id || '';

      if (!uploadResponse.ok || !uploadedUrl) {
        const uploadError =
          uploadData.message ||
          uploadData.error?.message ||
          uploadData.error ||
          uploadResponseText ||
          `Upload failed (${uploadResponse.status})`;
        console.error('[Social] Profile media upload failed:', {
          status: uploadResponse.status,
          response: uploadData,
        });
        throw new Error(uploadError);
      }

      const fieldUrl = state.type === 'avatar' ? 'photoURL' : 'bannerURL';
      const fieldPublicId =
        state.type === 'avatar' ? 'photoPublicId' : 'bannerPublicId';

      const writeResponse = await this.fetchWithAuth(
        `${this.API_URL}/write/users/${this.userData.localId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            [fieldUrl]: uploadedUrl,
            [fieldPublicId]: uploadedPublicId,
            _idToken: this.authToken,
          }),
        },
      );
      if (!writeResponse.ok) {
        const writeErrorText = await writeResponse.text();
        throw new Error(writeErrorText || 'Profile update failed');
      }

      this.applyProfileMedia(state.type, uploadedUrl);
      this.closeProfileMediaCropper();
      if (window.toastManager) window.toastManager.success('Profile updated');
    } catch (error) {
      console.error('Error uploading profile media:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to upload image';
      if (window.toastManager) window.toastManager.error(message);
    } finally {
      if (confirmButton) confirmButton.disabled = false;
      this.setProfileMediaUploadLoading(false);
    }
  }

  async getCurrentProfileMediaPublicId(type: ProfileMediaType) {
    if (!this.userData) return '';
    try {
      const response = await fetch(
        `${this.API_URL}/read/users/${this.userData.localId}`,
      );
      const data = await response.json();
      const fields = data.fields || {};
      const key = type === 'avatar' ? 'photoPublicId' : 'bannerPublicId';
      return fields[key]?.stringValue || '';
    } catch (error) {
      console.warn('Failed to read previous media public id:', error);
      return '';
    }
  }

  applyProfileMedia(type: ProfileMediaType, url?: string) {
    if (type === 'avatar') {
      const avatar = document.querySelector<HTMLImageElement>(
        '#social-profile-avatar',
      );
      if (avatar && url) avatar.src = url;
      return;
    }

    const banner = document.querySelector<HTMLImageElement>(
      '#social-profile-banner',
    );
    const bannerContainer = banner?.closest<HTMLElement>(
      '.social-profile-banner',
    );
    if (!banner || !bannerContainer) return;

    if (url) {
      banner.src = url;
      bannerContainer.classList.add('has-image');
    } else {
      banner.removeAttribute('src');
      bannerContainer.classList.remove('has-image');
    }
  }

  async loadUserProfile() {
    if (!this.authToken || !this.userData) {
      console.error('No auth token or user data available');
      return;
    }

    try {
      const userId = this.userData.localId;

      const response = await fetch(`${this.API_URL}/read/users/${userId}`);
      const data: {
        fields: { [key: string]: string[] };
      } = await response.json();

      if (response.ok && data.fields) {
        const userFields = this.parseFirestoreFields<UserFields>(data.fields);

        const usernameEl = document.querySelector<HTMLElement>(
          '#social-profile-username',
        );
        const emailEl = document.querySelector<HTMLElement>(
          '#social-profile-email',
        );
        const avatarEl = document.querySelector<HTMLImageElement>(
          '#social-profile-avatar',
        );
        const bannerEl = document.querySelector<HTMLImageElement>(
          '#social-profile-banner',
        );
        const usernameInput = document.querySelector<HTMLInputElement>(
          '#social-edit-username',
        );
        const privacyVisibility = document.querySelector<HTMLSelectElement>(
          '#social-privacy-visibility',
        );
        const privacySync = document.querySelector<HTMLInputElement>(
          '#social-privacy-sync',
        );

        if (usernameEl) usernameEl.textContent = userFields.username || 'User';
        this.applyProfileBadges('#social-profile-badges', userFields.badges);
        if (emailEl) emailEl.textContent = this.userData.email || '';
        if (avatarEl)
          avatarEl.src =
            userFields.photoURL || 'https://files.catbox.moe/xry0hs.png';
        if (bannerEl) this.applyProfileMedia('banner', userFields.bannerURL);
        if (usernameInput) usernameInput.value = userFields.username || '';

        if (
          userFields.privacySettings &&
          typeof userFields.privacySettings === 'object'
        ) {
          const privacy = userFields.privacySettings;
          if (privacyVisibility) {
            privacyVisibility.value = privacy.modsVisibility || 'global';
          }
          if (privacySync) {
            privacySync.checked = privacy.allowSync !== false;
          }
        } else {
          if (privacyVisibility) privacyVisibility.value = 'global';
          if (privacySync) privacySync.checked = true;
        }

        await this.loadAutoDownloadSettingsToUI();

        await this.loadUserStats();

        setTimeout(() => {
          if (
            document
              .querySelector<HTMLElement>(
                '.social-nav-item[data-section="discover"]',
              )
              ?.classList.contains('active')
          ) {
            this.loadDiscover();
          } else if (
            document
              .querySelector<HTMLElement>(
                '.social-nav-item[data-section="people-downloads"]',
              )
              ?.classList.contains('active')
          ) {
            this.loadFeed();
          }
        }, 100);
      } else {
        console.error('Failed to load user profile:', data);
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToLoadProfileData');
        }
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToLoadProfile');
      }
    }
  }

  async loadUserStats() {
    if (!this.authToken || !this.userData) return;

    try {
      const userId = this.userData.localId;

      const usernameEl = document.querySelector<HTMLElement>(
        '#social-profile-username',
      );
      const username = usernameEl ? usernameEl.textContent : null;

      const modsData = await this.fetchWithCache(
        `${this.API_URL}/list/links?idToken=${this.authToken}`,
        {},
        'links',
      );

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      let modsCount = 0;
      if (Array.isArray(mods)) {
        modsCount = mods.filter((mod) => {
          const modUserId = mod.userId;
          const modPseudo = mod.pseudo;
          return modUserId === userId || (username && modPseudo === username);
        }).length;
      }

      const friendsData = await this.fetchWithCache(
        `${this.API_URL}/links-friends`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: this.authToken }),
        },
        'friends',
      );

      let friendsCount = 0;
      if (friendsData.friends && Array.isArray(friendsData.friends)) {
        friendsCount = friendsData.friends.filter(
          (f) => f.status === 'accepted',
        ).length;
      }

      const modsStatEl =
        document.querySelector<HTMLElement>('#social-stat-mods');
      const friendsStatEl = document.querySelector<HTMLElement>(
        '#social-stat-friends',
      );

      if (modsStatEl) modsStatEl.textContent = `${modsCount}`;
      if (friendsStatEl) friendsStatEl.textContent = `${friendsCount}`;
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  }

  setupProfileButtons() {
    if (this.socialProfileButtonsBound) return;
    this.socialProfileButtonsBound = true;

    const saveUsernameBtn = document.querySelector<HTMLElement>(
      '#social-save-username',
    );
    if (saveUsernameBtn) {
      saveUsernameBtn.addEventListener('click', async () => {
        await this.updateUsername();
      });
    }

    const savePrivacyBtn = document.querySelector<HTMLElement>(
      '#social-save-privacy',
    );
    if (savePrivacyBtn) {
      savePrivacyBtn.addEventListener('click', async () => {
        await this.updatePrivacySettings();
      });
    }

    const saveAutoDownloadBtn = document.querySelector<HTMLElement>(
      '#social-save-auto-download',
    );
    if (saveAutoDownloadBtn) {
      saveAutoDownloadBtn.addEventListener('click', async () => {
        await this.updateAutoDownloadSettings();
      });
    }

    const logoutBtn = document.querySelector<HTMLElement>('#social-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await this.logout();
      });
    }

    this.setupProfileMediaButtons();

    // Go to Settings button
    const goToSettingsBtn = document.querySelector<HTMLElement>(
      '#social-go-to-settings-btn',
    );
    if (goToSettingsBtn) {
      goToSettingsBtn.addEventListener('click', () => {
        // Switch to Settings tab
        const settingsTab = document.querySelector<HTMLElement>(
          '[data-tab="settings"]',
        );
        if (settingsTab) {
          settingsTab.click();
          // After a small delay, switch to the Social settings sub-tab
          setTimeout(() => {
            const socialSettingsBtn = document.querySelector<HTMLElement>(
              '[data-settings-tab="social"]',
            );
            if (socialSettingsBtn) {
              socialSettingsBtn.click();
            }
          }, 100);
        }
      });
    }

    if (this.socialDocumentClickListenerBound) return;
    this.socialDocumentClickListenerBound = true;

    document.addEventListener('click', async (e) => {
      const clickedElement = e.target as HTMLElement;
      const removeBtn = clickedElement.closest('.social-remove-friend-btn');

      if (
        removeBtn ||
        clickedElement.classList.contains('social-remove-friend-btn') ||
        (clickedElement.tagName === 'I' &&
          clickedElement.closest('.social-remove-friend-btn'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (!this.authToken) {
          console.error('[Social] Cannot remove friend: user not logged in');
          return false;
        }

        this.hideRegisterModal();
        this.hideForgotPasswordModal();

        const btn =
          clickedElement.closest('.social-remove-friend-btn') || clickedElement;
        const relationId = btn.getAttribute('data-relation-id');
        const friendId = btn.getAttribute('data-friend-id');

        console.log('[Social] Remove friend button clicked:', {
          relationId,
          friendId,
          clickedElement: clickedElement.tagName,
          button: btn,
        });

        if (relationId) {
          this.removeFriend(relationId, friendId);
        } else {
          console.error(
            '[Social] No relationId found on remove friend button. Button:',
            btn,
          );
        }
        return false;
      }

      if (this.authToken && this.userData) {
        if (
          clickedElement.closest('#social-remove-friend-modal') ||
          clickedElement.closest('#social-register-modal') ||
          clickedElement.closest('#social-forgot-modal')
        ) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }

      if (clickedElement.closest('.social-mod-download-btn')) {
        e.preventDefault();
        e.stopPropagation();
        const btn = clickedElement.closest('.social-mod-download-btn');
        const link = btn!.getAttribute('data-link');
        if (
          link &&
          link.startsWith('fightplanner:') &&
          window.electronAPI &&
          window.electronAPI.openFightPlannerLink
        ) {
          window.electronAPI.openFightPlannerLink(link);
        }
        return false;
      }

      const carouselButton = clickedElement.closest<HTMLElement>(
        '.social-gamebanana-carousel-btn',
      );
      if (carouselButton) {
        e.preventDefault();
        e.stopPropagation();
        const direction =
          carouselButton.getAttribute('data-direction') === 'next' ? 1 : -1;
        this.scrollGameBananaCarousel(direction);
        return false;
      }

      const featuredCard = clickedElement.closest<HTMLElement>(
        '.social-gamebanana-card-featured',
      );
      if (featuredCard) {
        const featuredPosition = featuredCard.getAttribute(
          'data-featured-position',
        );
        const featuredIndex = Number(
          featuredCard.getAttribute('data-featured-index'),
        );

        if (featuredPosition !== 'active' && Number.isFinite(featuredIndex)) {
          e.preventDefault();
          e.stopPropagation();
          const total = this.gameBananaFeaturedMods.length;
          const nextIndex = (this.gameBananaFeaturedIndex + 1) % total;
          const direction = featuredIndex === nextIndex ? 1 : -1;
          this.updateGameBananaFeaturedStack(featuredIndex, direction);
          return false;
        }
      }

      const pageButton = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-page-btn',
      );
      if (pageButton) {
        e.preventDefault();
        e.stopPropagation();
        if (pageButton.disabled) return false;

        const action = pageButton.getAttribute('data-page-action');
        const nextPage =
          action === 'next'
            ? this.gameBananaModsPage + 1
            : this.gameBananaModsPage - 1;
        await this.loadGameBananaModsPage(nextPage);
        return false;
      }

      if (clickedElement.closest('.social-gamebanana-detail-back')) {
        e.preventDefault();
        e.stopPropagation();
        await this.returnFromGameBananaDetail();
        return false;
      }

      const requirementInstallBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-requirement-install',
      );
      if (requirementInstallBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (requirementInstallBtn.disabled) return false;

        const pluginName =
          requirementInstallBtn.getAttribute('data-plugin-name');
        const repo = requirementInstallBtn.getAttribute('data-plugin-repo');
        if (pluginName && repo) {
          requirementInstallBtn.disabled = true;
          await this.installGameBananaRequirement(pluginName, repo);
          await window.pluginManager?.refreshPlugins?.();
          requirementInstallBtn.disabled = false;
          if (this.gameBananaCurrentDetail) {
            this.renderGameBananaDetailPage(
              this.gameBananaCurrentDetail.details,
              this.gameBananaCurrentDetail.fallback,
              false,
              this.gameBananaCurrentDetail.files,
            );
          }
        }
        return false;
      }

      const requirementLinkBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-requirement-link',
      );
      if (requirementLinkBtn) {
        e.preventDefault();
        e.stopPropagation();

        const url = requirementLinkBtn.getAttribute('data-url');
        if (url && window.electronAPI?.openUrl) {
          await window.electronAPI.openUrl(url);
        }
        return false;
      }

      const requirementSearchBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-requirement-search',
      );
      if (requirementSearchBtn) {
        e.preventDefault();
        e.stopPropagation();

        const query = requirementSearchBtn.getAttribute('data-query') || '';
        const provider =
          requirementSearchBtn.getAttribute('data-provider') || 'google';
        const url = this.getGameBananaRequirementSearchUrl(query, provider);
        if (window.electronAPI?.openUrl) {
          await window.electronAPI.openUrl(url);
        }
        return false;
      }

      const galleryThumb = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-gallery-thumb',
      );
      if (galleryThumb) {
        e.preventDefault();
        e.stopPropagation();
        const gallery = galleryThumb.closest<HTMLElement>(
          '.social-gamebanana-gallery',
        );
        const index = Number(galleryThumb.getAttribute('data-gallery-index'));
        if (gallery && Number.isFinite(index)) {
          this.updateGameBananaGallery(gallery, index);
        }
        return false;
      }

      const galleryNav = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-gallery-nav',
      );
      if (galleryNav) {
        e.preventDefault();
        e.stopPropagation();
        const gallery = galleryNav.closest<HTMLElement>(
          '.social-gamebanana-gallery',
        );
        const currentIndex = Number(
          gallery?.getAttribute('data-gallery-index') || 0,
        );
        const direction = Number(
          galleryNav.getAttribute('data-gallery-direction') || 0,
        );
        if (gallery && Number.isFinite(currentIndex)) {
          this.updateGameBananaGallery(gallery, currentIndex + direction);
        }
        return false;
      }

      const finishedWorkBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-finished-work-btn',
      );
      if (finishedWorkBtn) {
        e.preventDefault();
        e.stopPropagation();

        const modelName = finishedWorkBtn.getAttribute('data-gb-model');
        const submissionId = finishedWorkBtn.getAttribute('data-gb-id');
        if (modelName && submissionId) {
          this.gameBananaLastDetailSource = {
            modelName,
            submissionId,
            sourceKind: 'grid',
            page: this.gameBananaModsPage,
            scrollTop: this.getSocialMainScrollTop(),
          };
          await this.showGameBananaSubmissionDetails(modelName, submissionId);
        }
        return false;
      }

      const externalGameBananaBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-external-btn',
      );
      if (externalGameBananaBtn) {
        e.preventDefault();
        e.stopPropagation();

        const url = externalGameBananaBtn.getAttribute('data-url');
        if (url && window.electronAPI?.openUrl) {
          await window.electronAPI.openUrl(url);
        }
        return false;
      }

      const fileDownloadBtn = clickedElement.closest<HTMLButtonElement>(
        '.social-gamebanana-file-download-btn',
      );
      if (fileDownloadBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (fileDownloadBtn.disabled) return false;

        const downloadUrl = fileDownloadBtn.getAttribute('data-download-url');
        if (downloadUrl && window.electronAPI?.openFightPlannerLink) {
          const originalContent = fileDownloadBtn.innerHTML;
          fileDownloadBtn.disabled = true;

          try {
            const shouldCheckDependencies =
              await this.shouldCheckGameBananaDependenciesOnDownload();
            fileDownloadBtn.innerHTML = shouldCheckDependencies
              ? '<i class="bi bi-hourglass-split"></i><span>Checking</span>'
              : '<i class="bi bi-download"></i><span>Downloading</span>';

            const shouldContinue =
              await this.confirmMissingGameBananaRequirements(downloadUrl);
            if (!shouldContinue) return false;

            this.registerPendingGameBananaSocialDownload(downloadUrl);
            const protocolUrl = downloadUrl.startsWith('fightplanner:')
              ? downloadUrl
              : `fightplanner:${downloadUrl}`;
            await window.electronAPI.openFightPlannerLink(protocolUrl);
          } finally {
            fileDownloadBtn.disabled = false;
            fileDownloadBtn.innerHTML = originalContent;
          }
        }
        return false;
      }

      const gameBananaCard = clickedElement.closest<HTMLElement>(
        '.social-gamebanana-card',
      );
      if (gameBananaCard) {
        e.preventDefault();
        e.stopPropagation();
        const modelName = gameBananaCard.getAttribute('data-gb-model');
        const submissionId = gameBananaCard.getAttribute('data-gb-id');
        if (modelName && submissionId) {
          this.captureGameBananaDiscoverSnapshot();
          this.gameBananaLastDetailSource = {
            modelName,
            submissionId,
            sourceKind: this.getGameBananaCardSourceKind(gameBananaCard),
            page: this.gameBananaModsPage,
            scrollTop: this.getSocialMainScrollTop(),
          };
          await this.showGameBananaSubmissionDetails(
            modelName,
            submissionId,
            gameBananaCard,
          );
        }
        return false;
      }

      const socialGameBananaCard = clickedElement.closest<HTMLElement>(
        '.social-mod-card.has-gamebanana-detail',
      );
      if (
        socialGameBananaCard &&
        !clickedElement.closest('.social-creator-link') &&
        !clickedElement.closest('.social-mod-download-btn')
      ) {
        e.preventDefault();
        e.stopPropagation();
        await this.openSocialModGameBananaDetails(socialGameBananaCard);
        return false;
      }

      if (
        clickedElement.closest('.social-creator-link') &&
        !clickedElement.closest('.social-remove-friend-btn')
      ) {
        const creatorLink = clickedElement.closest('.social-creator-link');
        const username = creatorLink!.getAttribute('data-username');
        const userId = creatorLink!.getAttribute('data-userid');
        if (username && !clickedElement.closest('.social-mod-download-btn')) {
          this.showUserProfile(username, userId);
        }
      }

      if (clickedElement.closest('#social-back-btn')) {
        this.switchSection('people-downloads');
      }

      if (clickedElement.closest('#social-add-friend-btn')) {
        const btn = clickedElement.closest(
          '#social-add-friend-btn',
        ) as HTMLButtonElement;

        let userId = btn!.getAttribute('data-userid');

        const username =
          btn!.getAttribute('data-username') || this.viewedUsername;

        if (!userId) {
          userId = this.viewedUserId;
          if (!userId && username) {
            const addFriendText = document.querySelector<HTMLElement>(
              '#social-add-friend-text',
            );
            if (addFriendText) addFriendText.textContent = 'Finding user...';
            btn.disabled = true;

            try {
              const modsData = await this.fetchWithCache(
                `${this.API_URL}/list/links?idToken=${this.authToken}`,
                {},
                'links',
              );

              // Handle both array and paginated response
              const mods: {
                userId?: string;
                pseudo?: string;
                creator?: string;
              }[] = Array.isArray(modsData)
                ? modsData
                : modsData.documents || [];

              if (Array.isArray(mods)) {
                const userMod = mods.find(
                  (mod) => (mod.pseudo || mod.creator) === username,
                );

                if (userMod && userMod.userId) {
                  userId = userMod.userId;
                  this.viewedUserId = userId;
                  btn.setAttribute('data-userid', userId);
                  btn.disabled = false;
                  if (addFriendText) addFriendText.textContent = 'Add Friend';
                }
              }
            } catch (err) {
              console.error('[Social] Error finding userId:', err);
              btn.disabled = false;
              if (addFriendText) addFriendText.textContent = 'Add Friend';
            }
          }
        }

        if (userId) {
          this.sendFriendRequest(userId);
        } else {
          if (window.toastManager)
            window.toastManager.error(
              'Could not find user ID. Please try again.',
            );
          const addFriendText = document.querySelector<HTMLElement>(
            '#social-add-friend-text',
          );
          if (addFriendText) addFriendText.textContent = 'Add Friend';
          btn.disabled = false;
        }
      }

      const target = e.target as HTMLElement;

      if (target.closest('.social-accept-friend-btn')) {
        const btn = target.closest('.social-accept-friend-btn');
        const requestId = btn!.getAttribute('data-request-id');
        if (requestId) {
          await this.acceptFriendRequest(requestId);
        }
      }

      if (target.closest('.social-reject-friend-btn')) {
        const btn = target.closest('.social-reject-friend-btn');
        const requestId = btn!.getAttribute('data-request-id');
        if (requestId) {
          await this.rejectFriendRequest(requestId);
        }
      }
    });
  }

  async updateAddFriendButton(username, userId) {
    const addFriendBtn = document.querySelector<HTMLInputElement>(
      '#social-add-friend-btn',
    );

    const addFriendText = document.querySelector<HTMLElement>(
      '#social-add-friend-text',
    );

    if (!addFriendBtn) return;

    if (!this.userData) {
      addFriendBtn.style.display = 'none';
      return;
    }

    const targetUserId = userId || this.viewedUserId;

    if (targetUserId && targetUserId === this.userData.localId) {
      addFriendBtn.style.display = 'none';
      return;
    }

    addFriendBtn.style.display = 'block';
    addFriendBtn.style.opacity = '0';
    addFriendBtn.style.transform = 'translateY(-10px)';
    addFriendBtn.disabled = true;
    if (addFriendText) addFriendText.textContent = 'Add Friend';

    setTimeout(() => {
      addFriendBtn.style.transition = 'all 0.3s ease';
      addFriendBtn.style.opacity = '1';
      addFriendBtn.style.transform = 'translateY(0)';
    }, 100);

    this.checkFriendshipStatus(
      addFriendBtn,
      addFriendText,
      targetUserId,
      username,
    );
  }

  async checkFriendshipStatus(
    addFriendBtn,
    addFriendText,
    targetUserId,
    username,
  ) {
    if (!targetUserId) {
      addFriendBtn.disabled = false;
      if (addFriendText) addFriendText.textContent = 'Add Friend';
      addFriendBtn.setAttribute('data-username', username);
      return;
    }

    try {
      const data = await this.fetchWithCache(
        `${this.API_URL}/links-friends`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: this.authToken }),
        },
        'friends',
      );

      if (data.friends && Array.isArray(data.friends)) {
        const currentUserId = this.userData!.localId;

        const existingRelation = data.friends.find((f) => {
          const user1 = f.user_1 || f.user1;
          const user2 = f.user_2 || f.user2;
          return (
            (user1 === currentUserId && user2 === targetUserId) ||
            (user1 === targetUserId && user2 === currentUserId)
          );
        });

        if (existingRelation) {
          const status = existingRelation.status;
          if (status === 'accepted') {
            addFriendBtn.style.transition = 'all 0.3s ease';
            addFriendBtn.style.opacity = '0';
            addFriendBtn.style.transform = 'translateY(-10px)';
            setTimeout(() => {
              addFriendBtn.style.display = 'none';
            }, 300);
          } else if (status === 'pending') {
            const isSender =
              existingRelation.user_1 === currentUserId ||
              existingRelation.user1 === currentUserId;
            addFriendBtn.disabled = true;
            if (addFriendText)
              addFriendText.textContent = isSender
                ? 'Request Sent'
                : 'Pending Request';
            addFriendBtn.setAttribute('data-request-id', existingRelation.id);
          }
        } else {
          addFriendBtn.disabled = false;
          if (addFriendText) addFriendText.textContent = 'Add Friend';
          addFriendBtn.setAttribute('data-userid', targetUserId);
        }
      } else {
        addFriendBtn.disabled = false;
        if (addFriendText) addFriendText.textContent = 'Add Friend';
        addFriendBtn.setAttribute('data-userid', targetUserId);
      }
    } catch (error) {
      console.error('[Social] Error checking friendship:', error);
      addFriendBtn.disabled = false;
      if (addFriendText) addFriendText.textContent = 'Add Friend';
      if (targetUserId) addFriendBtn.setAttribute('data-userid', targetUserId);
    }
  }

  async sendFriendRequest(targetUserId) {
    if (!this.authToken || !this.userData) return;

    const addFriendBtn = document.querySelector<HTMLInputElement>(
      '#social-add-friend-btn',
    );
    const addFriendText = document.querySelector<HTMLElement>(
      '#social-add-friend-text',
    );

    if (addFriendBtn) {
      addFriendBtn.disabled = true;
      if (addFriendText) addFriendText.textContent = 'Sending...';
    }

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/create-friend-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentUserId: this.userData.localId,
            targetUserId: targetUserId,
            status: 'pending',
            idToken: this.authToken,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && !data.error) {
        if (window.toastManager)
          window.toastManager.success('toasts.friendRequestSent');
        if (addFriendText) addFriendText.textContent = 'Request Sent';
        if (addFriendBtn) {
          addFriendBtn.disabled = true;
          if (data.friendRequestId)
            addFriendBtn.setAttribute('data-request-id', data.friendRequestId);
        }
      } else {
        const errorMsg = data.error || 'toasts.failedToSendFriendRequest';
        if (window.toastManager) window.toastManager.error(errorMsg);
        if (addFriendBtn) addFriendBtn.disabled = false;
        if (addFriendText) addFriendText.textContent = 'Add Friend';
      }
    } catch (error) {
      console.error('[Social] Error sending friend request:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToSendFriendRequest');
      if (addFriendBtn) addFriendBtn.disabled = false;
      if (addFriendText) addFriendText.textContent = 'Add Friend';
    }
  }

  async acceptFriendRequest(requestId) {
    if (!this.authToken) return;

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/accept-friend-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: requestId,
            idToken: this.authToken,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && !data.error) {
        if (window.toastManager)
          window.toastManager.success('toasts.friendRequestAccepted');

        this.loadFriends();
      } else {
        const errorMsg = data.error || 'toasts.failedToAcceptFriendRequest';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('[Social] Error accepting friend request:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToAcceptFriendRequest');
    }
  }

  async rejectFriendRequest(requestId) {
    if (!this.authToken) return;

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/reject-friend-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: requestId,
            idToken: this.authToken,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && !data.error) {
        if (window.toastManager)
          window.toastManager.success('toasts.friendRequestRejected');

        this.loadFriends();
      } else {
        const errorMsg = data.error || 'toasts.failedToRejectFriendRequest';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('[Social] Error rejecting friend request:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToRejectFriendRequest');
    }
  }

  async removeFriend(relationId, friendId) {
    if (!this.authToken) {
      console.error('[Social] Cannot remove friend: no auth token');
      return;
    }

    console.log('[Social] removeFriend called:', { relationId, friendId });

    let friendUsername = 'this friend';
    const removeBtn = document.querySelector<HTMLElement>(
      `.social-remove-friend-btn[data-relation-id="${relationId}"]`,
    );
    if (removeBtn) {
      const friendCard = removeBtn.closest('.social-friend-card');
      if (friendCard) {
        const nameEl = friendCard.querySelector<HTMLElement>(
          '.social-friend-name',
        );
        if (nameEl) {
          friendUsername = nameEl.textContent || 'this friend';
        }
      }
    }

    console.log('[Social] Showing remove friend modal for:', friendUsername);

    this.showRemoveFriendModal(friendUsername, relationId);
  }

  showRemoveFriendModal(friendUsername, relationId) {
    console.log('[Social] showRemoveFriendModal called:', {
      friendUsername,
      relationId,
    });

    if (!this.authToken || !this.userData) {
      console.error(
        '[Social] Cannot show remove friend modal: user not logged in',
      );
      return;
    }

    this.hideRegisterModal();
    this.hideForgotPasswordModal();

    let modal = document.querySelector<HTMLElement>(
      '#social-remove-friend-modal',
    );

    if (!modal) {
      const socialTab = document.querySelector<HTMLElement>('#tab-social');
      if (socialTab) {
        modal = socialTab.querySelector<HTMLElement>(
          '#social-remove-friend-modal',
        );
      }
    }

    if (!modal) {
      console.error(
        '[Social] Remove friend modal not found in DOM. All modals:',
        document.querySelectorAll<HTMLElement>('.social-modal'),
      );
      if (window.toastManager) {
        window.toastManager.error('toasts.modalNotFound');
      }
      return;
    }

    console.log('[Social] Modal found, setting up...', modal);

    if (!modal.hasAttribute('data-initialized')) {
      this.setupRemoveFriendModal();
      modal.setAttribute('data-initialized', 'true');
    }

    const friendNameEl = modal.querySelector<HTMLElement>(
      '#social-remove-friend-name',
    );
    if (friendNameEl) {
      friendNameEl.textContent = friendUsername;
      console.log('[Social] Friend name set in modal:', friendUsername);
    } else {
      console.error('[Social] Friend name element not found in modal');
    }

    modal.setAttribute('data-relation-id', relationId);
    console.log('[Social] Relation ID stored:', relationId);

    modal.style.display = 'flex';
    modal.style.opacity = '0';
    modal.style.zIndex = '100000';

    const content = modal.querySelector<HTMLElement>('.social-modal-content');

    if (content) {
      content.style.transform = 'translateY(20px)';
      content.style.opacity = '0';
    }

    void modal.offsetHeight;

    requestAnimationFrame(() => {
      modal.style.transition = 'opacity 0.2s ease';
      modal.style.opacity = '1';

      if (content) {
        content.style.transition =
          'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease';
        content.style.transform = 'translateY(0)';
        content.style.opacity = '1';
      }

      console.log('[Social] Modal should now be visible. Computed styles:', {
        display: window.getComputedStyle(modal).display,
        opacity: window.getComputedStyle(modal).opacity,
        zIndex: window.getComputedStyle(modal).zIndex,
      });
    });
  }

  hideRemoveFriendModal() {
    const modal = document.querySelector<HTMLElement>(
      '#social-remove-friend-modal',
    );
    if (!modal) {
      const socialTab = document.querySelector<HTMLElement>('#tab-social');
      if (socialTab) {
        const tabModal = socialTab.querySelector<HTMLElement>(
          '#social-remove-friend-modal',
        );

        if (tabModal) {
          tabModal.style.display = 'none';
          tabModal.style.opacity = '0';
        }
      }
      return;
    }

    modal.style.display = 'none';
    modal.style.opacity = '0';
    modal.style.transition = 'none';

    const content = modal.querySelector<HTMLElement>('.social-modal-content');

    if (content) {
      content.style.opacity = '0';
      content.style.transform = 'translateY(20px)';
      content.style.transition = 'none';
    }
  }

  async confirmRemoveFriend(relationId) {
    if (!this.authToken) return;

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/reject-friend-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: relationId,
            idToken: this.authToken,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && !data.error) {
        this.hideRemoveFriendModal();
        if (window.toastManager)
          window.toastManager.success('toasts.friendRemoved');

        this.loadFriends();
      } else {
        const errorMsg = data.error || 'toasts.failedToRemoveFriend';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('[Social] Error removing friend:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToRemoveFriend');
    }
  }

  setupRemoveFriendModal() {
    setTimeout(() => {
      const modal = document.querySelector<HTMLElement>(
        '#social-remove-friend-modal',
      );
      if (!modal) {
        console.error('[Social] Remove friend modal not found during setup');
        return;
      }

      console.log('[Social] Setting up remove friend modal');

      modal.style.display = 'none';
      modal.style.opacity = '0';

      const closeBtn = modal.querySelector<HTMLElement>(
        '#social-remove-friend-close',
      );
      const cancelBtn = modal.querySelector<HTMLElement>(
        '#social-remove-friend-cancel',
      );
      const confirmBtn = modal.querySelector<HTMLElement>(
        '#social-remove-friend-confirm',
      );

      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.hideRemoveFriendModal();
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.hideRemoveFriendModal();
        });
      }

      if (confirmBtn) {
        confirmBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const relationId = modal.getAttribute('data-relation-id');
          console.log(
            '[Social] Confirm button clicked, relationId:',
            relationId,
          );
          if (relationId) {
            this.confirmRemoveFriend(relationId);
          }
        });
      }

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideRemoveFriendModal();
        }
      });
    }, 100);
  }

  async showUserProfile(username: string, userId: string | null = null) {
    this.viewedUserId = userId;
    this.viewedUsername = username;

    const userModsContent = document.querySelector<HTMLElement>(
      '#social-user-mods-content',
    );
    if (userModsContent) {
      userModsContent.innerHTML =
        '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading user mods...</p></div>';
      userModsContent.style.opacity = '0.5';
    }

    const usernameEl = document.querySelector<HTMLElement>(
      '#social-user-profile-username',
    );
    const avatarEl = document.querySelector<HTMLImageElement>(
      '#social-user-profile-avatar',
    );
    const bannerEl = document.querySelector<HTMLImageElement>(
      '#social-user-profile-banner',
    );

    if (usernameEl) {
      usernameEl.style.opacity = '0';
      usernameEl.textContent = username;
      setTimeout(() => {
        usernameEl.style.transition = 'opacity 0.3s ease';
        usernameEl.style.opacity = '1';
      }, 10);
    }
    this.applyProfileBadges('#social-user-profile-badges', []);
    if (avatarEl) {
      avatarEl.style.opacity = '0';
      avatarEl.src = 'https://files.catbox.moe/xry0hs.png';
      setTimeout(() => {
        avatarEl.style.transition = 'opacity 0.3s ease';
        avatarEl.style.opacity = '1';
      }, 10);
    }
    if (bannerEl) {
      bannerEl.removeAttribute('src');
      bannerEl
        .closest<HTMLElement>('.social-user-profile-banner')
        ?.classList.remove('has-image');
    }

    this.switchSection('user-profile');

    const navItems = document.querySelectorAll<HTMLElement>('.social-nav-item');
    navItems.forEach((item) => {
      item.classList.remove('active');
    });

    this.updateAddFriendButton(username, userId);

    this.loadUserMods(username, userId).then(() => {
      const resolvedUserId = userId || this.viewedUserId;
      if (resolvedUserId && resolvedUserId !== userId) {
        this.checkFriendshipStatus(
          document.querySelector<HTMLElement>('#social-add-friend-btn'),
          document.querySelector<HTMLElement>('#social-add-friend-text'),
          resolvedUserId,
          username,
        );
      }
    });

    if (userModsContent) {
      userModsContent.style.transition = 'opacity 0.3s ease';
      userModsContent.style.opacity = '1';
    }
  }

  async loadUserMods(username, userId: string | null = null) {
    const userModsContent = document.querySelector<HTMLElement>(
      '#social-user-mods-content',
    );
    if (!userModsContent || !this.authToken) return;

    try {
      const modsData = await this.fetchWithCache(
        `${this.API_URL}/list/links?idToken=${this.authToken}`,
        {},
        'links',
      );

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      if (Array.isArray(mods)) {
        const userMods = mods.filter((mod) => {
          const modUserId = mod.userId;
          const modPseudo = mod.pseudo;
          return (
            (userId && modUserId === userId) ||
            (username && modPseudo === username)
          );
        });

        if (userMods.length > 0 && !userId && userMods[0].userId) {
          userId = userMods[0].userId;
          this.viewedUserId = userId;
        } else if (userMods.length > 0 && userId) {
          this.viewedUserId = userId;
        }

        if (userId) {
          try {
            const userResponse = await fetch(
              `${this.API_URL}/read/users/${userId}`,
            );

            const userData: {
              fields: { [key: string]: string[] };
            } = await userResponse.json();

            if (userData.fields) {
              const userFields = this.parseFirestoreFields<UserFields>(
                userData.fields,
              );
              const avatarEl = document.querySelector<HTMLImageElement>(
                '#social-user-profile-avatar',
              );
              const bannerEl = document.querySelector<HTMLImageElement>(
                '#social-user-profile-banner',
              );
              if (avatarEl && userFields.photoURL) {
                avatarEl.style.transition = 'opacity 0.3s ease';
                avatarEl.style.opacity = '0';

                setTimeout(() => {
                  avatarEl.src = userFields.photoURL!;
                  avatarEl.style.opacity = '1';
                }, 150);
              }
              if (bannerEl) {
                const bannerContainer = bannerEl.closest<HTMLElement>(
                  '.social-user-profile-banner',
                );
                if (userFields.bannerURL) {
                  bannerEl.src = userFields.bannerURL;
                  bannerContainer?.classList.add('has-image');
                } else {
                  bannerEl.removeAttribute('src');
                  bannerContainer?.classList.remove('has-image');
                }
              }
              this.applyProfileBadges(
                '#social-user-profile-badges',
                userFields.badges,
              );
            }
          } catch (e) {
            console.warn('Failed to fetch user info:', e);
          }
        }

        const modsCountEl = document.querySelector<HTMLElement>(
          '#social-user-stat-mods',
        );
        if (modsCountEl) {
          modsCountEl.style.transform = 'scale(0.8)';
          modsCountEl.style.opacity = '0';
          modsCountEl.textContent = `${userMods.length}`;
          setTimeout(() => {
            modsCountEl.style.transition = 'all 0.3s ease';
            modsCountEl.style.transform = 'scale(1)';
            modsCountEl.style.opacity = '1';
          }, 100);
        }

        userModsContent.style.opacity = '0';
        userModsContent.style.transform = 'translateY(10px)';

        await new Promise((resolve) => setTimeout(resolve, 150));

        if (userMods.length > 0) {
          userModsContent.innerHTML =
            '<div class="social-mods-grid">' +
            userMods.map((mod) => this.renderModCard(mod, false)).join('') +
            '</div>';
        } else {
          userModsContent.innerHTML =
            '<div class="social-empty-state"><i class="bi bi-collection"></i><p>This user hasn\'t shared any mods yet</p></div>';
        }

        setTimeout(() => {
          userModsContent.style.transition = 'all 0.4s ease';
          userModsContent.style.opacity = '1';
          userModsContent.style.transform = 'translateY(0)';

          const cards =
            userModsContent.querySelectorAll<HTMLInputElement>(
              '.social-mod-card',
            );

          cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';

            setTimeout(() => {
              card.style.transition = 'all 0.3s ease';
              card.style.opacity = '1';
              card.style.transform = 'translateY(0)';
            }, index * 50);
          });
        }, 50);
      }
    } catch (error) {
      console.error('[Social] Error loading user mods:', error);
      userModsContent.innerHTML =
        '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load user mods</p></div>';
      userModsContent.style.opacity = '1';
      userModsContent.style.transform = 'translateY(0)';
    }
  }
}
