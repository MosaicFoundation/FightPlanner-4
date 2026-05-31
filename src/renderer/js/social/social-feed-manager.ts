class SocialFeedManager extends SocialGameBananaManager {
  [key: string]: any;
  async loadFeed() {
    const feedContent = document.querySelector<HTMLElement>(
      '#social-feed-content',
    );
    if (!feedContent || !this.authToken) return;

    feedContent.innerHTML =
      '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading mods...</p></div>';

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

      if (Array.isArray(mods) && mods.length > 0) {
        const userId = this.userData?.localId;
        const usernameEl = document.querySelector<HTMLElement>(
          '#social-profile-username',
        );
        const username = usernameEl ? usernameEl.textContent : null;

        feedContent.innerHTML =
          '<div class="social-mods-grid">' +
          mods
            .map((mod) => {
              const modUserId = mod.userId;
              const modPseudo = mod.pseudo;
              const isOwn = !!(
                modUserId === userId ||
                (username && modPseudo === username)
              );

              return this.renderModCard(mod, isOwn);
            })
            .join('') +
          '</div>';

        setTimeout(() => {
          const cards =
            feedContent.querySelectorAll<HTMLElement>('.social-mod-card');
          cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px) scale(0.95)';
            setTimeout(() => {
              card.style.transition = 'all 0.3s ease';
              card.style.opacity = '1';
              card.style.transform = 'translateY(0) scale(1)';
            }, index * 30);
          });
        }, 50);
      } else {
        feedContent.innerHTML =
          '<div class="social-empty-state"><i class="bi bi-inbox"></i><p>No mods to discover yet</p></div>';
      }
    } catch (error) {
      console.error('[Social] Error loading feed:', error);
      feedContent.innerHTML =
        '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load mods</p></div>';
    }
  }

  async loadMyMods() {
    const myModsContent = document.querySelector<HTMLElement>(
      '#social-my-mods-content',
    );
    if (!myModsContent || !this.userData) return;

    myModsContent.innerHTML =
      '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading your mods...</p></div>';

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

      if (Array.isArray(mods)) {
        const myMods = mods.filter((mod) => {
          const modUserId = mod.userId;
          const modPseudo = mod.pseudo;
          return modUserId === userId || (username && modPseudo === username);
        });

        if (myMods.length > 0) {
          myModsContent.innerHTML =
            '<div class="social-mods-grid">' +
            myMods.map((mod) => this.renderModCard(mod, true)).join('') +
            '</div>';

          setTimeout(() => {
            const cards =
              myModsContent.querySelectorAll<HTMLElement>('.social-mod-card');
            cards.forEach((card, index) => {
              card.style.opacity = '0';
              card.style.transform = 'translateY(20px) scale(0.95)';
              setTimeout(() => {
                card.style.transition = 'all 0.3s ease';
                card.style.transform = 'translateY(0) scale(1)';
                card.style.opacity = '1';
              }, index * 30);
            });
          }, 50);
        } else {
          myModsContent.innerHTML =
            '<div class="social-empty-state"><i class="bi bi-collection"></i><p>You haven\'t shared any mods yet</p></div>';
        }
      }
    } catch (error) {
      console.error('[Social] Error loading my mods:', error);
      myModsContent.innerHTML =
        '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load your mods</p></div>';
    }
  }

  async loadFriends() {
    const friendsContent = document.querySelector<HTMLElement>(
      '#social-friends-content',
    );
    const friendsListContainer = document.querySelector<HTMLElement>(
      '#social-friends-list-container',
    );
    const friendRequestsSection = document.querySelector<HTMLElement>(
      '#social-friend-requests-section',
    );
    const friendRequestsList = document.querySelector<HTMLElement>(
      '#social-friend-requests-list',
    );

    if (!friendsContent || !this.authToken) return;

    if (friendsListContainer) {
      friendsListContainer.innerHTML =
        '<div class="social-loading"><i class="bi bi-hourglass-split"></i><p>Loading friends...</p></div>';
    }
    if (friendRequestsList) {
      friendRequestsList.innerHTML = '';
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
        const currentUserId = this.userData?.localId;
        const acceptedFriends = data.friends.filter(
          (f) => f.status === 'accepted',
        );
        const pendingRequests = data.friends.filter((f) => {
          if (f.status !== 'pending') return false;
          const user1 = f.user_1 || f.user1;
          const user2 = f.user_2 || f.user2;

          return user2 === currentUserId;
        });

        if (
          pendingRequests.length > 0 &&
          friendRequestsList &&
          friendRequestsSection
        ) {
          const requestPromises = pendingRequests.map((req) =>
            this.renderFriendRequest(req),
          );
          const renderedRequests = await Promise.all(requestPromises);
          friendRequestsList.innerHTML = renderedRequests.join('');
          friendRequestsSection.style.display = 'block';

          setTimeout(() => {
            const cards = friendRequestsList.querySelectorAll<HTMLElement>(
              '.social-friend-request-card',
            );
            cards.forEach((card, index) => {
              card.style.opacity = '0';
              card.style.transform = 'translateY(-10px)';
              setTimeout(() => {
                card.style.transition = 'all 0.3s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
              }, index * 50);
            });
          }, 50);
        } else if (friendRequestsSection) {
          friendRequestsSection.style.display = 'none';
        }

        if (acceptedFriends.length > 0 && friendsListContainer) {
          const friendPromises = acceptedFriends.map((friend) =>
            this.renderFriendCard(friend),
          );
          const renderedFriends = await Promise.all(friendPromises);

          friendsListContainer.innerHTML =
            '<div class="social-friends-list">' +
            renderedFriends.join('') +
            '</div>';

          setTimeout(() => {
            const cards = friendsListContainer.querySelectorAll<HTMLElement>(
              '.social-friend-card',
            );
            cards.forEach((card, index) => {
              card.style.opacity = '0';
              card.style.transform = 'translateX(-20px)';

              setTimeout(() => {
                card.style.transition = 'all 0.3s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateX(0)';
              }, index * 50);
            });
          }, 50);
        } else if (friendsListContainer) {
          friendsListContainer.innerHTML =
            '<div class="social-empty-state"><i class="bi bi-people"></i><p>No friends yet</p></div>';
        }
      }
    } catch (error) {
      console.error('[Social] Error loading friends:', error);
      if (friendsListContainer) {
        friendsListContainer.innerHTML =
          '<div class="social-error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load friends</p></div>';
      }
    }
  }

  async renderFriendRequest(request) {
    const senderId = request.user_1 || request.user1;
    let senderUsername =
      request.senderUsername || request.username || 'Unknown';

    if (senderId && senderUsername === 'Unknown') {
      try {
        const userResponse = await fetch(
          `${this.API_URL}/read/users/${senderId}`,
        );
        const userData = await userResponse.json();
        const userFields = this.normalizeUserFields(userData);
        if (userFields.username) {
          senderUsername = userFields.username;
        }
      } catch (e) {
        console.warn('Failed to fetch sender username:', e);
      }
    }

    return `
            <div class="social-friend-request-card">
                <div class="social-friend-avatar">
                    <i class="bi bi-person-circle"></i>
                </div>
                <div class="social-friend-info">
                    <h3 class="social-friend-name">${senderUsername}</h3>
                    <p class="social-friend-status">Wants to be your friend</p>
                </div>
                <div class="social-friend-request-actions">
                    <button class="social-btn social-btn-success social-accept-friend-btn" data-request-id="${request.id}">
                        <i class="bi bi-check-lg"></i> Accept
                    </button>
                    <button class="social-btn social-btn-danger social-reject-friend-btn" data-request-id="${request.id}">
                        <i class="bi bi-x-lg"></i> Reject
                    </button>
                </div>
            </div>
        `;
  }

  renderModCard(mod, isOwn = false) {
    // Only show "installed" status for user's own mods, not for other users' mods
    const installedClass = isOwn && mod.modInstalled ? 'installed' : '';
    const isHidden = mod.isHidden === true || mod.isHidden === 'true';
    const hiddenClass = isOwn && isHidden ? ' is-hidden' : '';
    const installedBadge =
      isOwn && mod.modInstalled
        ? '<span class="social-mod-badge installed"><i class="bi bi-check-circle"></i> Installed</span>'
        : '';
    const hiddenBadge =
      isOwn && isHidden
        ? '<span class="social-mod-badge hidden"><i class="bi bi-eye-slash"></i> Hidden</span>'
        : '';
    const creator = mod.pseudo || mod.creator || 'Unknown';
    const creatorClass = isOwn ? '' : 'social-creator-link';
    const gameBananaInfo = this.getGameBananaInfoFromSocialMod(mod);
    const gameBananaAttrs = gameBananaInfo
      ? ` data-gb-model="${this.escapeHtml(gameBananaInfo.modelName)}" data-gb-id="${this.escapeHtml(gameBananaInfo.submissionId)}" data-gb-name="${this.escapeHtml(mod.mod_name || 'Unknown Mod')}" data-gb-image="${this.escapeHtml(mod.image_url || '')}" data-gb-creator="${this.escapeHtml(mod.creator || creator)}"`
      : '';
    const gameBananaClass = gameBananaInfo ? ' has-gamebanana-detail' : '';
    const gameBananaTitle = gameBananaInfo
      ? ' title="View GameBanana details"'
      : '';

    // Download button logic:
    // - For own mods: show Re-download if installed, Download if not
    // - For other users' mods: show Download button if they have a fightplanner link
    let downloadButton = '';
    if (mod.link && mod.link.startsWith('fightplanner:')) {
      if (isOwn) {
        downloadButton = `<button class="social-mod-download-btn" data-link="${mod.link}"><i class="bi bi-download"></i> ${mod.modInstalled ? 'Re-download' : 'Download'}</button>`;
      } else {
        // For other users' mods, just show "Download"
        downloadButton = `<button class="social-mod-download-btn" data-link="${mod.link}"><i class="bi bi-download"></i> Download</button>`;
      }
    }
    const visibilityButton =
      isOwn && mod.id
        ? `<button class="social-mod-visibility-btn" type="button" data-mod-id="${this.escapeHtml(mod.id)}" data-hidden="${isHidden ? 'true' : 'false'}">
            <i class="bi ${isHidden ? 'bi-eye' : 'bi-eye-slash'}"></i>
            <span>${isHidden ? 'Show in profile' : 'Hide from profile'}</span>
          </button>`
        : '';
    const actions =
      downloadButton || visibilityButton
        ? `<div class="social-mod-actions">${downloadButton}${visibilityButton}</div>`
        : '';

    return `
            <div class="social-mod-card ${installedClass}${hiddenClass}${gameBananaClass}"${gameBananaAttrs}${gameBananaTitle}>
                ${
                  mod.image_url
                    ? `<img src="${mod.image_url}" alt="${mod.mod_name || 'Mod'}" class="social-mod-image">`
                    : '<div class="social-mod-image-placeholder"><i class="bi bi-image"></i></div>'
                }
                <div class="social-mod-info">
                    <h3 class="social-mod-name">${mod.mod_name || 'Unknown Mod'}</h3>
                    <p class="social-mod-creator">
                        by <span class="${creatorClass}" data-username="${creator}" data-userid="${mod.userId || ''}">${creator}</span>
                    </p>
                    ${installedBadge}
                    ${hiddenBadge}
                    ${actions}
                </div>
            </div>
        `;
  }

  async updateSocialModVisibility(button: HTMLButtonElement) {
    if (!this.authToken) return;

    const modId = button.getAttribute('data-mod-id');
    const isHidden = button.getAttribute('data-hidden') === 'true';
    if (!modId) return;

    const nextHidden = !isHidden;
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML =
      '<i class="bi bi-hourglass-split"></i><span>Saving</span>';

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/write/links/${encodeURIComponent(modId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isHidden: nextHidden,
            _idToken: this.authToken,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      button.setAttribute('data-hidden', nextHidden ? 'true' : 'false');
      button.innerHTML = nextHidden
        ? '<i class="bi bi-eye"></i><span>Show in profile</span>'
        : '<i class="bi bi-eye-slash"></i><span>Hide from profile</span>';

      const card = button.closest<HTMLElement>('.social-mod-card');
      card?.classList.toggle('is-hidden', nextHidden);

      const info = card?.querySelector<HTMLElement>('.social-mod-info');
      let badge = info?.querySelector<HTMLElement>('.social-mod-badge.hidden');
      if (nextHidden && info && !badge) {
        badge = document.createElement('span');
        badge.className = 'social-mod-badge hidden';
        badge.innerHTML = '<i class="bi bi-eye-slash"></i> Hidden';
        const actions = info.querySelector('.social-mod-actions');
        info.insertBefore(badge, actions || null);
      } else if (!nextHidden) {
        badge?.remove();
      }

      this.invalidateCache('links');
      if (window.toastManager) {
        window.toastManager.success(
          nextHidden ? 'Mod hidden from your profile' : 'Mod visible again',
        );
      }
    } catch (error) {
      console.error('[Social] Failed to update mod visibility:', error);
      button.innerHTML = originalHtml;
      if (window.toastManager) {
        window.toastManager.error('Failed to update mod visibility');
      }
    } finally {
      button.disabled = false;
    }
  }

  async renderFriendCard(friend) {
    const friendId =
      friend.friendId || friend.userId || friend.user_1 || friend.user_2 || '';
    const friendRelationId = friend.id || '';
    let friendUsername = friend.username || friend.friendUsername || 'Unknown';
    const photoURL = friend.photoURL || '';

    if (
      friendUsername === 'Unknown' &&
      friendId &&
      friendId !== this.userData?.localId
    ) {
      try {
        const userResponse = await fetch(
          `${this.API_URL}/read/users/${friendId}`,
        );
        const userData = await userResponse.json();
        const userFields = this.normalizeUserFields(userData);
        if (userFields.username) {
          friendUsername = userFields.username;
        }
      } catch (e) {
        console.warn('Failed to fetch friend username:', e);
      }
    }

    return `
            <div class="social-friend-card social-creator-link" data-username="${friendUsername}" data-userid="${friendId}">
                <div class="social-friend-avatar">
                    ${
                      photoURL
                        ? `<img src="${photoURL}" alt="${friendUsername}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">`
                        : '<i class="bi bi-person-circle"></i>'
                    }
                </div>
                <div class="social-friend-info">
                    <h3 class="social-friend-name">${friendUsername}</h3>
                    <p class="social-friend-status">Friend</p>
                </div>
                <button class="social-remove-friend-btn" data-relation-id="${friendRelationId}" data-friend-id="${friendId}" title="Remove Friend">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        `;
  }
}
