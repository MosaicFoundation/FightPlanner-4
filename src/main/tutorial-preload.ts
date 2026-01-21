import { contextBridge, ipcRenderer } from 'electron';
import {
  migrationHandlerMap,
  MigrationHandlers,
} from './ipc/handlers/migration-handlers';
import { fileHandlerMap, FileHandlers } from './ipc/handlers/file-handlers';
import { storeHandlerMap, StoreHandlers } from './ipc/handlers/store-handlers';
import {
  tutorialHandlerMap,
  TutorialHandlers,
} from './ipc/handlers/tutorial-handlers';
import {
  systemHandlerMap,
  SystemHandlers,
} from './ipc/handlers/system-handlers';
import { wrapAllInvokes } from './utils/ipc-wrappers';

console.log('Tutorial preload.js loaded!');

export type TutorialAPI = typeof tutorialAPI;

const tutorialAPI = {
  ...wrapAllInvokes(migrationHandlerMap, MigrationHandlers),
  ...wrapAllInvokes(fileHandlerMap, FileHandlers),
  ...wrapAllInvokes(tutorialHandlerMap, TutorialHandlers),
  ...wrapAllInvokes(systemHandlerMap, SystemHandlers),

  // Store handlers with nested structure
  store: {
    ...wrapAllInvokes(storeHandlerMap, StoreHandlers),
  },

  closeTutorial: () => {
    console.log('tutorialAPI.closeTutorial() called from renderer');
    ipcRenderer.send('close-tutorial-window');
    console.log('IPC event "close-tutorial-window" sent');
  },

  skipTutorial: () => {
    console.log('tutorialAPI.skipTutorial() called from renderer');
    ipcRenderer.send('skip-tutorial');
    console.log('IPC event "skip-tutorial" sent');
  },

  onAnimationComplete: (callback) =>
    ipcRenderer.on('animation-complete', callback),
};

contextBridge.exposeInMainWorld('tutorialAPI', tutorialAPI);

console.log('tutorialAPI exposed to window');
