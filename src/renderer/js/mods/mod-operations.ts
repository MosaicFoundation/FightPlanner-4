import { Mod, ModManager } from './mod-manager';

class ModOperations {
  modManager: ModManager;

  constructor(modManager: ModManager) {
    this.modManager = modManager;
  }

  async renameMod(mod: Mod) {
    if (!mod.path) {
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
          const result = await window.electronAPI.renameMod(mod.path, newName);

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

  async toggleModStatus(mod: Mod) {
    if (!mod.path || !this.modManager.modsPath) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotToggleModStatus');
      }
      return;
    }

    if (window.electronAPI && window.electronAPI.toggleMod) {
      const result = await window.electronAPI.toggleMod(
        mod.path,
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

  async openModFolder(mod: Mod) {
    if (!mod.path) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotOpenFolder');
      }
      return;
    }

    if (window.electronAPI && window.electronAPI.openFolder) {
      const result = await window.electronAPI.openFolder(mod.path);

      if (!result.success) {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToOpenFolder', 3000, {
            error: result.error,
          });
        }
      }
    }
  }

  async uninstallMod(mod: Mod) {
    if (!mod.path) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotUninstallMod');
      }
      return;
    }

    if (window.modalManager) {
      window.modalManager.openUninstallModal(mod, async () => {
        if (window.electronAPI && window.electronAPI.deleteMod) {
          const result = await window.electronAPI.deleteMod(mod.path);

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

  async startChangeSlotsFlow(mod: Mod) {
    if (!mod.path) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotChangeSlot');
      }

      return;
    }

    if (window.electronAPI && window.electronAPI.scanMod) {
      const scanResult = await window.electronAPI.scanMod(mod.path);

      if (scanResult.success) {
        if (window.modalManager) {
          window.modalManager.openChangeSlotModal(
            mod,
            scanResult.data,
            async (slotAssignments, deletedSlots) => {
              if (window.electronAPI && window.electronAPI.changeSlots) {
                const changeSlotsResult = await window.electronAPI.changeSlots(
                  mod.path,
                  scanResult.data.pathData,
                  slotAssignments,
                  deletedSlots,
                );

                if (changeSlotsResult.success) {
                  if (window.toastManager) {
                    window.toastManager.success('toasts.slotChanged');
                  }

                  this.modManager.fetchMods();
                } else {
                  window.toastManager.error('toasts.failedToChangeSlot', 3000, {
                    error: changeSlotsResult.error,
                  });
                }
              }
            },
          );
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToChangeSlot', 3000, {
            error: scanResult.error || 'Unknown error',
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
