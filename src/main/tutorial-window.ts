const { BrowserWindow } = require('electron');
const path = require('path');

let tutorialWindow = null;

function createTutorialWindow(parentWindow) {
  if (tutorialWindow) {
    tutorialWindow.focus();
    return tutorialWindow;
  }

  const width = 1300;
  const height = 800;

  tutorialWindow = new BrowserWindow({
    width: width,
    height: height,
    center: true,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'tutorial-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  tutorialWindow.loadFile(path.join(__dirname, '../renderer/tutorial.html'));

  tutorialWindow.setMenuBarVisibility(false);

  tutorialWindow.webContents.on('did-finish-load', () => {
    console.log('Tutorial window loaded successfully');
  });

  tutorialWindow.on('closed', () => {
    console.log('Tutorial window "closed" event triggered');
    tutorialWindow = null;
  });

  return tutorialWindow;
}

function closeTutorialWindow() {
  console.log('closeTutorialWindow called');
  if (tutorialWindow && !tutorialWindow.isDestroyed()) {
    console.log('Tutorial window exists, destroying...');
    try {
      tutorialWindow.destroy();
      console.log('Tutorial window destroyed');
    } catch (error) {
      console.error('Error destroying tutorial window:', error);
    }
    tutorialWindow = null;
  } else {
    console.log('No tutorial window to close or already destroyed');
  }
}

function getTutorialWindow() {
  return tutorialWindow;
}

module.exports = {
  createTutorialWindow,
  closeTutorialWindow,
  getTutorialWindow,
};
