import type { ModManager } from './mod-manager';

class ModOperations {
  modManager: ModManager;

  constructor(modManager: ModManager) {
    this.modManager = modManager;
  }

  async renameMod(mod) {
    if (!mod.folderPath) {
      if (window.toastManager) {
        window.toastManager.error(
          'Cannot rename this mod - folder path not found',
        );
      }
      return;
    }

    if (window.modalManager) {
      window.modalManager.openRenameModal(mod, async (newName) => {
        if (window.electronAPI && window.electronAPI.renameMod) {
          const result = await window.electronAPI.renameMod(
            mod.folderPath,
            newName,
          );

          if (result.success) {
            console.log('Mod renamed successfully');
            if (window.toastManager) {
              window.toastManager.success('toasts.modRenamed', 3000, {
                name: newName,
              });
            }

            this.modManager.fetchMods();
          } else {
            if (window.toastManager) {
              window.toastManager.error('toasts.failedToRenameMod', 3000, {
                error: result.error,
              });
            }
          }
        }
      });
    }
  }

  async toggleModStatus(mod) {
    if (!mod.folderPath || !this.modManager.modsPath) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotToggleModStatus');
      }
      return;
    }

    if (window.electronAPI && window.electronAPI.toggleMod) {
      const result = await window.electronAPI.toggleMod(
        mod.folderPath,
        this.modManager.modsPath,
      );

      if (result.success) {
        console.log(
          `Mod ${result.isNowActive ? 'enabled' : 'disabled'} successfully`,
        );
        if (window.toastManager) {
          window.toastManager.success(
            result.isNowActive ? 'toasts.modEnabled' : 'toasts.modDisabled',
          );
        }

        this.modManager.fetchMods();
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToToggleMod', 3000, {
            error: result.error,
          });
        }
      }
    }
  }

  async openModFolder(mod) {
    if (!mod.folderPath) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotOpenFolder');
      }
      return;
    }

    if (window.electronAPI && window.electronAPI.openFolder) {
      const result = await window.electronAPI.openFolder(mod.folderPath);

      if (!result.success) {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToOpenFolder', 3000, {
            error: result.error,
          });
        }
      }
    }
  }

  async uninstallMod(mod) {
    if (!mod.folderPath) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotUninstallMod');
      }
      return;
    }

    if (window.modalManager) {
      window.modalManager.openUninstallModal(mod, async () => {
        if (window.electronAPI && window.electronAPI.deleteMod) {
          const result = await window.electronAPI.deleteMod(mod.folderPath);

          if (result.success) {
            console.log('Mod uninstalled successfully');

            if (
              this.modManager.selectedMod &&
              this.modManager.selectedMod.id === mod.id
            ) {
              this.modManager.selectedMod = null;
              const previewArea =
                document.querySelector<HTMLElement>('.preview-area');
              if (previewArea) {
                previewArea.innerHTML =
                  '<p style="color: #666; text-align: center;">No preview available</p>';
              }
              if (window.modInfoManager) {
                window.modInfoManager.clearModInfo();
              }
            }

            if (window.toastManager) {
              window.toastManager.success('toasts.modUninstalled');
            }

            this.modManager.fetchMods();
          } else {
            if (window.toastManager) {
              window.toastManager.error('toasts.failedToUninstallMod', 3000, {
                error: result.error,
              });
            }
          }
        }
      });
    }
  }

  async changeSlot(mod) {
    if (!mod.folderPath) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotChangeSlot');
      }
      return;
    }

    if (window.electronAPI && window.electronAPI.scanModSlots) {
      const result = await window.electronAPI.scanModSlots(mod.folderPath);

      if (result.success) {
        if (window.modalManager) {
          window.modalManager.openChangeSlotModal(
            mod,
            result.slots,
            async (changes) => {
              if (window.electronAPI && window.electronAPI.applySlotChanges) {
                const applyResult = await window.electronAPI.applySlotChanges(
                  mod.folderPath,
                  changes,
                );

                if (applyResult.success) {
                  if (window.toastManager) {
                    window.toastManager.success('toasts.slotChanged');
                  }

                  this.modManager.fetchMods();
                } else {
                  if (window.toastManager) {
                    window.toastManager.error(
                      'toasts.failedToChangeSlot',
                      3000,
                      { error: applyResult.error },
                    );
                  }
                }
              }
            },
          );
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToChangeSlot', 3000, {
            error: result.error || 'Unknown error',
          });
        }
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.ModOperations = ModOperations;
}

export { type ModOperations };
