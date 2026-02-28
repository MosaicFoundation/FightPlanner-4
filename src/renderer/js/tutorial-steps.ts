document.addEventListener('DOMContentLoaded', () => {
  let tutorialDevMode = false;
  const devOverrides: Record<string, any> = {};

  const apiWrapper = {
    async storeGet(key: string): Promise<any> {
      if (tutorialDevMode && key in devOverrides) return devOverrides[key];
      if (tutorialDevMode && devOverrides['dev.emulatorNotFound']) {
        if (key === 'tutorial.yuzuPath' || key === 'tutorial.ryujinxPath') return null;
      }
      return window.tutorialAPI.store.get(key);
    },
    async detectSdDrives(): Promise<any> {
      if (tutorialDevMode && devOverrides['dev.sdCardEmpty']) return { success: true, drives: [] };
      return window.tutorialAPI.detectSdDrives();
    },
    async installARCropolis(p: string): Promise<any> {
      if (tutorialDevMode && devOverrides['dev.installFail']) return { success: false, error: 'DEV: Simulated installation failure' };
      return (window.tutorialAPI as any).installARCropolis ? (window.tutorialAPI as any).installARCropolis(p) : { success: false };
    },
    async detectYuzuPath(): Promise<any> {
      if (tutorialDevMode && devOverrides['dev.emulatorNotFound']) return { success: false };
      return window.tutorialAPI.detectYuzuPath();
    },
    async detectRyujinxPath(): Promise<any> {
      if (tutorialDevMode && devOverrides['dev.emulatorNotFound']) return { success: false };
      return window.tutorialAPI.detectRyujinxPath();
    }
  };

  // Check for restored dev mode state
  try {
    const restoredState = localStorage.getItem('tutorialDevState');
    if (restoredState) {
      const parsed = JSON.parse(restoredState);
      tutorialDevMode = true;
      Object.assign(devOverrides, parsed);
      localStorage.removeItem('tutorialDevState');
    }
  } catch (e) {
    console.error('Error restoring dev state:', e);
  }

  let steps = [
    {
      icon: 'bi-stars',
      title: 'Welcome to FightPlanner',
      description: 'Your all-in-one mod manager for Super Smash Bros Ultimate',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 12px; font-size: 20px; font-weight: 600;">Let's get you started</h3>
    <p style="margin-bottom: 20px; color: rgba(255,255,255,0.7); font-size: 15px; line-height: 1.6;">This quick tutorial will help you set up FightPlanner 4 in just a few steps.</p>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; text-align: left;">
        <div style="padding: 20px; background: rgba(255, 255, 255, 0.05); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.05); transition: transform 0.2s ease;">
            <i class="bi bi-collection-play" style="font-size: 24px; color: #7a9bff; margin-bottom: 12px; display: block;"></i>
            <strong style="display: block; color: #fff; margin-bottom: 4px;">Manage Mods</strong>
            <span style="color: rgba(255,255,255,0.5); font-size: 13px;">Organize effortlessly</span>
        </div>
        
        <div style="padding: 20px; background: rgba(255, 255, 255, 0.05); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <i class="bi bi-cloud-download" style="font-size: 24px; color: #7a9bff; margin-bottom: 12px; display: block;"></i>
            <strong style="display: block; color: #fff; margin-bottom: 4px;">1-Click Install</strong>
            <span style="color: rgba(255,255,255,0.5); font-size: 13px;">From GameBanana</span>
        </div>
        
        <div style="padding: 20px; background: rgba(255, 255, 255, 0.05); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <i class="bi bi-people" style="font-size: 24px; color: #7a9bff; margin-bottom: 12px; display: block;"></i>
            <strong style="display: block; color: #fff; margin-bottom: 4px;">Characters</strong>
            <span style="color: rgba(255,255,255,0.5); font-size: 13px;">Sorted by fighter</span>
        </div>
        
        <div style="padding: 20px; background: rgba(255, 255, 255, 0.05); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <i class="bi bi-plugin" style="font-size: 24px; color: #7a9bff; margin-bottom: 12px; display: block;"></i>
            <strong style="display: block; color: #fff; margin-bottom: 4px;">Plugins</strong>
            <span style="color: rgba(255,255,255,0.5); font-size: 13px;">Handle .nro files</span>
        </div>
    </div>
</div>
`,
    },
    // ARCropolis Installation Steps - Inserted after welcome
    {
      icon: 'bi-device-hdd',
      title: 'Hardware Type',
      description: 'Tell us about your setup',
      content: `
<div style="text-align: center;">
    <div style="width: 80px; height: 80px; background: linear-gradient(135deg, rgba(122, 155, 255, 0.2), rgba(90, 123, 240, 0.2)); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; box-shadow: 0 8px 32px rgba(122, 155, 255, 0.2);">
        <i class="bi bi-device-hdd" style="font-size: 40px; color: #7a9bff;"></i>
    </div>
    
    <h3 style="color: #fff; margin-bottom: 12px; font-size: 24px; font-weight: 700;">What are you using?</h3>
    <p style="margin-bottom: 20px; color: rgba(255,255,255,0.6); font-size: 14px;">Are you playing on a real Nintendo Switch or an emulator?</p>
    
    <div style="display: flex; gap: 20px; max-width: 600px; margin: 0 auto;">
        <label class="hardware-option" data-value="hardware" style="flex: 1; position: relative; cursor: pointer;">
            <input type="radio" name="hardware-type" value="hardware" style="position: absolute; opacity: 0; pointer-events: none;">
            <div class="option-card" style="background: linear-gradient(135deg, rgba(122, 155, 255, 0.1), rgba(90, 123, 240, 0.05)); border: 2px solid rgba(122, 155, 255, 0.3); border-radius: 16px; padding: 32px 24px; text-align: center; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #7a9bff, #5a7bf0); opacity: 0; transition: opacity 0.3s;"></div>
                <div style="width: 64px; height: 64px; background: rgba(122, 155, 255, 0.15); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; transition: all 0.3s;">
                    <i class="bi bi-nintendo-switch" style="font-size: 36px; color: #7a9bff;"></i>
                </div>
                <h4 style="color: #fff; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">Real Hardware</h4>
                <p style="color: rgba(255,255,255,0.5); font-size: 13px; margin: 0;">Nintendo Switch</p>
                <div class="check-icon" style="position: absolute; top: 16px; right: 16px; width: 28px; height: 28px; background: #4caf50; border-radius: 50%; display: none; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);">
                    <i class="bi bi-check-lg" style="color: #fff; font-size: 16px;"></i>
                </div>
            </div>
        </label>
        
        <label class="hardware-option" data-value="emulator" style="flex: 1; position: relative; cursor: pointer;">
            <input type="radio" name="hardware-type" value="emulator" style="position: absolute; opacity: 0; pointer-events: none;">
            <div class="option-card" style="background: linear-gradient(135deg, rgba(122, 155, 255, 0.1), rgba(90, 123, 240, 0.05)); border: 2px solid rgba(122, 155, 255, 0.3); border-radius: 16px; padding: 32px 24px; text-align: center; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #7a9bff, #5a7bf0); opacity: 0; transition: opacity 0.3s;"></div>
                <div style="width: 64px; height: 64px; background: rgba(122, 155, 255, 0.15); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; transition: all 0.3s;">
                    <i class="bi bi-laptop" style="font-size: 36px; color: #7a9bff;"></i>
                </div>
                <h4 style="color: #fff; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">Emulator</h4>
                <p style="color: rgba(255,255,255,0.5); font-size: 13px; margin: 0;">Yuzu or Ryujinx</p>
                <div class="check-icon" style="position: absolute; top: 16px; right: 16px; width: 28px; height: 28px; background: #4caf50; border-radius: 50%; display: none; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);">
                    <i class="bi bi-check-lg" style="color: #fff; font-size: 16px;"></i>
                </div>
            </div>
        </label>
    </div>
</div>

<style>
.hardware-option input:checked + .option-card {
    border-color: #7a9bff;
    background: linear-gradient(135deg, rgba(122, 155, 255, 0.2), rgba(90, 123, 240, 0.1));
    box-shadow: 0 8px 32px rgba(122, 155, 255, 0.3);
    transform: translateY(-4px);
}

.hardware-option input:checked + .option-card > div:first-of-type {
    opacity: 1;
}

.hardware-option input:checked + .option-card .check-icon {
    display: flex;
}

.hardware-option input:checked + .option-card > div:nth-of-type(2) {
    background: rgba(122, 155, 255, 0.25);
    transform: scale(1.1);
}

.hardware-option:hover .option-card {
    border-color: rgba(122, 155, 255, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(122, 155, 255, 0.2);
}
</style>
`,
      onRender: async () => {
        const nextBtn = document.querySelector<HTMLElement>('#next-btn');
        const hardwareRadios = document.querySelectorAll<HTMLElement>(
          'input[name="hardware-type"]',
        );

        // Load saved answer
        if (window.tutorialAPI) {
          try {
            const hardwareType = await apiWrapper.storeGet(
              'tutorial.hardwareType',
            );
            if (hardwareType) {
              const radio = document.querySelector<HTMLInputElement>(
                `input[name="hardware-type"][value="${hardwareType}"]`,
              );
              if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change'));
              }
            }
          } catch (e) {
            console.error('Error loading tutorial state:', e);
          }
        }

        // Disable Next until selected
        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
          nextBtn.style.cursor = 'not-allowed';
        }

        const checkAndSave = async () => {
          const hardwareSelected = document.querySelector<HTMLInputElement>(
            'input[name="hardware-type"]:checked',
          );

          if (hardwareSelected && window.tutorialAPI) {
            const hardwareType = hardwareSelected.value;
            await window.tutorialAPI.store.set(
              'tutorial.hardwareType',
              hardwareType,
            );

            if (nextBtn) {
              nextBtn.style.opacity = '1';
              nextBtn.style.pointerEvents = 'auto';
              nextBtn.style.cursor = 'pointer';
            }
          }
        };

        hardwareRadios.forEach((radio) => {
          radio.addEventListener('change', checkAndSave);
        });

        // Initial check
        checkAndSave();
      },
    },
    {
      icon: 'bi-question-circle',
      title: 'ARCropolis Status',
      description: 'Do you already have ARCropolis installed?',
      content: `
<div style="text-align: center;">
    <div style="width: 80px; height: 80px; background: linear-gradient(135deg, rgba(76, 175, 80, 0.2), rgba(56, 142, 60, 0.2)); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; box-shadow: 0 8px 32px rgba(76, 175, 80, 0.2);">
        <i class="bi bi-question-circle" style="font-size: 40px; color: #4caf50;"></i>
    </div>
    
    <h3 style="color: #fff; margin-bottom: 12px; font-size: 24px; font-weight: 700;">ARCropolis Installation</h3>
    <p style="margin-bottom: 20px; color: rgba(255,255,255,0.6); font-size: 14px;">ARCropolis is required to use mods. Have you already installed it?</p>
    
    <div style="display: flex; gap: 20px; max-width: 500px; margin: 0 auto;">
        <label class="arcropolis-option" data-value="yes" style="flex: 1; position: relative; cursor: pointer;">
            <input type="radio" name="arcropolis-installed" value="yes" style="position: absolute; opacity: 0; pointer-events: none;">
            <div class="option-card-yes" style="background: linear-gradient(135deg, rgba(76, 175, 80, 0.1), rgba(56, 142, 60, 0.05)); border: 2px solid rgba(76, 175, 80, 0.3); border-radius: 16px; padding: 32px 24px; text-align: center; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #4caf50, #388e3c); opacity: 0; transition: opacity 0.3s;"></div>
                <div style="width: 64px; height: 64px; background: rgba(76, 175, 80, 0.15); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; transition: all 0.3s;">
                    <i class="bi bi-check-circle-fill" style="font-size: 36px; color: #4caf50;"></i>
                </div>
                <h4 style="color: #fff; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">Yes</h4>
                <p style="color: rgba(255,255,255,0.5); font-size: 13px; margin: 0;">Already installed</p>
                <div class="check-icon" style="position: absolute; top: 16px; right: 16px; width: 28px; height: 28px; background: #4caf50; border-radius: 50%; display: none; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);">
                    <i class="bi bi-check-lg" style="color: #fff; font-size: 16px;"></i>
                </div>
            </div>
        </label>
        
        <label class="arcropolis-option" data-value="no" style="flex: 1; position: relative; cursor: pointer;">
            <input type="radio" name="arcropolis-installed" value="no" style="position: absolute; opacity: 0; pointer-events: none;">
            <div class="option-card-no" style="background: linear-gradient(135deg, rgba(255, 193, 7, 0.1), rgba(255, 152, 0, 0.05)); border: 2px solid rgba(255, 193, 7, 0.3); border-radius: 16px; padding: 32px 24px; text-align: center; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #ffc107, #ff9800); opacity: 0; transition: opacity 0.3s;"></div>
                <div style="width: 64px; height: 64px; background: rgba(255, 193, 7, 0.15); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; transition: all 0.3s;">
                    <i class="bi bi-download" style="font-size: 36px; color: #ffc107;"></i>
                </div>
                <h4 style="color: #fff; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">No</h4>
                <p style="color: rgba(255,255,255,0.5); font-size: 13px; margin: 0;">Need to install</p>
                <div class="check-icon" style="position: absolute; top: 16px; right: 16px; width: 28px; height: 28px; background: #ffc107; border-radius: 50%; display: none; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(255, 193, 7, 0.4);">
                    <i class="bi bi-check-lg" style="color: #fff; font-size: 16px;"></i>
                </div>
            </div>
        </label>
    </div>
</div>

<style>
.arcropolis-option input:checked + .option-card-yes {
    border-color: #4caf50;
    background: linear-gradient(135deg, rgba(76, 175, 80, 0.2), rgba(56, 142, 60, 0.1));
    box-shadow: 0 8px 32px rgba(76, 175, 80, 0.3);
    transform: translateY(-4px);
}

.arcropolis-option input:checked + .option-card-yes > div:first-of-type {
    opacity: 1;
}

.arcropolis-option input:checked + .option-card-yes .check-icon {
    display: flex;
}

.arcropolis-option input:checked + .option-card-yes > div:nth-of-type(2) {
    background: rgba(76, 175, 80, 0.25);
    transform: scale(1.1);
}

.arcropolis-option input:checked + .option-card-no {
    border-color: #ffc107;
    background: linear-gradient(135deg, rgba(255, 193, 7, 0.2), rgba(255, 152, 0, 0.1));
    box-shadow: 0 8px 32px rgba(255, 193, 7, 0.3);
    transform: translateY(-4px);
}

.arcropolis-option input:checked + .option-card-no > div:first-of-type {
    opacity: 1;
}

.arcropolis-option input:checked + .option-card-no .check-icon {
    display: flex;
}

.arcropolis-option input:checked + .option-card-no > div:nth-of-type(2) {
    background: rgba(255, 193, 7, 0.25);
    transform: scale(1.1);
}

.arcropolis-option:hover .option-card-yes,
.arcropolis-option:hover .option-card-no {
    border-color: rgba(122, 155, 255, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(122, 155, 255, 0.2);
}
</style>
`,
      onRender: async () => {
        const nextBtn = document.querySelector<HTMLElement>('#next-btn');
        const arcropolisRadios = document.querySelectorAll<HTMLElement>(
          'input[name="arcropolis-installed"]',
        );

        // Load saved answer
        if (window.tutorialAPI) {
          try {
            const arcropolisInstalled = await apiWrapper.storeGet(
              'tutorial.arcropolisInstalled',
            );
            if (
              arcropolisInstalled !== null &&
              arcropolisInstalled !== undefined
            ) {
              const value = arcropolisInstalled ? 'yes' : 'no';
              const radio = document.querySelector<HTMLInputElement>(
                `input[name="arcropolis-installed"][value="${value}"]`,
              );
              if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change'));
              }
            }
          } catch (e) {
            console.error('Error loading tutorial state:', e);
          }
        }

        // Disable Next until selected
        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
          nextBtn.style.cursor = 'not-allowed';
        }

        const checkAndSave = async () => {
          const arcropolisSelected = document.querySelector<HTMLInputElement>(
            'input[name="arcropolis-installed"]:checked',
          );

          if (arcropolisSelected && window.tutorialAPI) {
            const arcropolisInstalled = arcropolisSelected.value === 'yes';
            await window.tutorialAPI.store.set(
              'tutorial.arcropolisInstalled',
              arcropolisInstalled,
            );

            if (nextBtn) {
              nextBtn.style.opacity = '1';
              nextBtn.style.pointerEvents = 'auto';
              nextBtn.style.cursor = 'pointer';
            }
          }
        };

        arcropolisRadios.forEach((radio) => {
          radio.addEventListener('change', checkAndSave);
        });

        // Initial check
        checkAndSave();
      },
    },
    {
      icon: 'bi-sd-card',
      title: 'Switch SD Card Setup',
      description: 'Detect and configure your SD card',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Insert Your SD Card</h3>
    <p style="margin-bottom: 32px; color: rgba(255,255,255,0.7);">Please insert your Nintendo Switch SD card into your PC.</p>
    
    <div id="sd-card-status" style="display: flex; flex-direction: column; gap: 16px; text-align: left; max-width: 500px; margin: 0 auto;">
        <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="color: #fff;">Detecting drives...</span>
                <div id="detection-spinner" style="width: 20px; height: 20px; border: 2px solid rgba(122, 155, 255, 0.3); border-top-color: #7a9bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
        </div>
    </div>
    
    <style>
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</div>
`,
      onRender: async () => {

        const statusDiv = document.querySelector<HTMLElement>('#sd-card-status');
        const nextBtn = document.querySelector<HTMLElement>('#next-btn');

        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
        }

        if (window.tutorialAPI) {
          try {
            const result = await apiWrapper.detectSdDrives();
            if (result.success && result.drives) {
              const drives = result.drives;

              if (drives.length === 0) {
                statusDiv!.innerHTML = `
                            <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 12px; padding: 16px; text-align: center;">
                                <p style="color: #ffc107; margin-bottom: 16px;">No drives detected. Please insert your SD card and click "Detect Again".</p>
                                <button id="retry-detect-btn" style="background: rgba(122, 155, 255, 0.2); color: #7a9bff; border: 1px solid rgba(122, 155, 255, 0.3); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600;">
                                    Detect Again
                                </button>
                            </div>
                        `;
                document
                  .querySelector<HTMLElement>('#retry-detect-btn')
                  ?.addEventListener('click', () => {
                    statusDiv!.innerHTML =
                      '<div style="text-align: center; color: #fff;">Detecting drives...</div>';
                    setTimeout(() => steps[currentStep].onRender!(), 1000);
                  });
              } else if (drives.length === 1) {
                const drive = drives[0];
                const sdPath = drive.path;
                await window.tutorialAPI.store.set('tutorial.sdDrive', sdPath);

                statusDiv!.innerHTML = `
                            <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                        <div>
                                            <strong style="color: #fff; display: block;">Drive Detected</strong>
                                            <span style="color: rgba(255,255,255,0.6); font-size: 13px; font-family: monospace;">${sdPath}</span>
                                        </div>
                                    </div>
                                    <button id="wrong-drive-btn" style="padding: 6px 12px; background: rgba(255, 193, 7, 0.1); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s;">
                                        Wrong drive?
                                    </button>
                                </div>
                            </div>
                        `;

                document
                  .querySelector<HTMLElement>('#wrong-drive-btn')
                  ?.addEventListener('click', async () => {
                    const result = await window.tutorialAPI.selectDrive();
                    if (result.success && !result.canceled) {
                      await window.tutorialAPI.store.set(
                        'tutorial.sdDrive',
                        result.path,
                      );
                      statusDiv!.innerHTML = `
                                    <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                        <div style="display: flex; align-items: center; justify-content: space-between;">
                                            <div style="display: flex; align-items: center; gap: 12px;">
                                                <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                                <div>
                                                    <strong style="color: #fff; display: block;">Selected: ${result.path}</strong>
                                                </div>
                                            </div>
                                            <button id="wrong-drive-btn-2" style="padding: 6px 12px; background: rgba(255, 193, 7, 0.1); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">
                                                Wrong drive?
                                            </button>
                                        </div>
                                    </div>
                                `;
                      document
                        .querySelector<HTMLElement>('#wrong-drive-btn-2')
                        ?.addEventListener('click', async () => {
                          const result2 = await window.tutorialAPI.selectDrive();
                          if (result2.success && !result2.canceled) {
                            await window.tutorialAPI.store.set(
                              'tutorial.sdDrive',
                              result2.path,
                            );
                            statusDiv!.innerHTML = `
                                            <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                                <div style="display: flex; align-items: center; gap: 12px;">
                                                    <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                                    <div>
                                                        <strong style="color: #fff; display: block;">Selected: ${result2.path}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        `;
                          }
                        });
                    }
                  });

                if (nextBtn) {
                  nextBtn.style.opacity = '1';
                  nextBtn.style.pointerEvents = 'auto';
                }
              } else {
                // Multiple drives - show selector
                statusDiv!.innerHTML = `
                            <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
                                <p style="color: #fff; margin-bottom: 12px; font-weight: 600;">Multiple drives detected. Please select your SD card:</p>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${drives
                    .map(
                      (drive, idx) => `
                                        <button class="drive-select-btn" data-path="${drive.path}" style="padding: 12px; background: rgba(122, 155, 255, 0.1); border: 2px solid rgba(122, 155, 255, 0.3); border-radius: 8px; color: #fff; cursor: pointer; text-align: left; transition: all 0.2s;">
                                            <strong>${drive.letter}:</strong> ${drive.label} (${drive.type})
                                        </button>
                                    `,
                    )
                    .join('')}
                                </div>
                                <button id="manual-select-btn" style="margin-top: 12px; padding: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: #fff; cursor: pointer; width: 100%;">
                                    Browse Manually...
                                </button>
                            </div>
                        `;

                document
                  .querySelectorAll<HTMLElement>('.drive-select-btn')
                  .forEach((btn) => {
                    btn.addEventListener('click', async () => {
                      const path = btn.dataset.path;
                      await window.tutorialAPI.store.set(
                        'tutorial.sdDrive',
                        path,
                      );
                      statusDiv!.innerHTML = `
                                    <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                        <div style="display: flex; align-items: center; gap: 12px;">
                                            <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                            <div>
                                                <strong style="color: #fff; display: block;">Selected: ${path}</strong>
                                            </div>
                                        </div>
                                    </div>
                                `;
                      if (nextBtn) {
                        nextBtn.style.opacity = '1';
                        nextBtn.style.pointerEvents = 'auto';
                      }
                    });
                  });

                document
                  .querySelector<HTMLElement>('#manual-select-btn')
                  ?.addEventListener('click', async () => {
                    const result = await window.tutorialAPI.selectDrive();
                    if (result.success && !result.canceled) {
                      await window.tutorialAPI.store.set(
                        'tutorial.sdDrive',
                        result.path,
                      );
                      statusDiv!.innerHTML = `
                                    <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                        <div style="display: flex; align-items: center; gap: 12px;">
                                            <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                            <div>
                                                <strong style="color: #fff; display: block;">Selected: ${result.path}</strong>
                                            </div>
                                        </div>
                                    </div>
                                `;
                      if (nextBtn) {
                        nextBtn.style.opacity = '1';
                        nextBtn.style.pointerEvents = 'auto';
                      }
                    }
                  });
              }
            }
          } catch (error) {
            console.error('Error detecting drives:', error);
            statusDiv!.innerHTML = `
                    <div style="background: rgba(255, 77, 77, 0.1); border: 1px solid rgba(255, 77, 77, 0.3); border-radius: 12px; padding: 16px; text-align: center;">
                        <p style="color: #ff4d4d;">Error detecting drives. Please use manual selection.</p>
                        <button id="manual-select-error-btn" style="margin-top: 12px; padding: 10px 20px; background: rgba(122, 155, 255, 0.2); color: #7a9bff; border: 1px solid rgba(122, 155, 255, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600;">
                            Select Manually
                        </button>
                    </div>
                `;
            document
              .querySelector<HTMLElement>('#manual-select-error-btn')
              ?.addEventListener('click', async () => {
                const result = await window.tutorialAPI.selectDrive();
                if (result.success && !result.canceled) {
                  await window.tutorialAPI.store.set(
                    'tutorial.sdDrive',
                    result.path,
                  );
                  statusDiv!.innerHTML = `
                            <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                    <div>
                                        <strong style="color: #fff; display: block;">Selected: ${result.path}</strong>
                                    </div>
                                </div>
                            </div>
                        `;
                  if (nextBtn) {
                    nextBtn.style.opacity = '1';
                    nextBtn.style.pointerEvents = 'auto';
                  }
                }
              });
          }
        }
      },
    },
    {
      icon: 'bi-download',
      title: 'Installing Skyline & ARCropolis (Switch)',
      description:
        'Downloading and installing Skyline (exefs) and ARCropolis (romfs) on your SD card',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Installing ARCropolis</h3>
    <div id="install-status" style="display: flex; flex-direction: column; gap: 16px; text-align: left; max-width: 500px; margin: 0 auto;">
        <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #fff;">Preparing installation...</span>
                <div id="install-spinner" style="width: 20px; height: 20px; border: 2px solid rgba(122, 155, 255, 0.3); border-top-color: #7a9bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
            <div id="install-progress" style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; margin-top: 8px;">
                <div id="progress-bar" style="height: 100%; background: #7a9bff; width: 0%; transition: width 0.3s;"></div>
            </div>
        </div>
    </div>
</div>
`,
      onRender: async () => {

        const statusDiv = document.querySelector<HTMLElement>('#install-status');
        const nextBtn = document.querySelector<HTMLElement>('#next-btn');
        const progressBar = document.querySelector<HTMLElement>('#progress-bar');

        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
        }

        try {
          const sdDrive = (await apiWrapper.storeGet(
            'tutorial.sdDrive',
          )) as string | null;

          if (!sdDrive) {
            statusDiv!.innerHTML =
              '<div style="color: #ff4d4d;">Error: SD card path not found. Please go back and select your SD card.</div>';
            return;
          }

          // Get latest releases (Skyline for exefs, ARCropolis for romfs)
          statusDiv!.innerHTML = `
                <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
                    <div style="color: #fff; margin-bottom: 8px;">Fetching latest releases...</div>
                    <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                        <div id="progress-bar" style="height: 100%; background: #7a9bff; width: 10%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;

          const skylineRelease = await window.tutorialAPI.getSkylineRelease();
          if (!skylineRelease.success)
            throw new Error('Failed to get Skyline release');

          const arcropolisRelease = await window.tutorialAPI.getGithubRelease();
          if (!arcropolisRelease.success)
            throw new Error('Failed to get ARCropolis release');

          progressBar!.style.width = '20%';
          statusDiv!.innerHTML = `
                <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
                    <div style="color: #fff; margin-bottom: 8px;">Downloading Skyline ${skylineRelease.version} (exefs)...</div>
                    <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                        <div id="progress-bar" style="height: 100%; background: #7a9bff; width: 20%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;

          // Download Skyline - get temp directory
          const tempDirResult = await window.tutorialAPI.getTempDir();
          if (!tempDirResult.success)
            throw new Error('Failed to get temp directory');
          const skylineTempPathResult = await window.tutorialAPI.joinPath(
            tempDirResult.path,
            `skyline-${Date.now()}.zip`,
          );
          if (!skylineTempPathResult.success)
            throw new Error('Failed to construct temp path');
          const skylineTempPath = skylineTempPathResult.path;
          const skylineDownloadResult =
            await window.tutorialAPI.downloadArcropolis(
              skylineRelease.downloadUrl,
              skylineTempPath,
            );
          if (!skylineDownloadResult.success)
            throw new Error('Skyline download failed');

          progressBar!.style.width = '40%';
          statusDiv!.innerHTML = `
                <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
                    <div style="color: #fff; margin-bottom: 8px;">Downloading ARCropolis ${arcropolisRelease.version} (romfs)...</div>
                    <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                        <div id="progress-bar" style="height: 100%; background: #7a9bff; width: 40%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;

          // Download ARCropolis
          const arcropolisTempPathResult = await window.tutorialAPI.joinPath(
            tempDirResult.path,
            `arcropolis-${Date.now()}.zip`,
          );
          if (!arcropolisTempPathResult.success)
            throw new Error('Failed to construct temp path');
          const arcropolisTempPath = arcropolisTempPathResult.path;
          const arcropolisDownloadResult =
            await window.tutorialAPI.downloadArcropolis(
              arcropolisRelease.downloadUrl,
              arcropolisTempPath,
            );
          if (!arcropolisDownloadResult.success)
            throw new Error('ARCropolis download failed');

          progressBar!.style.width = '60%';
          statusDiv!.innerHTML = `
                <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
                    <div style="color: #fff; margin-bottom: 8px;">Installing Skyline (exefs)...</div>
                    <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                        <div id="progress-bar" style="height: 100%; background: #7a9bff; width: 60%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;

          // Extract and install Skyline (exefs) - construct paths
          const targetDirResult = await window.tutorialAPI.joinPath(
            sdDrive,
            'atmosphere',
            'contents',
            '01006A800016E000',
          );
          if (!targetDirResult.success)
            throw new Error('Failed to construct target path');
          const targetDir = targetDirResult.path;
          await window.tutorialAPI.createDirectory(targetDir);
          const skylineExtractResult = await window.tutorialAPI.extractSkyline(
            skylineDownloadResult.path,
            targetDir,
          );
          if (!skylineExtractResult.success)
            throw new Error('Skyline extraction failed');

          progressBar!.style.width = '80%';
          statusDiv!.innerHTML = `
                <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
                    <div style="color: #fff; margin-bottom: 8px;">Installing ARCropolis (romfs)...</div>
                    <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                        <div id="progress-bar" style="height: 100%; background: #7a9bff; width: 80%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;

          // Extract and install ARCropolis (romfs)
          const arcropolisExtractResult =
            await window.tutorialAPI.extractArcropolis(
              arcropolisDownloadResult.path,
              targetDir,
            );
          if (!arcropolisExtractResult.success)
            throw new Error('ARCropolis extraction failed');

          // Create mods directory
          const modsDirResult = await window.tutorialAPI.joinPath(
            sdDrive,
            'ultimate',
            'mods',
          );
          if (!modsDirResult.success)
            throw new Error('Failed to construct mods path');
          const modsDir = modsDirResult.path;
          await window.tutorialAPI.createDirectory(modsDir);

          progressBar!.style.width = '100%';
          statusDiv!.innerHTML = `
                <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                        <div>
                            <strong style="color: #fff; display: block;">Installation complete!</strong>
                            <span style="color: rgba(255,255,255,0.6); font-size: 13px;">Skyline ${skylineRelease.version} (exefs) + ARCropolis ${arcropolisRelease.version} (romfs)</span>
                        </div>
                    </div>
                </div>
            `;

          if (nextBtn) {
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        } catch (error) {
          console.error('Installation error:', error);
          statusDiv!.innerHTML = `
                <div style="background: rgba(255, 77, 77, 0.1); border: 1px solid rgba(255, 77, 77, 0.3); border-radius: 12px; padding: 16px;">
                    <div style="color: #ff4d4d; margin-bottom: 12px;">
                        <strong>Installation failed:</strong> ${error.message}
                    </div>
                    <p style="color: rgba(255,255,255,0.7); font-size: 13px; margin-top: 12px;">
                        Please join the <a href="https://discord.gg/2zT5Rg46bG" target="_blank">FightPlanner Discord</a> for assistance.
                    </p>
                </div>
            `;
          setupDiscordLinks(statusDiv!);
        }
      },
    },
    {
      icon: 'bi-controller',
      title: 'Verify ARCropolis (Switch)',
      description: 'Launch the game and verify installation',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Verify Installation</h3>
    <p style="margin-bottom: 24px; color: rgba(255,255,255,0.7);">Please launch Super Smash Bros. Ultimate on your Switch and check if ARCropolis is working.</p>
    
    <div style="position: relative; width: 100%; max-width: 600px; margin: 0 auto 24px;">
        <div id="arcropolis-lottie-switch" style="width: 100%; height: 200px; display: flex; align-items: center; justify-content: center;"></div>
        <div class="scroll-indicator" style="position: absolute; bottom: 10%; right: -20px; animation: bounce-side 2s infinite; pointer-events: none; background: rgba(20, 20, 20, 0.6); border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10;">
            <i class="bi bi-chevron-down" style="color: #7a9bff; font-size: 20px;"></i>
        </div>
        <style>
            @keyframes bounce-side {
                0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                40% { transform: translateY(10px); }
                60% { transform: translateY(5px); }
            }
        </style>
    </div>
    
    <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 12px; padding: 20px; max-width: 500px; margin: 0 auto; text-align: left;">
        <p style="color: #ffc107; margin-bottom: 16px; font-weight: 600;">
            <i class="bi bi-info-circle-fill"></i> What to look for:
        </p>
        <ul style="color: rgba(255,255,255,0.8); margin-left: 20px; line-height: 1.8;">
            <li>Launch Super Smash Bros. Ultimate</li>
            <li>Look for <strong style="color: #fff;">ARCropolis version text</strong> in the <strong style="color: #fff;">top-right corner</strong> of the screen</li>
            <li>If you see it, ARCropolis is working!</li>
        </ul>
    </div>
    
    
    
    <div id="verification-status" style="margin-top: 24px; display: flex; flex-direction: column; gap: 12px; max-width: 500px; margin-left: auto; margin-right: auto;">
        <p style="color: rgba(255,255,255,0.7);">Did you see the ARCropolis text?</p>
        <div style="display: flex; gap: 12px;">
            <button id="verify-yes-btn" style="flex: 1; padding: 12px; background: rgba(76, 175, 80, 0.2); color: #4caf50; border: 2px solid rgba(76, 175, 80, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600;">
                Yes, it's working!
            </button>
            <button id="verify-no-btn" style="flex: 1; padding: 12px; background: rgba(255, 77, 77, 0.2); color: #ff4d4d; border: 2px solid rgba(255, 77, 77, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600;">
                No, not working
            </button>
        </div>
    </div>
</div>
`,
      onRender: async () => {

        const nextBtn = document.querySelector<HTMLElement>('#next-btn');
        const verifyYesBtn =
          document.querySelector<HTMLElement>('#verify-yes-btn');
        const verifyNoBtn = document.querySelector<HTMLElement>('#verify-no-btn');
        const lottieContainer = document.querySelector<HTMLElement>(
          '#arcropolis-lottie-switch',
        );

        // Load Lottie animation for Switch
        if (lottieContainer && window.lottie) {
          try {
            const anim = window.lottie.loadAnimation({
              container: lottieContainer,
              renderer: 'svg',
              loop: true,
              autoplay: true,
              path: '../images/tutorial-arcropolisSWITCH.json',
            });
          } catch (e) {
            console.error('Failed to load Lottie animation:', e);
          }
        }

        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
        }

        verifyYesBtn?.addEventListener('click', async () => {
          await window.tutorialAPI.store.set('tutorial.arcropolisVerified', true);
          const statusDiv = document.querySelector<HTMLElement>(
            '#verification-status',
          );
          statusDiv!.innerHTML = `
                <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px; text-align: center;">
                    <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 32px; margin-bottom: 12px;"></i>
                    <p style="color: #fff; margin-bottom: 16px;">Great! ARCropolis is working correctly.</p>
                    <p style="color: rgba(255,255,255,0.7); font-size: 13px;">Now let's configure where you want to store mods on your PC. You'll be able to use FTP via the <strong style="color: #fff;">Send To Switch</strong> button in the Downloads section.</p>
                </div>
            `;
          if (nextBtn) {
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        });

        verifyNoBtn?.addEventListener('click', () => {
          const statusDiv = document.querySelector<HTMLElement>(
            '#verification-status',
          );
          statusDiv!.innerHTML = `
                <div style="background: rgba(255, 77, 77, 0.1); border: 1px solid rgba(255, 77, 77, 0.3); border-radius: 12px; padding: 16px; text-align: center;">
                    <i class="bi bi-exclamation-triangle-fill" style="color: #ff4d4d; font-size: 32px; margin-bottom: 12px;"></i>
                    <p style="color: #fff; margin-bottom: 16px;">ARCropolis is not working.</p>
                    <p style="color: rgba(255,255,255,0.7); font-size: 13px; margin-bottom: 12px;">Please join the <a href="https://discord.gg/2zT5Rg46bG" target="_blank">FightPlanner Discord</a> to get help with installation.</p>
                    <p style="color: rgba(255,255,255,0.5); font-size: 12px; margin-bottom: 16px;">You can continue the tutorial, but mods may not work until ARCropolis is properly installed.</p>
                    <button id="change-answer-btn" style="padding: 10px 20px; background: rgba(122, 155, 255, 0.2); color: #7a9bff; border: 2px solid rgba(122, 155, 255, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                        Change my answer
                    </button>
                </div>
            `;
          setupDiscordLinks(statusDiv!);
          const changeAnswerBtn =
            document.querySelector<HTMLElement>('#change-answer-btn');
          changeAnswerBtn?.addEventListener('click', async () => {
            // Go back to the installation step
            currentStep = steps.findIndex((s) => s.title === 'Installing Skyline & ARCropolis (Switch)');
            await renderProgressDots();
            renderStep(currentStep);
          });
          if (nextBtn) {
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        });
      },
    },
    {
      icon: 'bi-laptop',
      title: 'Emulator Selection',
      description: 'Choose your emulator',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Which Emulator?</h3>
    <p style="margin-bottom: 32px; color: rgba(255,255,255,0.7);">Select the emulator you're using.</p>
    
    <div style="display: flex; gap: 16px; max-width: 500px; margin: 0 auto;">
        <button id="yuzu-btn" style="flex: 1; padding: 20px; background: rgba(122, 155, 255, 0.1); border: 2px solid rgba(122, 155, 255, 0.3); border-radius: 12px; cursor: pointer; transition: all 0.2s;">
            <i class="bi bi-controller" style="font-size: 32px; color: #7a9bff; display: block; margin-bottom: 8px;"></i>
            <strong style="color: #fff; display: block;">Yuzu</strong>
            <span style="color: rgba(255,255,255,0.6); font-size: 12px;">(or forks)</span>
        </button>
        <button id="ryujinx-btn" style="flex: 1; padding: 20px; background: rgba(122, 155, 255, 0.1); border: 2px solid rgba(122, 155, 255, 0.3); border-radius: 12px; cursor: pointer; transition: all 0.2s;">
            <i class="bi bi-controller" style="font-size: 32px; color: #7a9bff; display: block; margin-bottom: 8px;"></i>
            <strong style="color: #fff; display: block;">Ryujinx</strong>
            <span style="color: rgba(255,255,255,0.6); font-size: 12px;">(or forks)</span>
        </button>
    </div>
</div>
`,
      onRender: async () => {

        const nextBtn = document.querySelector<HTMLElement>('#next-btn');
        const yuzuBtn = document.querySelector<HTMLElement>('#yuzu-btn');
        const ryujinxBtn = document.querySelector<HTMLElement>('#ryujinx-btn');

        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
        }

        yuzuBtn!.addEventListener('click', async () => {
          await window.tutorialAPI.store.set('tutorial.emulatorType', 'yuzu');
          yuzuBtn!.style.background = 'rgba(76, 175, 80, 0.2)';
          yuzuBtn!.style.borderColor = 'rgba(76, 175, 80, 0.5)';
          ryujinxBtn!.style.background = 'rgba(122, 155, 255, 0.1)';
          ryujinxBtn!.style.borderColor = 'rgba(122, 155, 255, 0.3)';
          // Update dots to show new steps
          await renderProgressDots();
          if (nextBtn) {
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        });

        ryujinxBtn!.addEventListener('click', async () => {
          await window.tutorialAPI.store.set('tutorial.emulatorType', 'ryujinx');
          ryujinxBtn!.style.background = 'rgba(76, 175, 80, 0.2)';
          ryujinxBtn!.style.borderColor = 'rgba(76, 175, 80, 0.5)';
          yuzuBtn!.style.background = 'rgba(122, 155, 255, 0.1)';
          yuzuBtn!.style.borderColor = 'rgba(122, 155, 255, 0.3)';
          // Update dots to show new steps
          await renderProgressDots();
          if (nextBtn) {
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        });

        // Load saved selection
        const emulatorType = await window.tutorialAPI?.store.get(
          'tutorial.emulatorType',
        );
        if (emulatorType === 'yuzu') {
          yuzuBtn!.click();
        } else if (emulatorType === 'ryujinx') {
          ryujinxBtn!.click();
        }
      },
    },
    {
      icon: 'bi-folder',
      title: 'Yuzu Setup',
      description: 'Configure Yuzu paths and install ARCropolis',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Yuzu Directory</h3>
    <p style="margin-bottom: 32px; color: rgba(255,255,255,0.7);">We'll detect your Yuzu folder automatically, or you can select it manually.</p>
    
    <div id="yuzu-status" style="display: flex; flex-direction: column; gap: 16px; text-align: left; max-width: 500px; margin: 0 auto;">
        <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="color: #fff;">Detecting Yuzu path...</span>
                <div style="width: 20px; height: 20px; border: 2px solid rgba(122, 155, 255, 0.3); border-top-color: #7a9bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
        </div>
    </div>
</div>
`,
      onRender: async () => {

        const statusDiv = document.querySelector<HTMLElement>('#yuzu-status');
        const nextBtn = document.querySelector<HTMLElement>('#next-btn');

        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
        }

        try {
          const result = await apiWrapper.detectYuzuPath();
          if (result.success && result.path) {
            await window.tutorialAPI.store.set('tutorial.yuzuPath', result.path);
            statusDiv!.innerHTML = `
                    <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                <div>
                                    <strong style="color: #fff; display: block;">Yuzu Found</strong>
                                    <span style="color: rgba(255,255,255,0.6); font-size: 13px; font-family: monospace;">${result.path}</span>
                                </div>
                            </div>
                            <button id="wrong-yuzu-path-btn" style="padding: 6px 12px; background: rgba(255, 193, 7, 0.1); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s;">
                                Wrong path?
                            </button>
                        </div>
                    </div>
                `;

            document
              .querySelector<HTMLElement>('#wrong-yuzu-path-btn')
              ?.addEventListener('click', async () => {
                const path = await window.tutorialAPI.selectFolder();
                if (path) {
                  await window.tutorialAPI.store.set('tutorial.yuzuPath', path);
                  statusDiv!.innerHTML = `
                            <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                <div style="display: flex; align-items: center; justify-content: space-between;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                        <div>
                                            <strong style="color: #fff; display: block;">Selected: ${path}</strong>
                                        </div>
                                    </div>
                                    <button id="wrong-yuzu-path-btn-2" style="padding: 6px 12px; background: rgba(255, 193, 7, 0.1); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">
                                        Wrong path?
                                    </button>
                                </div>
                            </div>
                        `;
                  document
                    .querySelector<HTMLElement>('#wrong-yuzu-path-btn-2')
                    ?.addEventListener('click', async () => {
                      const path2 = await window.tutorialAPI.selectFolder();
                      if (path2) {
                        await window.tutorialAPI.store.set(
                          'tutorial.yuzuPath',
                          path2,
                        );
                        statusDiv!.innerHTML = `
                                    <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                        <div style="display: flex; align-items: center; gap: 12px;">
                                            <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                            <div>
                                                <strong style="color: #fff; display: block;">Selected: ${path2}</strong>
                                            </div>
                                        </div>
                                    </div>
                                `;
                      }
                    });
                }
              });

            if (nextBtn) {
              nextBtn.style.opacity = '1';
              nextBtn.style.pointerEvents = 'auto';
            }
          } else {
            statusDiv!.innerHTML = `
                    <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 12px; padding: 16px;">
                        <p style="color: #ffc107; margin-bottom: 16px;">Yuzu path not detected automatically.</p>
                        <p style="color: rgba(255,255,255,0.7); font-size: 13px; margin-bottom: 16px;">Please open Yuzu, go to <strong style="color: #fff;">File > Open yuzu folder</strong>, then copy the path and select it below.</p>
                        <button id="select-yuzu-btn" style="padding: 10px 20px; background: rgba(122, 155, 255, 0.2); color: #7a9bff; border: 1px solid rgba(122, 155, 255, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600; width: 100%;">
                            Select Yuzu Folder
                        </button>
                    </div>
                `;
            document
              .querySelector<HTMLElement>('#select-yuzu-btn')
              ?.addEventListener('click', async () => {
                const path = await window.tutorialAPI.selectFolder();
                if (path) {
                  await window.tutorialAPI.store.set('tutorial.yuzuPath', path);
                  statusDiv!.innerHTML = `
                            <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                    <div>
                                        <strong style="color: #fff; display: block;">Selected: ${path}</strong>
                                    </div>
                                </div>
                            </div>
                        `;
                  if (nextBtn) {
                    nextBtn.style.opacity = '1';
                    nextBtn.style.pointerEvents = 'auto';
                  }
                }
              });
          }
        } catch (error) {
          console.error('Error detecting Yuzu:', error);
          statusDiv!.innerHTML =
            '<div style="color: #ff4d4d;">Error detecting Yuzu. Please select manually.</div>';
        }
      },
    },
    {
      icon: 'bi-download',
      title: 'Installing Skyline & ARCropolis (Yuzu)',
      description:
        'Downloading and installing Skyline (exefs) and ARCropolis (romfs) for Yuzu',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Installing ARCropolis</h3>
    <div id="yuzu-install-status" style="display: flex; flex-direction: column; gap: 16px; text-align: left; max-width: 500px; margin: 0 auto;">
        <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
            <div style="color: #fff;">Preparing installation...</div>
        </div>
    </div>
</div>
`,
      onRender: async () => {

        const statusDiv = document.querySelector<HTMLElement>(
          '#yuzu-install-status',
        );
        const nextBtn = document.querySelector<HTMLElement>('#next-btn');

        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
        }

        try {
          const yuzuPath = (await apiWrapper.storeGet(
            'tutorial.yuzuPath',
          )) as string | null;

          if (!yuzuPath) {
            statusDiv!.innerHTML =
              '<div style="color: #ff4d4d;">Error: Yuzu path not found. Please go back and select your Yuzu folder.</div>';
            return;
          }

          // Get latest releases (Skyline for exefs, ARCropolis for romfs)
          statusDiv!.innerHTML =
            '<div style="color: #fff;">Fetching latest releases...</div>';
          const skylineRelease = await window.tutorialAPI.getSkylineRelease();
          if (!skylineRelease.success)
            throw new Error('Failed to get Skyline release');
          const arcropolisRelease = await window.tutorialAPI.getGithubRelease();
          if (!arcropolisRelease.success)
            throw new Error('Failed to get ARCropolis release');

          // Download Skyline
          statusDiv!.innerHTML =
            '<div style="color: #fff;">Downloading Skyline (exefs)...</div>';
          const tempDirResult = await window.tutorialAPI.getTempDir();
          if (!tempDirResult.success)
            throw new Error('Failed to get temp directory');
          const skylineTempPathResult = await window.tutorialAPI.joinPath(
            tempDirResult.path,
            `skyline-${Date.now()}.zip`,
          );
          if (!skylineTempPathResult.success)
            throw new Error('Failed to construct temp path');
          const skylineTempPath = skylineTempPathResult.path;
          const skylineDownloadResult =
            await window.tutorialAPI.downloadArcropolis(
              skylineRelease.downloadUrl,
              skylineTempPath,
            );
          if (!skylineDownloadResult.success)
            throw new Error('Skyline download failed');

          // Download ARCropolis
          statusDiv!.innerHTML =
            '<div style="color: #fff;">Downloading ARCropolis (romfs)...</div>';
          const arcropolisTempPathResult = await window.tutorialAPI.joinPath(
            tempDirResult.path,
            `arcropolis-${Date.now()}.zip`,
          );
          if (!arcropolisTempPathResult.success)
            throw new Error('Failed to construct temp path');
          const arcropolisTempPath = arcropolisTempPathResult.path;
          const arcropolisDownloadResult =
            await window.tutorialAPI.downloadArcropolis(
              arcropolisRelease.downloadUrl,
              arcropolisTempPath,
            );
          if (!arcropolisDownloadResult.success)
            throw new Error('ARCropolis download failed');

          // Create directories
          const ultimateModsPathResult = await window.tutorialAPI.joinPath(
            yuzuPath,
            'sdmc',
            'ultimate',
            'mods',
          );
          if (!ultimateModsPathResult.success)
            throw new Error('Failed to construct mods path');
          await window.tutorialAPI.createDirectory(ultimateModsPathResult.path);

          // Extract Skyline (exefs) to sdmc/atmosphere/contents directory
          statusDiv!.innerHTML =
            '<div style="color: #fff;">Installing Skyline (exefs)...</div>';
          const atmospherePathResult = await window.tutorialAPI.joinPath(
            yuzuPath,
            'sdmc',
            'atmosphere',
            'contents',
            '01006A800016E000',
          );
          if (!atmospherePathResult.success)
            throw new Error('Failed to construct atmosphere path');
          const atmospherePath = atmospherePathResult.path;
          await window.tutorialAPI.createDirectory(atmospherePath);
          const skylineExtractResult = await window.tutorialAPI.extractSkyline(
            skylineDownloadResult.path,
            atmospherePath,
          );
          if (!skylineExtractResult.success)
            throw new Error('Skyline extraction failed');

          // Extract ARCropolis (romfs)
          statusDiv!.innerHTML =
            '<div style="color: #fff;">Installing ARCropolis (romfs)...</div>';
          const arcropolisExtractResult =
            await window.tutorialAPI.extractArcropolis(
              arcropolisDownloadResult.path,
              atmospherePath,
            );
          if (!arcropolisExtractResult.success)
            throw new Error('ARCropolis extraction failed');

          statusDiv!.innerHTML = `
                <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                        <div>
                            <strong style="color: #fff; display: block;">Installation complete!</strong>
                            <span style="color: rgba(255,255,255,0.6); font-size: 13px;">Skyline ${skylineRelease.version} (exefs) + ARCropolis ${arcropolisRelease.version} (romfs)</span>
                        </div>
                    </div>
                </div>
            `;

          if (nextBtn) {
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        } catch (error) {
          console.error('Installation error:', error);
          statusDiv!.innerHTML = `
                <div style="background: rgba(255, 77, 77, 0.1); border: 1px solid rgba(255, 77, 77, 0.3); border-radius: 12px; padding: 16px;">
                    <div style="color: #ff4d4d; margin-bottom: 12px;">
                        <strong>Installation failed:</strong> ${error.message}
                    </div>
                    <p style="color: rgba(255,255,255,0.7); font-size: 13px;">
                        Please join the <a href="https://discord.gg/2zT5Rg46bG" target="_blank">FightPlanner Discord</a> for assistance.
                    </p>
                </div>
            `;
          setupDiscordLinks(statusDiv!);
        }
      },
    },
    {
      icon: 'bi-controller',
      title: 'Verify ARCropolis (Yuzu)',
      description: 'Launch the game and verify installation',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Verify Installation</h3>
    <p style="margin-bottom: 24px; color: rgba(255,255,255,0.7);">Please launch Smash Ultimate in Yuzu and check if ARCropolis is working.</p>
    
    <div style="position: relative; width: 100%; max-width: 600px; margin: 0 auto 24px;">
        <div id="arcropolis-lottie-yuzu" style="width: 100%; height: 200px; display: flex; align-items: center; justify-content: center;"></div>
        <div class="scroll-indicator" style="position: absolute; bottom: 10%; right: -20px; animation: bounce-side 2s infinite; pointer-events: none; background: rgba(20, 20, 20, 0.6); border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10;">
            <i class="bi bi-chevron-down" style="color: #7a9bff; font-size: 20px;"></i>
        </div>
        <style>
            @keyframes bounce-side {
                0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                40% { transform: translateY(10px); }
                60% { transform: translateY(5px); }
            }
        </style>
    </div>
    
    <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 12px; padding: 20px; max-width: 500px; margin: 0 auto; text-align: left;">
        <p style="color: #ffc107; margin-bottom: 16px; font-weight: 600;">
            <i class="bi bi-info-circle-fill"></i> What to look for:
        </p>
        <ul style="color: rgba(255,255,255,0.8); margin-left: 20px; line-height: 1.8;">
            <li>Launch Super Smash Bros. Ultimate in Yuzu</li>
            <li>Look for <strong style="color: #fff;">ARCropolis version text</strong> in the <strong style="color: #fff;">top-right corner</strong></li>
            <li>If you see it, ARCropolis is working!</li>
        </ul>
    </div>
    
    
    
    <div id="yuzu-verification-status" style="margin-top: 24px; display: flex; flex-direction: column; gap: 12px; max-width: 500px; margin-left: auto; margin-right: auto;">
        <p style="color: rgba(255,255,255,0.7);">Did you see the ARCropolis text?</p>
        <div style="display: flex; gap: 12px;">
            <button id="yuzu-verify-yes-btn" style="flex: 1; padding: 12px; background: rgba(76, 175, 80, 0.2); color: #4caf50; border: 2px solid rgba(76, 175, 80, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600;">
                Yes, it's working!
            </button>
            <button id="yuzu-verify-no-btn" style="flex: 1; padding: 12px; background: rgba(255, 77, 77, 0.2); color: #ff4d4d; border: 2px solid rgba(255, 77, 77, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600;">
                No, not working
            </button>
        </div>
    </div>
</div>
`,
      onRender: async () => {

        const nextBtn = document.querySelector<HTMLElement>('#next-btn');
        const verifyYesBtn = document.querySelector<HTMLElement>(
          '#yuzu-verify-yes-btn',
        );
        const verifyNoBtn = document.querySelector<HTMLElement>(
          '#yuzu-verify-no-btn',
        );
        const lottieContainer = document.querySelector<HTMLElement>(
          '#arcropolis-lottie-yuzu',
        );

        // Load Lottie animation for PC (Yuzu)
        if (lottieContainer && window.lottie) {
          try {
            const anim = window.lottie.loadAnimation({
              container: lottieContainer,
              renderer: 'svg',
              loop: true,
              autoplay: true,
              path: '../images/tutorial-arcropolisPC.json',
            });
          } catch (e) {
            console.error('Failed to load Lottie animation:', e);
          }
        }

        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
        }

        verifyYesBtn?.addEventListener('click', async () => {
          await window.tutorialAPI.store.set('tutorial.arcropolisVerified', true);

          // Check for arcropolis folder
          const yuzuPath = (await apiWrapper.storeGet(
            'tutorial.yuzuPath',
          )) as string;

          const ultimatePathResult = await window.tutorialAPI.joinPath(
            yuzuPath,
            'sdmc',
            'ultimate',
          );

          if (!ultimatePathResult.success)
            throw new Error('Failed to construct ultimate path');

          const ultimatePath = ultimatePathResult.path;
          const arcropolisExists =
            await window.tutorialAPI.checkArcropolisFolder(ultimatePath);

          if (!arcropolisExists) {
            const statusDiv = document.querySelector<HTMLElement>(
              '#yuzu-verification-status',
            );
            statusDiv!.innerHTML = `
                    <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 12px; padding: 16px; text-align: center;">
                        <p style="color: #ffc107; margin-bottom: 12px;">ARCropolis folder not found. Please close the game and restart it to create the folder.</p>
                    </div>
                `;
            return;
          }

          // Auto-configure paths
          const modsPathResult = await window.tutorialAPI.joinPath(
            yuzuPath,
            'sdmc',
            'ultimate',
            'mods',
          );
          if (!modsPathResult.success)
            throw new Error('Failed to construct mods path');
          const pluginsPathResult = await window.tutorialAPI.joinPath(
            yuzuPath,
            'sdmc',
            'atmosphere',
            'contents',
            '01006A800016E000',
            'romfs',
            'skyline',
            'plugins',
          );
          if (!pluginsPathResult.success)
            throw new Error('Failed to construct plugins path');
          await window.tutorialAPI.store.set('modsPath', modsPathResult.path);
          await window.tutorialAPI.store.set(
            'pluginsPath',
            pluginsPathResult.path,
          );

          const statusDiv = document.querySelector<HTMLElement>(
            '#yuzu-verification-status',
          );
          statusDiv!.innerHTML = `
                <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px; text-align: center;">
                    <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 32px; margin-bottom: 12px;"></i>
                    <p style="color: #fff; margin-bottom: 16px;">Perfect! ARCropolis is working and paths are configured.</p>
                    <p style="color: rgba(255,255,255,0.7); font-size: 13px;">Please <strong style="color: #fff;">close the game</strong> before continuing.</p>
                </div>
            `;
          if (nextBtn) {
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        });

        verifyNoBtn?.addEventListener('click', () => {
          const statusDiv = document.querySelector<HTMLElement>(
            '#yuzu-verification-status',
          );
          statusDiv!.innerHTML = `
                <div style="background: rgba(255, 77, 77, 0.1); border: 1px solid rgba(255, 77, 77, 0.3); border-radius: 12px; padding: 16px; text-align: center;">
                    <i class="bi bi-exclamation-triangle-fill" style="color: #ff4d4d; font-size: 32px; margin-bottom: 12px;"></i>
                    <p style="color: #fff; margin-bottom: 16px;">ARCropolis is not working.</p>
                    <p style="color: rgba(255,255,255,0.7); font-size: 13px; margin-bottom: 16px;">Please join the <a href="https://discord.gg/2zT5Rg46bG" target="_blank" style="color: #7a9bff; text-decoration: none; font-weight: 600; border-bottom: 1px solid rgba(122, 155, 255, 0.3); transition: all 0.2s;">FightPlanner Discord</a> for assistance.</p>
                    <button id="change-answer-yuzu-btn" style="padding: 10px 20px; background: rgba(122, 155, 255, 0.2); color: #7a9bff; border: 2px solid rgba(122, 155, 255, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                        Change my answer
                    </button>
                </div>
            `;
          setupDiscordLinks(statusDiv!);
          const changeAnswerBtn = document.querySelector<HTMLElement>(
            '#change-answer-yuzu-btn',
          );
          changeAnswerBtn?.addEventListener('click', async () => {
            // Go back to the installation step
            currentStep = steps.findIndex((s) => s.title === 'Installing Skyline & ARCropolis (Yuzu)');
            await renderProgressDots();
            renderStep(currentStep);
          });
          if (nextBtn) {
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        });
      },
    },
    {
      icon: 'bi-folder',
      title: 'Ryujinx Setup',
      description: 'Configure Ryujinx paths and install ARCropolis',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Ryujinx Directory</h3>
    <p style="margin-bottom: 32px; color: rgba(255,255,255,0.7);">We'll detect your Ryujinx folder automatically, or you can select it manually.</p>
    
    <div id="ryujinx-status" style="display: flex; flex-direction: column; gap: 16px; text-align: left; max-width: 500px; margin: 0 auto;">
        <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="color: #fff;">Detecting Ryujinx path...</span>
                <div style="width: 20px; height: 20px; border: 2px solid rgba(122, 155, 255, 0.3); border-top-color: #7a9bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
        </div>
    </div>
</div>
`,
      onRender: async () => {

        const statusDiv = document.querySelector<HTMLElement>('#ryujinx-status');
        const nextBtn = document.querySelector<HTMLElement>('#next-btn');

        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
        }

        try {
          const result = await apiWrapper.detectRyujinxPath();
          if (result.success && result.path) {
            await window.tutorialAPI.store.set(
              'tutorial.ryujinxPath',
              result.path,
            );
            statusDiv!.innerHTML = `
                    <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                <div>
                                    <strong style="color: #fff; display: block;">Ryujinx Found</strong>
                                    <span style="color: rgba(255,255,255,0.6); font-size: 13px; font-family: monospace;">${result.path}</span>
                                </div>
                            </div>
                            <button id="wrong-ryujinx-path-btn" style="padding: 6px 12px; background: rgba(255, 193, 7, 0.1); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s;">
                                Wrong path?
                            </button>
                        </div>
                    </div>
                `;

            document
              .querySelector<HTMLElement>('#wrong-ryujinx-path-btn')
              ?.addEventListener('click', async () => {
                const path = await window.tutorialAPI.selectFolder();
                if (path) {
                  await window.tutorialAPI.store.set(
                    'tutorial.ryujinxPath',
                    path,
                  );
                  statusDiv!.innerHTML = `
                            <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                <div style="display: flex; align-items: center; justify-content: space-between;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                        <div>
                                            <strong style="color: #fff; display: block;">Selected: ${path}</strong>
                                        </div>
                                    </div>
                                    <button id="wrong-ryujinx-path-btn-2" style="padding: 6px 12px; background: rgba(255, 193, 7, 0.1); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">
                                        Wrong path?
                                    </button>
                                </div>
                            </div>
                        `;
                  document
                    .querySelector<HTMLElement>('#wrong-ryujinx-path-btn-2')
                    ?.addEventListener('click', async () => {
                      const path2 = await window.tutorialAPI.selectFolder();
                      if (path2) {
                        await window.tutorialAPI.store.set(
                          'tutorial.ryujinxPath',
                          path2,
                        );
                        statusDiv!.innerHTML = `
                                    <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                        <div style="display: flex; align-items: center; gap: 12px;">
                                            <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                            <div>
                                                <strong style="color: #fff; display: block;">Selected: ${path2}</strong>
                                            </div>
                                        </div>
                                    </div>
                                `;
                      }
                    });
                }
              });

            if (nextBtn) {
              nextBtn.style.opacity = '1';
              nextBtn.style.pointerEvents = 'auto';
            }
          } else {
            statusDiv!.innerHTML = `
                    <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 12px; padding: 16px;">
                        <p style="color: #ffc107; margin-bottom: 16px;">Ryujinx path not detected automatically.</p>
                        <p style="color: rgba(255,255,255,0.7); font-size: 13px; margin-bottom: 16px;">Please open Ryujinx, go to <strong style="color: #fff;">File > Open Ryujinx folder</strong>, then copy the path and select it below.</p>
                        <button id="select-ryujinx-btn" style="padding: 10px 20px; background: rgba(122, 155, 255, 0.2); color: #7a9bff; border: 1px solid rgba(122, 155, 255, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600; width: 100%;">
                            Select Ryujinx Folder
                        </button>
                    </div>
                `;
            document
              .querySelector<HTMLElement>('#select-ryujinx-btn')
              ?.addEventListener('click', async () => {
                const path = await window.tutorialAPI.selectFolder();
                if (path) {
                  await window.tutorialAPI.store.set(
                    'tutorial.ryujinxPath',
                    path,
                  );
                  statusDiv!.innerHTML = `
                            <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                                    <div>
                                        <strong style="color: #fff; display: block;">Selected: ${path}</strong>
                                    </div>
                                </div>
                            </div>
                        `;
                  if (nextBtn) {
                    nextBtn.style.opacity = '1';
                    nextBtn.style.pointerEvents = 'auto';
                  }
                }
              });
          }
        } catch (error) {
          console.error('Error detecting Ryujinx:', error);
          statusDiv!.innerHTML =
            '<div style="color: #ff4d4d;">Error detecting Ryujinx. Please select manually.</div>';
        }
      },
    },
    {
      icon: 'bi-download',
      title: 'Installing Skyline & ARCropolis (Ryujinx)',
      description:
        'Downloading and installing Skyline (exefs) and ARCropolis (romfs) for Ryujinx',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Installing ARCropolis</h3>
    <div id="ryujinx-install-status" style="display: flex; flex-direction: column; gap: 16px; text-align: left; max-width: 500px; margin: 0 auto;">
        <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
            <div style="color: #fff;">Preparing installation...</div>
        </div>
    </div>
</div>
`,
      onRender: async () => {

        const statusDiv = document.querySelector<HTMLElement>(
          '#ryujinx-install-status',
        );
        const nextBtn = document.querySelector<HTMLElement>('#next-btn');

        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
        }

        try {
          const ryujinxPath = (await apiWrapper.storeGet(
            'tutorial.ryujinxPath',
          )) as string | null;

          if (!ryujinxPath) {
            statusDiv!.innerHTML =
              '<div style="color: #ff4d4d;">Error: Ryujinx path not found. Please go back and select your Ryujinx folder.</div>';
            return;
          }

          // Get latest releases (Skyline for exefs, ARCropolis for romfs)
          statusDiv!.innerHTML =
            '<div style="color: #fff;">Fetching latest releases...</div>';

          const skylineRelease = await window.tutorialAPI.getSkylineRelease();

          if (!skylineRelease.success)
            throw new Error('Failed to get Skyline release');

          const arcropolisRelease = await window.tutorialAPI.getGithubRelease();
          if (!arcropolisRelease.success)
            throw new Error('Failed to get ARCropolis release');

          // Download Skyline
          statusDiv!.innerHTML =
            '<div style="color: #fff;">Downloading Skyline (exefs)...</div>';

          const tempDirResult = await window.tutorialAPI.getTempDir();
          if (!tempDirResult.success)
            throw new Error('Failed to get temp directory');

          const skylineTempPathResult = await window.tutorialAPI.joinPath(
            tempDirResult.path!,
            `skyline-${Date.now()}.zip`,
          );

          if (!skylineTempPathResult.success)
            throw new Error('Failed to construct temp path');

          const skylineTempPath = skylineTempPathResult.path;

          const skylineDownloadResult =
            await window.tutorialAPI.downloadArcropolis(
              skylineRelease.downloadUrl!,
              skylineTempPath!,
            );
          if (!skylineDownloadResult.success)
            throw new Error('Skyline download failed');

          // Download ARCropolis
          statusDiv!.innerHTML =
            '<div style="color: #fff;">Downloading ARCropolis (romfs)...</div>';
          const arcropolisTempPathResult = await window.tutorialAPI.joinPath(
            tempDirResult.path,
            `arcropolis-${Date.now()}.zip`,
          );
          if (!arcropolisTempPathResult.success)
            throw new Error('Failed to construct temp path');
          const arcropolisTempPath = arcropolisTempPathResult.path;

          const arcropolisDownloadResult =
            await window.tutorialAPI.downloadArcropolis(
              arcropolisRelease.downloadUrl,
              arcropolisTempPath,
            );

          if (!arcropolisDownloadResult.success)
            throw new Error('ARCropolis download failed');

          // Create directories and extract
          statusDiv!.innerHTML =
            '<div style="color: #fff;">Installing Skyline (exefs)...</div>';
          const contentsPathResult = await window.tutorialAPI.joinPath(
            ryujinxPath,
            'sdcard',
            'atmosphere',
            'contents',
            '01006A800016E000',
          );
          if (!contentsPathResult.success)
            throw new Error('Failed to construct contents path');
          const contentsPath = contentsPathResult.path;
          await window.tutorialAPI.createDirectory(contentsPath);

          // Extract Skyline (exefs)
          const skylineExtractResult = await window.tutorialAPI.extractSkyline(
            skylineDownloadResult.path,
            contentsPath,
          );
          if (!skylineExtractResult.success)
            throw new Error('Skyline extraction failed');

          // Extract ARCropolis (romfs)
          statusDiv!.innerHTML =
            '<div style="color: #fff;">Installing ARCropolis (romfs)...</div>';
          const arcropolisExtractResult =
            await window.tutorialAPI.extractArcropolis(
              arcropolisDownloadResult.path,
              contentsPath,
            );
          if (!arcropolisExtractResult.success)
            throw new Error('ARCropolis extraction failed');

          // Create plugin directories
          const pluginsPathResult = await window.tutorialAPI.joinPath(
            contentsPath,
            'romfs',
            'skyline',
            'plugins',
          );
          if (!pluginsPathResult.success)
            throw new Error('Failed to construct plugins path');
          await window.tutorialAPI.createDirectory(pluginsPathResult.path);

          statusDiv!.innerHTML = `
                <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 24px;"></i>
                        <div>
                            <strong style="color: #fff; display: block;">Installation complete!</strong>
                            <span style="color: rgba(255,255,255,0.6); font-size: 13px;">Skyline ${skylineRelease.version} (exefs) + ARCropolis ${arcropolisRelease.version} (romfs)</span>
                        </div>
                    </div>
                </div>
            `;

          if (nextBtn) {
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        } catch (error) {
          console.error('Installation error:', error);
          statusDiv!.innerHTML = `
                <div style="background: rgba(255, 77, 77, 0.1); border: 1px solid rgba(255, 77, 77, 0.3); border-radius: 12px; padding: 16px;">
                    <div style="color: #ff4d4d; margin-bottom: 12px;">
                        <strong>Installation failed:</strong> ${error.message}
                    </div>
                    <p style="color: rgba(255,255,255,0.7); font-size: 13px;">
                        Please join the <a href="https://discord.gg/2zT5Rg46bG" target="_blank">FightPlanner Discord</a> for assistance.
                    </p>
                </div>
            `;
          setupDiscordLinks(statusDiv!);
        }
      },
    },
    {
      icon: 'bi-controller',
      title: 'Verify ARCropolis (Ryujinx)',
      description: 'Launch the game and verify installation',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Verify Installation</h3>
    <p style="margin-bottom: 24px; color: rgba(255,255,255,0.7);">Please launch Smash Ultimate in Ryujinx and check if ARCropolis is working.</p>
    
    <div style="position: relative; width: 100%; max-width: 600px; margin: 0 auto 24px;">
        <div id="arcropolis-lottie-ryujinx" style="width: 100%; height: 200px; display: flex; align-items: center; justify-content: center;"></div>
        <div class="scroll-indicator" style="position: absolute; bottom: 10%; right: -20px; animation: bounce-side 2s infinite; pointer-events: none; background: rgba(20, 20, 20, 0.6); border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10;">
            <i class="bi bi-chevron-down" style="color: #7a9bff; font-size: 20px;"></i>
        </div>
        <style>
            @keyframes bounce-side {
                0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                40% { transform: translateY(10px); }
                60% { transform: translateY(5px); }
            }
        </style>
    </div>
    
    <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 12px; padding: 20px; max-width: 500px; margin: 0 auto; text-align: left;">
        <p style="color: #ffc107; margin-bottom: 16px; font-weight: 600;">
            <i class="bi bi-info-circle-fill"></i> What to look for:
        </p>
        <ul style="color: rgba(255,255,255,0.8); margin-left: 20px; line-height: 1.8;">
            <li>Launch Super Smash Bros. Ultimate in Ryujinx</li>
            <li>Look for <strong style="color: #fff;">ARCropolis version text</strong> in the <strong style="color: #fff;">top-right corner</strong></li>
            <li>If you see it, ARCropolis is working!</li>
        </ul>
    </div>
    
    
    
    <div id="ryujinx-verification-status" style="margin-top: 24px; display: flex; flex-direction: column; gap: 12px; max-width: 500px; margin-left: auto; margin-right: auto;">
        <p style="color: rgba(255,255,255,0.7);">Did you see the ARCropolis text?</p>
        <div style="display: flex; gap: 12px;">
            <button id="ryujinx-verify-yes-btn" style="flex: 1; padding: 12px; background: rgba(76, 175, 80, 0.2); color: #4caf50; border: 2px solid rgba(76, 175, 80, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600;">
                Yes, it's working!
            </button>
            <button id="ryujinx-verify-no-btn" style="flex: 1; padding: 12px; background: rgba(255, 77, 77, 0.2); color: #ff4d4d; border: 2px solid rgba(255, 77, 77, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600;">
                No, not working
            </button>
        </div>
    </div>
</div>
`,
      onRender: async () => {

        const nextBtn = document.querySelector<HTMLElement>('#next-btn');
        const verifyYesBtn = document.querySelector<HTMLElement>(
          '#ryujinx-verify-yes-btn',
        );
        const verifyNoBtn = document.querySelector<HTMLElement>(
          '#ryujinx-verify-no-btn',
        );
        const lottieContainer = document.querySelector<HTMLElement>(
          '#arcropolis-lottie-ryujinx',
        );

        // Load Lottie animation for PC (Ryujinx)
        if (lottieContainer && window.lottie) {
          try {
            const anim = window.lottie.loadAnimation({
              container: lottieContainer,
              renderer: 'svg',
              loop: true,
              autoplay: true,
              path: '../images/tutorial-arcropolisPC.json',
            });
          } catch (e) {
            console.error('Failed to load Lottie animation:', e);
          }
        }

        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
        }

        verifyYesBtn?.addEventListener('click', async () => {
          await window.tutorialAPI.store.set('tutorial.arcropolisVerified', true);

          // Auto-configure paths
          const ryujinxPath = (await apiWrapper.storeGet(
            'tutorial.ryujinxPath',
          )) as string;

          const modsPathResult = await window.tutorialAPI.joinPath(
            ryujinxPath,
            'sdcard',
            'ultimate',
            'mods',
          );

          if (!modsPathResult.success)
            throw new Error('Failed to construct mods path');

          const pluginsPathResult = await window.tutorialAPI.joinPath(
            ryujinxPath,
            'sdcard',
            'atmosphere',
            'contents',
            '01006A800016E000',
            'romfs',
            'skyline',
            'plugins',
          );
          if (!pluginsPathResult.success)
            throw new Error('Failed to construct plugins path');
          await window.tutorialAPI.store.set('modsPath', modsPathResult.path);
          await window.tutorialAPI.store.set(
            'pluginsPath',
            pluginsPathResult.path,
          );

          const statusDiv = document.querySelector<HTMLElement>(
            '#ryujinx-verification-status',
          );
          statusDiv!.innerHTML = `
                <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); border-radius: 12px; padding: 16px; text-align: center;">
                    <i class="bi bi-check-circle-fill" style="color: #4caf50; font-size: 32px; margin-bottom: 12px;"></i>
                    <p style="color: #fff; margin-bottom: 16px;">Perfect! ARCropolis is working and paths are configured.</p>
                    <p style="color: rgba(255,255,255,0.7); font-size: 13px;">Please <strong style="color: #fff;">close the game</strong> before continuing.</p>
                </div>
            `;
          if (nextBtn) {
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        });

        verifyNoBtn?.addEventListener('click', () => {
          const statusDiv = document.querySelector<HTMLElement>(
            '#ryujinx-verification-status',
          );
          statusDiv!.innerHTML = `
                <div style="background: rgba(255, 77, 77, 0.1); border: 1px solid rgba(255, 77, 77, 0.3); border-radius: 12px; padding: 16px; text-align: center;">
                    <i class="bi bi-exclamation-triangle-fill" style="color: #ff4d4d; font-size: 32px; margin-bottom: 12px;"></i>
                    <p style="color: #fff; margin-bottom: 16px;">ARCropolis is not working.</p>
                    <p style="color: rgba(255,255,255,0.7); font-size: 13px; margin-bottom: 16px;">Please join the <a href="https://discord.gg/2zT5Rg46bG" target="_blank" style="color: #7a9bff; text-decoration: none; font-weight: 600; border-bottom: 1px solid rgba(122, 155, 255, 0.3); transition: all 0.2s;">FightPlanner Discord</a> for assistance.</p>
                    <button id="change-answer-ryujinx-btn" style="padding: 10px 20px; background: rgba(122, 155, 255, 0.2); color: #7a9bff; border: 2px solid rgba(122, 155, 255, 0.3); border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                        Change my answer
                    </button>
                </div>
            `;
          setupDiscordLinks(statusDiv!);
          const changeAnswerBtn = document.querySelector<HTMLElement>(
            '#change-answer-ryujinx-btn',
          );
          changeAnswerBtn?.addEventListener('click', async () => {
            // Go back to the installation step
            currentStep = steps.findIndex((s) => s.title === 'Installing Skyline & ARCropolis (Ryujinx)');
            await renderProgressDots();
            renderStep(currentStep);
          });
          if (nextBtn) {
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        });
      },
    },
    {
      icon: 'bi-folder2-open',
      title: 'Configure Your Paths',
      description: 'Point FightPlanner to your mods folder',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Where are your mods?</h3>
    <p style="margin-bottom: 32px; color: rgba(255,255,255,0.7);" id="mods-path-description">Select the folder where you keep your Ultimate mods.</p>
    
    <div style="display: flex; flex-direction: column; gap: 16px; text-align: left;">
        <div style="background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 24px; height: 24px; background: rgba(122, 155, 255, 0.2); color: #7a9bff; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">1</div>
                    <strong style="color: #fff;">Mods Path</strong>
                </div>
                <button id="select-mods-path-btn" class="tutorial-btn-small" style="background: rgba(122, 155, 255, 0.2); color: #7a9bff; border: 1px solid rgba(122, 155, 255, 0.3); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s;">
                    Browse...
                </button>
            </div>
            <div id="mods-path-display" style="background: rgba(0, 0, 0, 0.3); padding: 10px 14px; border-radius: 8px; color: #a0a0a0; font-family: monospace; font-size: 13px; display: flex; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap;">
                <i class="bi bi-folder" style="opacity: 0.5;"></i> <span class="path-text" style="text-overflow: ellipsis; overflow: hidden;">Not configured</span>
            </div>
        </div>
    </div>
    
    <div style="margin-top: 24px; padding: 12px 16px; background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.2); border-radius: 8px; display: flex; gap: 12px; align-items: start; text-align: left;">
        <i class="bi bi-info-circle-fill" style="color: #ffc107; margin-top: 2px;"></i>
        <span style="font-size: 13px; color: rgba(255, 255, 255, 0.7);">You can change this later in Settings.</span>
    </div>
</div>
`,
      onRender: async () => {
        const btn = document.querySelector<HTMLElement>('#select-mods-path-btn');
        const display = document.querySelector<HTMLElement>(
          '#mods-path-display .path-text',
        );
        const nextBtn = document.querySelector<HTMLElement>('#next-btn');
        const description = document.querySelector<HTMLElement>(
          '#mods-path-description',
        );

        // Update description based on hardware type
        if (description && window.tutorialAPI) {
          try {
            const hardwareType = await apiWrapper.storeGet(
              'tutorial.hardwareType',
            );
            if (hardwareType === 'hardware') {
              description.innerHTML =
                "Select the folder on your PC where you want to store mods. You'll be able to use FTP via the <strong style='color: #fff;'>Send To Switch</strong> button in the Downloads section to transfer mods to your Switch.";
            } else {
              description.textContent =
                'Select the folder where you keep your Ultimate mods (e.g., yuzu/sdmc/ultimate/mods or ryujinx/sdcard/ultimate/mods).';
            }
          } catch (e) {
            console.error('Error loading hardware type:', e);
          }
        }

        // Initially disable Next button until validated
        if (nextBtn) {
          nextBtn.style.opacity = '0.5';
          nextBtn.style.pointerEvents = 'none';
          nextBtn.style.cursor = 'not-allowed';
        }

        if (!window.tutorialAPI || !window.tutorialAPI.store.get) return;

        // Load existing setting
        try {
          const currentPath = (await apiWrapper.storeGet('modsPath')) as
            | string
            | null;

          if (currentPath) {
            display!.textContent = currentPath;
            display!.style.color = '#fff';
            // Add success indicator
            const icon = document.querySelector<HTMLElement>(
              '#mods-path-display i',
            );
            if (icon) {
              icon.className = 'bi bi-check-circle-fill';
              icon.style.color = '#4caf50';
              icon.style.opacity = '1';
            }
            // Enable Next button since we have a path
            if (nextBtn) {
              nextBtn.style.opacity = '1';
              nextBtn.style.pointerEvents = 'auto';
              nextBtn.style.cursor = 'pointer';
            }
          }
        } catch (e) {
          console.error('Error loading setting:', e);
        }

        // Handle click
        if (btn) {
          btn.addEventListener('click', async () => {
            try {
              const path = await window.tutorialAPI.selectFolder();
              if (path) {
                // Save setting
                await window.tutorialAPI.store.set('modsPath', path);

                // Update UI
                display!.textContent = path;
                display!.style.color = '#fff';

                const icon = document.querySelector<HTMLElement>(
                  '#mods-path-display i',
                );
                if (icon) {
                  icon.className = 'bi bi-check-circle-fill';
                  icon.style.color = '#4caf50';
                  icon.style.opacity = '1';
                }

                btn.innerHTML = '<i class="bi bi-check"></i> Selected';
                btn.style.background = 'rgba(76, 175, 80, 0.2)';
                btn.style.color = '#4caf50';
                btn.style.borderColor = 'rgba(76, 175, 80, 0.3)';

                // Enable Next button
                if (nextBtn) {
                  nextBtn.style.opacity = '1';
                  nextBtn.style.pointerEvents = 'auto';
                  nextBtn.style.cursor = 'pointer';
                }
              }
            } catch (error) {
              console.error('Error selecting folder:', error);
            }
          });

          // Add hover effect via JS since inline styles are static
          btn.addEventListener('mouseenter', () => {
            if (!btn.innerHTML.includes('Selected')) {
              btn.style.background = 'rgba(122, 155, 255, 0.3)';
            }
          });
          btn.addEventListener('mouseleave', () => {
            if (!btn.innerHTML.includes('Selected')) {
              btn.style.background = 'rgba(122, 155, 255, 0.2)';
            }
          });
        }
      },
    },
    {
      icon: 'bi-grid-3x3-gap',
      title: 'Manage Your Mods',
      description: 'Enable, disable, and organize your mods',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">Everything at your fingertips</h3>
    
    <div style="display: flex; flex-direction: column; gap: 12px; text-align: left;">
        
        <div style="display: flex; align-items: center; gap: 16px; padding: 16px; background: rgba(255, 255, 255, 0.03); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05); transition: background 0.2s;">
            <div style="width: 40px; height: 40px; background: rgba(76, 175, 80, 0.1); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <i class="bi bi-toggle-on" style="font-size: 20px; color: #4caf50;"></i>
            </div>
            <div>
                <strong style="color: #fff; display: block; margin-bottom: 2px; font-size: 15px;">Toggle Mods</strong>
                <p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 13px;">Click the checkbox to enable/disable</p>
            </div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 16px; padding: 16px; background: rgba(255, 255, 255, 0.03); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <div style="width: 40px; height: 40px; background: rgba(122, 155, 255, 0.1); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <i class="bi bi-search" style="font-size: 18px; color: #7a9bff;"></i>
            </div>
            <div>
                <strong style="color: #fff; display: block; margin-bottom: 2px; font-size: 15px;">Search & Filter</strong>
                <p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 13px;">Find mods by name or category</p>
            </div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 16px; padding: 16px; background: rgba(255, 255, 255, 0.03); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <div style="width: 40px; height: 40px; background: rgba(255, 193, 7, 0.1); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <i class="bi bi-three-dots" style="font-size: 20px; color: #ffc107;"></i>
            </div>
            <div>
                <strong style="color: #fff; display: block; margin-bottom: 2px; font-size: 15px;">Context Menu</strong>
                <p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 13px;">Right-click to rename, delete, etc.</p>
            </div>
        </div>

    </div>
</div>
`,
    },
    {
      icon: 'bi-download',
      title: 'GameBanana Integration',
      description: 'Install mods directly from your browser',
      content: `
<div style="text-align: center;">
    <h3 style="color: #fff; margin-bottom: 14px; font-size: 20px;">One-click install</h3>
    <p style="margin-bottom: 28px; color: rgba(255,255,255,0.7);">Simply click <strong style="color: #fff;">"Install with FightPlanner"</strong> on GameBanana.</p>
    
    <div style="background: rgba(20, 20, 20, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 24px; position: relative; overflow: hidden;">
        
        <!-- Fake GameBanana Button -->
        <div style="background: #181a1e; border-radius: 4px; padding: 6px 12px; display: inline-flex; align-items: center; gap: 10px; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 1px solid #2f3136;">
            <img src="../images/logo.png" style="width: 32px; height: 32px; filter: drop-shadow(0 0 5px rgba(255, 215, 0, 0.2));">
            <div style="display: flex; flex-direction: column; text-align: left; gap: 0px;">
                <span style="color: #ffd700; font-weight: 800; font-size: 14px; line-height: 1; text-shadow: 0 0 15px rgba(255, 215, 0, 0.4); font-family: 'Segoe UI', sans-serif;">FightPlanner</span>
                <span style="color: #fff; font-weight: 800; font-size: 11px; line-height: 1.2; text-shadow: 0 0 10px rgba(255,255,255,0.5); font-family: 'Segoe UI', sans-serif;">1-CLICK INSTALL</span>
            </div>
        </div>

        <div style="position: relative; height: 40px;">
            <div style="position: absolute; left: 50%; top: 0; transform: translateX(-50%); height: 30px; width: 2px; background: linear-gradient(to bottom, rgba(255,255,255,0.2), #7a9bff);"></div>
            <div style="position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); color: #7a9bff; font-size: 18px;">↓</div>
        </div>

        <div style="margin-top: 10px; background: rgba(122, 155, 255, 0.1); border: 1px solid rgba(122, 155, 255, 0.2); padding: 16px; border-radius: 12px;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 10px; color: #7a9bff; font-weight: 600; margin-bottom: 6px;">
                <i class="bi bi-check-circle-fill"></i> Automatic
            </div>
            <span style="color: rgba(255,255,255,0.6); font-size: 13px;">Downloads • Extracts • Installs</span>
        </div>
    </div>
    
    <p style="margin-top: 24px; font-size: 13px; color: rgba(255,255,255,0.5);">
        Info.toml and previews are handled for you automatically.
    </p>
</div>
`,
    },
    {
      icon: 'bi-check-circle-fill',
      title: "You're All Set",
      description: 'Start modding and have fun',
      content: `
<div style="text-align: center;">
    <div style="width: 80px; height: 80px; background: rgba(76, 175, 80, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; box-shadow: 0 0 30px rgba(76, 175, 80, 0.2);">
        <i class="bi bi-check-lg" style="font-size: 40px; color: #4caf50;"></i>
    </div>
    
    <h3 style="color: #fff; margin-bottom: 16px; font-size: 24px;">Ready to go!</h3>
    <p style="margin-bottom: 32px; color: rgba(255,255,255,0.7); max-width: 400px; margin-left: auto; margin-right: auto;">
        FightPlanner is configured and ready. Start downloading mods or explore the settings to customize your experience.
    </p>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-width: 460px; margin: 0 auto;">
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); padding: 16px; border-radius: 12px; text-align: left;">
            <strong style="color: #fff; display: block; margin-bottom: 4px;">Characters</strong>
            <span style="color: rgba(255,255,255,0.5); font-size: 13px;">Browse by fighter</span>
        </div>
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); padding: 16px; border-radius: 12px; text-align: left;">
            <strong style="color: #fff; display: block; margin-bottom: 4px;">Downloads</strong>
            <span style="color: rgba(255,255,255,0.5); font-size: 13px;">Track progress</span>
        </div>
    </div>
</div>
`,
    },
  ];

  let currentStep = 0;
  let renderTimeout: ReturnType<typeof setTimeout> | null = null;

  async function isStepRelevant(index: number): Promise<boolean> {
    const step = steps[index];
    if (!step || !window.tutorialAPI) return true;

    const title = step.title;

    const hardwareType = await apiWrapper.storeGet('tutorial.hardwareType');
    const arcropolisInstalled = await apiWrapper.storeGet('tutorial.arcropolisInstalled');
    const emulatorType = await apiWrapper.storeGet('tutorial.emulatorType');

    const switchOnlyTitles = [
      'Switch SD Card Setup',
      'Installing Skyline & ARCropolis (Switch)',
      'Verify ARCropolis (Switch)',
    ];
    if (switchOnlyTitles.includes(title)) {
      return hardwareType === 'hardware' && arcropolisInstalled === false;
    }

    if (title === 'Emulator Selection') {
      return hardwareType === 'emulator' && arcropolisInstalled === false;
    }

    const yuzuOnlyTitles = [
      'Yuzu Setup',
      'Installing Skyline & ARCropolis (Yuzu)',
      'Verify ARCropolis (Yuzu)',
    ];
    if (yuzuOnlyTitles.includes(title)) {
      return hardwareType === 'emulator' && emulatorType === 'yuzu' && arcropolisInstalled === false;
    }

    const ryujinxOnlyTitles = [
      'Ryujinx Setup',
      'Installing Skyline & ARCropolis (Ryujinx)',
      'Verify ARCropolis (Ryujinx)',
    ];
    if (ryujinxOnlyTitles.includes(title)) {
      return hardwareType === 'emulator' && emulatorType === 'ryujinx' && arcropolisInstalled === false;
    }

    return true;
  }

  async function getNextRelevantStep(currentIndex: number): Promise<number> {
    for (let i = currentIndex + 1; i < steps.length; i++) {
      if (await isStepRelevant(i)) {
        return i;
      }
    }
    return steps.length;
  }

  async function getPreviousRelevantStep(currentIndex: number): Promise<number> {
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (await isStepRelevant(i)) {
        return i;
      }
    }
    return 0;
  }

  async function initializeTutorial() {
    console.log('ðŸ” Initializing tutorial...');
    console.log('ðŸ” window.tutorialAPI:', window.tutorialAPI);

    if (window.tutorialAPI && window.tutorialAPI.getMigrationStatus) {
      try {
        console.log('ðŸ” Calling getMigrationStatus...');
        const migrationStatus = await window.tutorialAPI.getMigrationStatus();
        console.log('ðŸ” Migration status received:', migrationStatus);

        if (migrationStatus.success && migrationStatus.completed) {
          console.log('✅ Migration detected! Adding migration step...');

          const migrationStep = {
            icon: 'bi-arrow-repeat',
            title: 'Settings Migrated',
            description: 'Your FightPlanner 3 settings have been imported',
            content: `
<div style="text-align: center;">
    <div style="width: 64px; height: 64px; background: rgba(76, 175, 80, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
        <i class="bi bi-database-check" style="font-size: 32px; color: #4caf50;"></i>
    </div>

    <h3 style="color: #fff; margin-bottom: 12px; font-size: 22px;">Welcome Back!</h3>
    <p style="margin-bottom: 24px; color: rgba(255,255,255,0.7);">We found your <strong style="color: #fff;">FightPlanner 3</strong> settings and imported them automatically.</p>
    
    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 20px; max-width: 400px; margin: 0 auto;">
        <div style="display: flex; flex-direction: column; gap: 12px; text-align: left;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <i class="bi bi-check-circle-fill" style="color: #4caf50;"></i>
                <span style="color: #e0e0e0;">Mods folder path</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <i class="bi bi-check-circle-fill" style="color: #4caf50;"></i>
                <span style="color: #e0e0e0;">Plugins folder path</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <i class="bi bi-check-circle-fill" style="color: #4caf50;"></i>
                <span style="color: #e0e0e0;">Emulator preferences</span>
            </div>
        </div>
    </div>
    
    <p style="margin-top: 24px; color: rgba(255,255,255,0.5); font-size: 13px;">
        You can double-check these in Settings anytime.
    </p>
</div>
`,
          };

          steps.splice(1, 0, migrationStep);
          console.log('✓ Migration step added to tutorial');
        } else {
          console.log('â„¹ï¸ No migration detected or already processed');
          console.log('   - success:', migrationStatus.success);
          console.log(
            '   - completed:',
            'completed' in migrationStatus && migrationStatus.completed,
          );
        }
      } catch (error) {
        console.error('Error checking migration status:', error);
      }
    } else {
      console.log('tutorialAPI or getMigrationStatus not available');
    }

    console.log('Total tutorial steps:', steps.length);

    // If restored from dev mode reload, create properties
    if (tutorialDevMode) {
      createDevPanel();
      // Skip startup animation
      document.querySelector<HTMLElement>('#lottie-animation')!.style.display = 'none';
      document.querySelector<HTMLElement>('#welcome-text')!.style.display = 'none';
      document.querySelector<HTMLElement>('#screenshot-preview')!.style.display = 'none';
      const tc = document.querySelector<HTMLElement>('#tutorial-container');
      tc!.style.display = 'flex';
      tc!.classList.add('show');
      document.querySelector<HTMLElement>('.tutorial-window')!.classList.add('white-bg');
      renderProgressDots().then(() => renderStep(0));
    } else {
      startAnimation();
    }
  }

  function startAnimation() {
    const lottieContainer =
      document.querySelector<HTMLElement>('#lottie-animation');
    const welcomeText = document.querySelector<HTMLElement>('#welcome-text');
    const screenshotPreview = document.querySelector<HTMLElement>(
      '#screenshot-preview',
    );

    const startupAudio = new Audio('../../assets/sounds/StartUp_OnGIF.mp3');
    startupAudio.volume = 0.5;
    startupAudio.play().catch(e => console.warn('Tutorial startup audio prevented:', e));
    const tutorialContainer = document.querySelector<HTMLElement>(
      '#tutorial-container',
    );
    const tutorialWindow =
      document.querySelector<HTMLElement>('.tutorial-window');

    const animation = window.lottie.loadAnimation({
      container: lottieContainer!,
      renderer: 'svg',
      loop: false,
      autoplay: false,
      path: '../images/animation.json',
    });

    setTimeout(() => {
      animation.play();
    }, 200);

    setTimeout(() => {
      tutorialWindow!.classList.add('white-bg');
    }, 2330 + 200);

    setTimeout(() => {
      lottieContainer!.style.opacity = '0';
    }, 3200);

    setTimeout(() => {
      welcomeText!.classList.add('show');
    }, 3500);

    setTimeout(() => {
      screenshotPreview!.classList.add('show');
    }, 4500);

    setTimeout(() => {
      welcomeText!.classList.add('move-up');
      screenshotPreview!.classList.add('slide-up');
      screenshotPreview!.classList.add('clear');
    }, 5000);

    setTimeout(() => {
      welcomeText!.style.opacity = '0';
      screenshotPreview!.style.opacity = '0';
      lottieContainer!.style.display = 'none';
    }, 8000);

    setTimeout(async () => {
      welcomeText!.style.display = 'none';
      screenshotPreview!.style.display = 'none';
      tutorialContainer!.style.display = 'flex';

      await renderProgressDots();
      renderStep(0);

      setTimeout(() => {
        tutorialContainer!.classList.add('show');
      }, 50);
    }, 9000);
  }

  // Store previous visible steps for animation
  let previousVisibleSteps: number[] = [];
  let isFirstRender = true;
  let previousActiveStepIndex = -1;

  async function renderProgressDots() {
    const container = document.querySelector<HTMLElement>('#progress-dots');

    // Calculate visible steps based on user answers - only show relevant steps
    let visibleSteps: number[] = [];

    // Always show welcome
    visibleSteps.push(0);

    // Always show hardware type question
    visibleSteps.push(1); // Hardware Type

    // Always show ARCropolis Status (it's the next step after Hardware Type)
    visibleSteps.push(2); // ARCropolis Status

    if (window.tutorialAPI) {
      try {
        const hardwareType = await apiWrapper.storeGet(
          'tutorial.hardwareType',
        );
        const arcropolisInstalled = await apiWrapper.storeGet(
          'tutorial.arcropolisInstalled',
        );

        // Only show installation steps if ARCropolis is not installed
        if (hardwareType && arcropolisInstalled === false) {
          if (hardwareType === 'hardware') {
            // Switch installation flow
            visibleSteps.push(3); // SD Card Setup
            visibleSteps.push(4); // Installing Skyline & ARCropolis (Switch)
            visibleSteps.push(5); // Verify ARCropolis (Switch)
          } else if (hardwareType === 'emulator') {
            // Emulator flow - only show emulator selection first
            visibleSteps.push(6); // Emulator Selection

            const emulatorTypeResponse = await apiWrapper.storeGet(
              'tutorial.emulatorType',
            );

            if (emulatorTypeResponse === 'yuzu') {
              visibleSteps.push(7); // Yuzu Setup
              visibleSteps.push(8); // Installing Skyline & ARCropolis (Yuzu)
              visibleSteps.push(9); // Verify ARCropolis (Yuzu)
            } else if (emulatorTypeResponse === 'ryujinx') {
              visibleSteps.push(10); // Ryujinx Setup
              visibleSteps.push(11); // Installing Skyline & ARCropolis (Ryujinx)
              visibleSteps.push(12); // Verify ARCropolis (Ryujinx)
            }
          }
        }

        // Always show Configure Paths and remaining steps (only if we've progressed past initial questions)
        const configurePathsIndex = steps.findIndex(
          (s) => s.title === 'Configure Your Paths',
        );
        if (configurePathsIndex !== -1 && visibleSteps.length > 2) {
          // Only add Configure Paths if we're past the initial questions
          if (!visibleSteps.includes(configurePathsIndex)) {
            visibleSteps.push(configurePathsIndex);
          }
          // Add remaining steps
          for (let i = configurePathsIndex + 1; i < steps.length; i++) {
            if (!visibleSteps.includes(i)) {
              visibleSteps.push(i);
            }
          }
        }
      } catch (e) {
        console.error('Error calculating visible steps:', e);
        // Fallback: show minimal steps
        visibleSteps = [0, 1, 2];
      }
    } else {
      // Fallback: show minimal steps
      visibleSteps = [0, 1, 2];
    }

    // Find current active step index in visible steps
    const currentActiveDisplayIndex = visibleSteps.indexOf(currentStep);
    const activeStepChanged =
      previousActiveStepIndex !== currentActiveDisplayIndex &&
      previousActiveStepIndex !== -1;

    // Check if new steps were added (skip on first render)
    const newStepsAdded =
      !isFirstRender &&
      previousVisibleSteps.length > 0 &&
      visibleSteps.length > previousVisibleSteps.length;
    const newStepIndices: number[] = [];
    const removedStepIndices: number[] = [];

    if (!isFirstRender && previousVisibleSteps.length > 0) {
      // Find which steps are new
      visibleSteps.forEach((stepIndex, displayIndex) => {
        if (!previousVisibleSteps.includes(stepIndex)) {
          newStepIndices.push(displayIndex);
        }
      });

      // Find which steps were removed (dots that should disappear)
      // We need to find the display index in the previous render
      previousVisibleSteps.forEach((prevStepIndex, prevDisplayIndex) => {
        if (!visibleSteps.includes(prevStepIndex)) {
          removedStepIndices.push(prevDisplayIndex);
        }
      });
    }

    // Store current state BEFORE rendering
    const wasFirstRender = isFirstRender;
    if (isFirstRender) {
      isFirstRender = false;
    }

    // Animate out removed dots before updating
    if (removedStepIndices.length > 0 && container!.children.length > 0) {
      removedStepIndices.forEach((prevDisplayIndex) => {
        const dot = container!.children[prevDisplayIndex] as HTMLElement;
        if (dot) {
          dot.classList.add('removing-dot');
          dot.style.animation =
            'dotRemove 0.5s cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards';
        }
      });

      // Wait for animation to complete before updating
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    previousVisibleSteps = [...visibleSteps];

    // Ensure animation styles are always available (add once, reuse)
    if (!document.querySelector<HTMLElement>('#dot-animation-style')) {
      const style = document.createElement('style');
      style.id = 'dot-animation-style';
      style.textContent = `
      @keyframes dotAppear {
        0% {
          opacity: 0;
          transform: scale(0.8) translateY(-10px);
          width: 8px;
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
          width: 8px;
        }
      }
      @keyframes dotRemove {
        0% {
          opacity: 1;
          transform: scale(1) translateY(0);
          width: 8px;
          margin: 0 4px;
        }
        30% {
          opacity: 0.5;
          transform: scale(0.8) translateY(-8px);
        }
        100% {
          opacity: 0;
          transform: scale(0) translateY(-15px);
          width: 0;
          margin: 0;
          padding: 0;
        }
      }
      @keyframes dotActivate {
        0% {
          width: 8px;
        }
        100% {
          width: 36px;
        }
      }
      @keyframes dotDeactivate {
        0% {
          width: 36px;
        }
        100% {
          width: 8px;
        }
      }
      @keyframes dotComplete {
        0% {
          background: rgba(122, 155, 255, 0.3);
        }
        100% {
          background: rgba(122, 155, 255, 0.6);
        }
      }
      .tutorial-progress-dot.new-dot {
        background: #7a9bff !important;
        box-shadow: 0 0 20px rgba(122, 155, 255, 0.6), 0 0 10px rgba(122, 155, 255, 0.3) !important;
        animation: dotAppear 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
        border-radius: 4px !important;
      }
      .tutorial-progress-dot.new-dot.active {
        width: 36px !important;
        animation: dotAppear 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
      }
      .tutorial-progress-dot.removing-dot {
        animation: dotRemove 0.5s cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards !important;
        pointer-events: none;
      }
      .tutorial-progress-dot.activating {
        animation: dotActivate 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
      }
      .tutorial-progress-dot.deactivating {
        animation: dotDeactivate 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
      }
      .tutorial-progress-dot.completing {
        animation: dotComplete 0.3s ease-out forwards !important;
      }
    `;
      document.head.appendChild(style);
    }

    // Render dots with animation for new ones
    container!.innerHTML = visibleSteps
      .map((stepIndex, displayIndex) => {
        const isNew = newStepsAdded && newStepIndices.includes(displayIndex);
        const isActive = stepIndex === currentStep;
        const isCompleted = currentActiveDisplayIndex > displayIndex;
        return `
<div class="tutorial-progress-dot ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isNew ? 'new-dot' : ''}" 
      data-step="${stepIndex}" 
      data-display-index="${displayIndex}"
      ${isNew ? 'style="opacity: 0;"' : ''}>
</div>
`;
      })
      .join('');

    // Handle active dot transition animation after DOM is updated
    if (activeStepChanged && !wasFirstRender && container!.children.length > 0) {
      // Animate previous active dot deactivating (if it still exists in visible steps)
      if (
        previousActiveStepIndex >= 0 &&
        previousActiveStepIndex < container!.children.length
      ) {
        const previousActiveDot = container!.children[previousActiveStepIndex];
        if (previousActiveDot && previousActiveDot.classList.contains('active')) {
          previousActiveDot.classList.remove('active');
          previousActiveDot.classList.add('deactivating');
          setTimeout(() => {
            previousActiveDot?.classList.remove('deactivating');
          }, 300);
        }
      }

      // Animate new active dot activating
      if (
        currentActiveDisplayIndex >= 0 &&
        currentActiveDisplayIndex < container!.children.length
      ) {
        const newActiveDot = container!.children[
          currentActiveDisplayIndex
        ] as HTMLElement;

        if (newActiveDot) {
          // Remove active class temporarily to trigger animation
          newActiveDot.classList.remove('active');
          // Force reflow
          newActiveDot.offsetHeight;
          // Add classes for animation
          newActiveDot.classList.add('activating', 'active');
          setTimeout(() => {
            newActiveDot.classList.remove('activating');
          }, 400);
        }
      }

      // Animate completed dots
      for (
        let i = 0;
        i < currentActiveDisplayIndex && i < container!.children.length;
        i++
      ) {
        const completedDot = container!.children[i];
        if (completedDot && completedDot.classList.contains('completed')) {
          completedDot.classList.add('completing');
          setTimeout(() => {
            completedDot.classList.remove('completing');
          }, 300);
        }
      }
    } else if (
      !wasFirstRender &&
      currentActiveDisplayIndex >= 0 &&
      currentActiveDisplayIndex < container!.children.length
    ) {
      // Even if step didn't change, ensure active dot has animation on first appearance
      const activeDot = container!.children[currentActiveDisplayIndex];
      if (
        activeDot &&
        activeDot.classList.contains('active') &&
        !activeDot.classList.contains('new-dot')
      ) {
        activeDot.classList.add('activating');
        setTimeout(() => {
          activeDot.classList.remove('activating');
        }, 400);
      }
    }

    // Trigger animation for new dots after a tiny delay to ensure DOM is ready
    if (newStepsAdded && newStepIndices.length > 0) {
      setTimeout(() => {
        newStepIndices.forEach((displayIndex) => {
          const dot = container!.children[displayIndex] as HTMLElement;
          if (dot) {
            dot.classList.add('new-dot');
            // Force reflow to trigger animation
            dot.offsetHeight;
          }
        });
      }, 10);
    }

    // Remove old event listeners by cloning and replacing
    const oldDots = container!.querySelectorAll<HTMLElement>(
      '.tutorial-progress-dot',
    );
    oldDots.forEach((dot) => {
      const newDot = dot.cloneNode(true);
      dot.parentNode!.replaceChild(newDot, dot);
    });

    // Add fresh event listeners
    container!
      .querySelectorAll<HTMLElement>('.tutorial-progress-dot')
      .forEach((dot) => {
        dot.addEventListener('click', async (e) => {
          const target = e.currentTarget as HTMLElement;
          const step = parseInt(target.dataset.step as string);

          if (!isNaN(step) && step >= 0 && step < steps.length) {
            await goToStep(step);
          }
        });
      });

    // Remove new-dot class after animation completes
    if (newStepsAdded && newStepIndices.length > 0) {
      setTimeout(() => {
        document
          .querySelectorAll<HTMLElement>('.tutorial-progress-dot.new-dot')
          .forEach((dot) => {
            dot.classList.remove('new-dot');
            // Keep the visual state but remove animation class
          });
      }, 800);
    }

    // Update previous active step index
    previousActiveStepIndex = currentActiveDisplayIndex;
  }

  // Utility function to handle Discord links
  function setupDiscordLinks(container: HTMLElement) {
    const discordLinks = container.querySelectorAll<HTMLAnchorElement>(
      'a[href*="discord.gg"]',
    );

    discordLinks.forEach((link) => {
      // Remove existing listeners to avoid duplicates
      const newLink = link.cloneNode(true) as HTMLElement;
      link.parentNode!.replaceChild(newLink, link);

      newLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const url = newLink.getAttribute('href')!;

        if (window.tutorialAPI && window.tutorialAPI.openUrl) {
          try {
            await window.tutorialAPI.openUrl(url);
          } catch (error) {
            console.error('Failed to open Discord link:', error);
          }
        }
      });
    });
  }

  function renderStep(index) {
    const step = steps[index];
    const contentDiv = document.querySelector<HTMLElement>('#tutorial-content');
    const prevBtn = document.querySelector<HTMLElement>('#prev-btn');
    const nextBtn = document.querySelector<HTMLElement>('#next-btn');
    const container = document.querySelector<HTMLElement>('.tutorial-container');

    if (renderTimeout) {
      clearTimeout(renderTimeout);
      renderTimeout = null;
    }

    const startHeight = container ? container.offsetHeight : 0;

    contentDiv!.scrollTop = 0;
    contentDiv!.style.opacity = '0';
    contentDiv!.style.transform = 'translateY(10px) scale(0.98)';
    contentDiv!.style.filter = 'blur(4px)';

    renderTimeout = setTimeout(() => {
      renderTimeout = null;
      contentDiv!.innerHTML = `
<div class="tutorial-step">
<div class="tutorial-step-header">
<div class="tutorial-step-icon">
<i class="bi ${step.icon}"></i>
</div>
<div class="tutorial-step-title">
<h2>${step.title}</h2>
<p>${step.description}</p>
</div>
</div>
<div class="tutorial-step-content">
${step.content}
</div>
</div>
`;

      if (container && startHeight > 0) {
        contentDiv!.style.flex = '0 0 auto';
        const savedMaxHeight = container.style.maxHeight;
        container.style.maxHeight = 'none';
        container.style.height = 'auto';
        container.offsetHeight;

        let endHeight = container.offsetHeight;
        const maxAllowed = window.innerHeight * 0.85;
        if (endHeight > maxAllowed) endHeight = maxAllowed;

        contentDiv!.style.flex = '';
        container.style.maxHeight = savedMaxHeight;

        container.style.transition = 'none';
        container.style.height = startHeight + 'px';
        container.offsetHeight;

        container.style.transition = 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        container.style.height = endHeight + 'px';

        setTimeout(() => {
          container.style.height = '';
          container.style.transition = '';
        }, 450);
      }

      requestAnimationFrame(() => {
        contentDiv!.style.opacity = '1';
        contentDiv!.style.transform = 'translateY(0) scale(1)';
        contentDiv!.style.filter = 'blur(0px)';
      });

      setupDiscordLinks(contentDiv!);

      if (step.onRender) {
        step.onRender();
      }
    }, 350);

    document
      .querySelectorAll<HTMLElement>('.tutorial-progress-dot')
      .forEach((dot) => {
        const dotStepIndex = parseInt(dot.dataset.step as string);
        const displayIndex = parseInt(dot.dataset.displayIndex as string) || 0;

        if (dotStepIndex === index) {
          dot.classList.add('active');
          dot.classList.remove('completed');
        } else if (dotStepIndex < index) {
          dot.classList.add('completed');
          dot.classList.remove('active');
        } else {
          dot.classList.remove('active', 'completed');
        }
      });

    prevBtn!.style.display = index > 0 ? 'flex' : 'none';

    if (index === steps.length - 1) {
      nextBtn!.innerHTML = 'Get Started! <i class="bi bi-check-lg"></i>';
    } else {
      nextBtn!.innerHTML = 'Next <i class="bi bi-arrow-right"></i>';
    }
  }

  async function goToStep(index) {
    if (index >= 0 && index < steps.length) {
      // Verify the step is accessible by checking if it would be in visibleSteps
      // This ensures we can navigate to dynamically added steps
      currentStep = index;
      await renderProgressDots();

      // Double-check that the step is still valid after renderProgressDots
      // (in case renderProgressDots changed visibleSteps)
      if (currentStep >= 0 && currentStep < steps.length) {
        renderStep(currentStep);
      } else {
        console.warn(`Step ${index} is not accessible, staying on current step`);
      }
    }
  }

  async function nextStep() {
    const next = await getNextRelevantStep(currentStep);
    if (next < steps.length) {
      currentStep = next;
      await renderProgressDots();
      renderStep(currentStep);
    } else {
      closeTutorial();
    }
  }

  async function previousStep() {
    if (currentStep > 0) {
      const prev = await getPreviousRelevantStep(currentStep);
      currentStep = prev;
      await renderProgressDots();
      renderStep(currentStep);
    }
  }

  function closeTutorial() {
    console.log('Closing tutorial...');
    console.log('window.tutorialAPI:', window.tutorialAPI);

    if (window.tutorialAPI) {
      console.log('Calling tutorialAPI.closeTutorial()');
      try {
        window.tutorialAPI.closeTutorial();
        console.log('✓ Close event sent');
      } catch (error) {
        console.error('Error calling closeTutorial:', error);
      }
    } else {
      console.error('tutorialAPI not available!');
      console.error('Available window properties:', Object.keys(window));

      if (window.close) {
        console.log('Trying window.close() as fallback');
        window.close();
      }
    }
  }

  function skipTutorial() {
    if (confirm('Are you sure you want to skip the tutorial?')) {
      closeTutorial();
    }
  }


  console.log('Tutorial DOM loaded');
  console.log('tutorialAPI available:', !!window.tutorialAPI);

  setTimeout(() => {
    initializeTutorial();
  }, 100);

  const closeBtn = document.querySelector<HTMLElement>('#close-btn');
  const skipBtn = document.querySelector<HTMLElement>('#skip-btn');
  const prevBtn = document.querySelector<HTMLElement>('#prev-btn');
  const nextBtn = document.querySelector<HTMLElement>('#next-btn');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      console.log('Close button clicked');
      closeTutorial();
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      console.log('Skip button clicked');
      skipTutorial();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      console.log('Previous button clicked');
      previousStep();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      console.log('Next button clicked');
      nextStep();
    });
  }


  function applyDevOverrides() {
    renderProgressDots().then(() => renderStep(currentStep));
  }

  function removeDevOverrides() { }

  function createDevPanel() {
    const p = document.createElement('div');
    p.id = 'dev-mode-panel';
    p.style.cssText = 'position:fixed;top:10px;right:10px;width:220px;background:#1a1a1e;border:1px solid #ff3c3c44;border-radius:8px;z-index:99999;font-family:monospace;font-size:11px;color:#ccc;box-shadow:0 4px 20px rgba(0,0,0,0.6);user-select:none;';
    const ss = 'background:#2a2a2e;border:1px solid #444;color:#fff;padding:2px 4px;border-radius:4px;font-size:10px;font-family:monospace;';
    const r = (l: string, i: string) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;"><span style="color:#aaa;">${l}</span>${i}</div>`;
    p.innerHTML = `
      <div id="dev-hdr" style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:#ff3c3c22;border-bottom:1px solid #ff3c3c33;cursor:move;">
        <span style="background:#ff3c3c;color:#fff;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:bold;">DEV</span>
        <span style="flex:1;font-weight:bold;">Tutorial Debug</span>
        <span id="dev-x" style="cursor:pointer;color:#666;font-size:16px;">&times;</span>
      </div>
      <div style="padding:6px 10px 10px;">
        ${r('Hardware', `<select id="dv-hw" style="${ss}"><option value="">-</option><option value="hardware">Switch</option><option value="emulator">Emulator</option></select>`)}
        ${r('Emulator', `<select id="dv-emu" style="${ss}"><option value="">-</option><option value="yuzu">Yuzu</option><option value="ryujinx">Ryujinx</option></select>`)}
        ${r('ARCropolis', `<select id="dv-arc" style="${ss}"><option value="">-</option><option value="true">Yes</option><option value="false">No</option></select>`)}
        <div style="height:1px;background:#333;margin:4px 0;"></div>
        ${r('SD Card Empty', '<input type="checkbox" id="dv-sd" style="accent-color:#ff3c3c;">')}
        ${r('Install Failure', '<input type="checkbox" id="dv-fail" style="accent-color:#ff3c3c;">')}
        ${r('Emulator Not Found', '<input type="checkbox" id="dv-enf" style="accent-color:#ff3c3c;">')}
        <div style="height:1px;background:#333;margin:4px 0;"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;">
          <span style="font-size:10px;color:#666;">Step <span id="dv-si">${currentStep}/${steps.length - 1}</span></span>
          <span id="dv-go" style="font-size:10px;color:#ff3c3c;cursor:pointer;text-decoration:underline;">goto</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;padding:6px 0 0 0;">
          <button id="dv-restart" style="width:100%;background:#ff3c3c22;border:1px solid #ff3c3c66;color:#fff;padding:4px;border-radius:4px;font-size:10px;font-family:monospace;cursor:pointer;transition:background 0.2s;">Restart Tutorial</button>
        </div>
      </div>`;
    document.body.appendChild(p);

    let drag = false, dx = 0, dy = 0;
    p.querySelector('#dev-hdr')!.addEventListener('mousedown', (e: any) => { drag = true; dx = e.clientX - p.offsetLeft; dy = e.clientY - p.offsetTop; });
    document.addEventListener('mousemove', (e) => { if (!drag) return; p.style.left = (e.clientX - dx) + 'px'; p.style.top = (e.clientY - dy) + 'px'; p.style.right = 'auto'; });
    document.addEventListener('mouseup', () => { drag = false; });
    p.querySelector('#dev-x')!.addEventListener('click', () => { tutorialDevMode = false; p.remove(); removeDevOverrides(); renderProgressDots().then(() => renderStep(currentStep)); });

    const hw = p.querySelector('#dv-hw') as HTMLSelectElement;
    const emu = p.querySelector('#dv-emu') as HTMLSelectElement;
    const arc = p.querySelector('#dv-arc') as HTMLSelectElement;
    const sd = p.querySelector('#dv-sd') as HTMLInputElement;
    const fail = p.querySelector('#dv-fail') as HTMLInputElement;
    const enf = p.querySelector('#dv-enf') as HTMLInputElement;
    function upd() {
      if (hw.value) devOverrides['tutorial.hardwareType'] = hw.value; else delete devOverrides['tutorial.hardwareType'];
      if (emu.value) devOverrides['tutorial.emulatorType'] = emu.value; else delete devOverrides['tutorial.emulatorType'];
      if (arc.value !== '') devOverrides['tutorial.arcropolisInstalled'] = arc.value === 'true'; else delete devOverrides['tutorial.arcropolisInstalled'];
      devOverrides['dev.sdCardEmpty'] = sd.checked;
      devOverrides['dev.installFail'] = fail.checked;
      devOverrides['dev.emulatorNotFound'] = enf.checked;
      applyDevOverrides();
      const si = p.querySelector('#dv-si');
      if (si) si.textContent = `${currentStep}/${steps.length - 1}`;
    }
    [hw, emu, arc, sd, fail, enf].forEach(el => el.addEventListener('change', upd));
    p.querySelector('#dv-go')!.addEventListener('click', () => {
      const v = prompt(`Step (0-${steps.length - 1}):\n${steps.map((s, i) => `${i}: ${s.title}`).join('\n')}`);
      if (v !== null) { const idx = parseInt(v); if (!isNaN(idx) && idx >= 0 && idx < steps.length) { currentStep = idx; renderProgressDots().then(() => renderStep(currentStep)); const si = p.querySelector('#dv-si'); if (si) si.textContent = `${currentStep}/${steps.length - 1}`; } }
    });
    const restartBtn = p.querySelector('#dv-restart') as HTMLButtonElement;
    restartBtn.addEventListener('mouseenter', () => restartBtn.style.background = '#ff3c3c44');
    restartBtn.addEventListener('mouseleave', () => restartBtn.style.background = '#ff3c3c22');
    restartBtn.addEventListener('click', () => {
      localStorage.setItem('tutorialDevState', JSON.stringify(devOverrides));
      window.location.reload();
    });

    // Initialize inputs from existing devOverrides (useful after reload)
    if (devOverrides['tutorial.hardwareType']) hw.value = devOverrides['tutorial.hardwareType'];
    if (devOverrides['tutorial.emulatorType']) emu.value = devOverrides['tutorial.emulatorType'];
    if ('tutorial.arcropolisInstalled' in devOverrides) arc.value = devOverrides['tutorial.arcropolisInstalled'] ? 'true' : 'false';
    sd.checked = !!devOverrides['dev.sdCardEmpty'];
    fail.checked = !!devOverrides['dev.installFail'];
    enf.checked = !!devOverrides['dev.emulatorNotFound'];
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      tutorialDevMode = !tutorialDevMode;
      if (tutorialDevMode) createDevPanel();
      else { document.getElementById('dev-mode-panel')?.remove(); removeDevOverrides(); renderProgressDots().then(() => renderStep(currentStep)); }
    }
  });
});