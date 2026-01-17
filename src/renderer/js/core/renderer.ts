document.querySelector('.minimize').addEventListener('click', () => {
  if (window.electronAPI) {
    window.electronAPI.minimize();
  }
});

document.querySelector('.maximize').addEventListener('click', () => {
  if (window.electronAPI) {
    window.electronAPI.maximize();
  }
});

document.querySelector('.close').addEventListener('click', () => {
  if (window.electronAPI) {
    window.electronAPI.close();
  }
});

let currentTimeline = null;

async function switchTab(tabName) {
  if (currentTimeline) {
    currentTimeline.kill();
  }

  const currentTab = document.querySelector('.tab-content.active');
  const selectedTab = document.getElementById(`tab-${tabName}`);

  if (currentTab === selectedTab) return;

  if (window.tabLoader) {
    window.tabLoader.loadTabContent(tabName);
  }

  // Use Animation Manager if available
  if (window.animationManager) {
    window.animationManager.animateTabSwitch(currentTab, selectedTab, tabName);
  } else {
    // Fallback if Animation Manager isn't loaded for some reason
    if (selectedTab) {
      selectedTab.classList.add('active');
      selectedTab.style.display = 'flex';
    }
    if (currentTab) {
      currentTab.classList.remove('active');
      currentTab.style.display = 'none';
    }
  }

  document.querySelectorAll('.sidebar-btn').forEach((btn) => {
    btn.classList.remove('active');
  });

  const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeButton) {
    activeButton.classList.add('active');
  }

  console.log(`Switched to tab: ${tabName}`);

  // Reapply theme after tab switch
  if (window.settingsManager) {
    const currentTheme = window.settingsManager.settings.theme || 'dark';
    window.settingsManager.applyTheme(currentTheme);
  }

  if (window.statusBarManager) {
    window.statusBarManager.updateStatus(tabName);
  }
}

const sidebarButtons = document.querySelectorAll('.sidebar-btn');
sidebarButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab');
    if (tabName) {
      switchTab(tabName);
    }
  });
});

const actionButtons = document.querySelectorAll('.action-btn');
actionButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    console.log('Action button clicked:', btn.title);
  });
});

window.addEventListener('DOMContentLoaded', () => {
  if (window.tabLoader) {
    window.tabLoader.initializeTabs();
  }

  // Initialize Animation Manager
  if (window.animationManager) {
    window.animationManager.initialize();
  }

  setTimeout(() => {
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
      const tabId = activeTab.id.replace('tab-', '');
      if (window.statusBarManager && tabId) {
        window.statusBarManager.updateStatus(tabId);
      }
    } else {
      if (window.statusBarManager) {
        window.statusBarManager.updateStatus('tools');
      }
    }
  }, 100);

  setTimeout(async () => {
    if (window.pluginManager && window.settingsManager) {
      // Always call this, as it handles both auto-check logic AND the discovery intro modal
      window.pluginManager.checkForUpdatesOnStartup();
    }
  }, 2000); // Reduced delay slightly as checkForUpdatesOnStartup has its own delays if needed
});

document.addEventListener('keydown', async (e) => {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (isCtrlOrCmd && e.altKey && (e.key === 'r' || e.key === 'R')) {
    e.preventDefault();
    try {
      if (
        window.electronAPI &&
        window.electronAPI.store &&
        window.electronAPI.store.clear
      ) {
        await window.electronAPI.store.clear();
        if (window.toastManager) {
          window.toastManager.success('toasts.electronStoreReset');
        }
      }
    } catch (err) {
      console.error('Failed to reset store:', err);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToResetStore');
      }
    }
  }
});
