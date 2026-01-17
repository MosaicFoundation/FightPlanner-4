const path = require('path');
const { app } = require('electron');

const CONFLICT_WHITELIST_PATTERNS = [
  'ui_chara_db.prcxml',
  'info.toml',
  'preview.webp',
  'msg_name.xmsbt',
  'config.json',
  'msg_bgm.xmsbt',
  'ui_chara_db.prcx',
  'plugin.nro',
  'victory.toml',
  'README.txt',
  'READ ME.txt',
  'Preview.webp',
];

const TEMP_FOLDERS = ['fightplanner-downloads', 'fightplanner-extract'];

const PATHS = {
  logsDir: () => path.join(app.getPath('userData'), 'logs'),
  tempDir: () => app.getPath('temp'),
  localesDir: () => path.join(__dirname, '..', '..', 'locales'),
};

const ENV = {
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production' || !process.env.NODE_ENV,
};

function validateConfig() {
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

module.exports = {
  CONFLICT_WHITELIST_PATTERNS,
  TEMP_FOLDERS,
  PATHS,
  ENV,
  validateConfig,
};
