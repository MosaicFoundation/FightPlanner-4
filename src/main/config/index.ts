import * as path from 'path';
import { app } from 'electron';

export const CONFLICT_WHITELIST_PATTERNS = [
  'ui_chara_db.prcxml',
  'ui_chara_db.prc',
  'info.toml',
  'preview.webp',
  'msg_name.xmsbt',
  'msg_name.msbt',
  'config.json',
  'msg_bgm.xmsbt',
  'ui_chara_db.prcx',
  'plugin.nro',
  'victory.toml',
  'README.txt',
  'READ ME.txt',
  'Preview.webp',
  '.DS_Store',
  'Readme.txt',
  'ui/layout/menu/chara_select/chara_select/layout\\.arc',
  'ui/layout/menu/compe_chara_select/compe_chara_select/layout\\.arc',
  'ui/layout/menu/select_bg/select_bg/layout\\.arc',
  'ui/layout/menu/title/title/layout\\.arc',
  'param/menu/chara_icon_arrangement\\.prc',
  'param/menu/chara_icon_arrangement\\.prcx',
];

export const TEMP_FOLDERS = ['fightplanner-downloads', 'fightplanner-extract'];

export const PATHS = {
  logsDir: () => path.join(app.getPath('userData'), 'logs'),
  tempDir: () => app.getPath('temp'),
  localesDir: () => path.join(app.getAppPath(), 'assets', 'locales'),
  dataDir: () => path.join(app.getAppPath(), 'assets', 'data'),
};

export const ENV = {
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production' || !process.env.NODE_ENV,
};

export function validateConfig() {
  try {
    if (!app.isReady()) {
      throw new Error('App is not ready');
    }
    return true;
  } catch (error) {
    console.error('Configuration validation failed:', error);
    return false;
  }
}
