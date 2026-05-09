import * as fs from 'fs';
import * as path from 'path';
import store from './store';

type LegacyConfig = Record<string, unknown>;

function isPlainObject(value: unknown): value is LegacyConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNonEmptyString(config: LegacyConfig, key: string): string | null {
  const value = config[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function looksLikeFightPlanner3Config(config: LegacyConfig): boolean {
  return ['modsPath', 'pluginsPath', 'emulatorPath', 'gamePath'].some(key =>
    getNonEmptyString(config, key) !== null,
  );
}

export async function migrateFromV3() {
  try {
    const storePath = store.path;
    const storeDir = path.dirname(storePath);
    const oldConfigPath = path.join(storeDir, 'config.json');

    console.log('Checking for FightPlanner 3 config at:', oldConfigPath);

    if (!fs.existsSync(oldConfigPath)) {
      console.log('✓ No FightPlanner 3 config found, skipping migration');
      return { migrated: false };
    }

    const alreadyMigrated = store.get('migrationCompleted');
    if (alreadyMigrated) {
      console.log('✓ Migration already completed, skipping');
      return { migrated: false, alreadyDone: true };
    }

    console.log('Potential legacy config found, validating contents...');

    const oldConfigContent = fs.readFileSync(oldConfigPath, 'utf8');
    const oldConfig = JSON.parse(oldConfigContent);

    if (!isPlainObject(oldConfig) || !looksLikeFightPlanner3Config(oldConfig)) {
      console.log('config.json does not look like a FightPlanner 3 config, skipping migration');
      return { migrated: false };
    }

    console.log('FightPlanner 3 config found! Starting migration...');

    const migratedSettings: {
      modsPath?: string;
      pluginsPath?: string;
      selectedEmulator?: string;
      emulatorPath?: string;
      gamePath?: string;
      protocolConfirmEnabled?: boolean;
      discordRpcEnabled?: boolean;
      volume?: number;
    } = {};

    const modsPath = getNonEmptyString(oldConfig, 'modsPath');
    if (modsPath) {
      store.set('modsPath', modsPath);
      migratedSettings.modsPath = modsPath;
      console.log('Migrated modsPath:', modsPath);
    }

    const pluginsPath = getNonEmptyString(oldConfig, 'pluginsPath');
    if (pluginsPath) {
      store.set('pluginsPath', pluginsPath);
      migratedSettings.pluginsPath = pluginsPath;
      console.log('Migrated pluginsPath:', pluginsPath);
    }

    const selectedEmulator = getNonEmptyString(oldConfig, 'selectedEmulator');
    if (selectedEmulator) {
      store.set('selectedEmulator', selectedEmulator);
      migratedSettings.selectedEmulator = selectedEmulator;
      console.log('Migrated selectedEmulator:', selectedEmulator);
    }

    const emulatorPath = getNonEmptyString(oldConfig, 'emulatorPath');
    if (emulatorPath) {
      store.set('emulatorPath', emulatorPath);
      migratedSettings.emulatorPath = emulatorPath;
      console.log('Migrated emulatorPath:', emulatorPath);
    }

    const gamePath = getNonEmptyString(oldConfig, 'gamePath');
    if (gamePath) {
      store.set('gamePath', gamePath);
      migratedSettings.gamePath = gamePath;
      console.log('Migrated gamePath:', gamePath);
    }

    if (typeof oldConfig.protocolConfirmEnabled === 'boolean') {
      store.set('protocolConfirmEnabled', oldConfig.protocolConfirmEnabled);
      migratedSettings.protocolConfirmEnabled =
        oldConfig.protocolConfirmEnabled;
      console.log(
        'Migrated protocolConfirmEnabled:',
        oldConfig.protocolConfirmEnabled,
      );
    }

    if (typeof oldConfig.discordRpcEnabled === 'boolean') {
      store.set('discordRpcEnabled', oldConfig.discordRpcEnabled);
      migratedSettings.discordRpcEnabled = oldConfig.discordRpcEnabled;
      console.log('Migrated discordRpcEnabled:', oldConfig.discordRpcEnabled);
    }

    if (typeof oldConfig.volume === 'number') {
      store.set('volume', oldConfig.volume);
      migratedSettings.volume = oldConfig.volume;
      console.log('Migrated volume:', oldConfig.volume);
    }

    const migratedSettingKeys = Object.keys(migratedSettings);

    if (migratedSettingKeys.length === 0) {
      console.log('FightPlanner 3 config found, but no supported settings to migrate');
      return { migrated: false };
    }

    store.set('migrationCompleted', true);
    store.set('migratedFrom', 'FightPlanner 3');
    store.set('migrationDate', new Date().toISOString());
    store.set('migrationSettingKeys', migratedSettingKeys);

    const backupPath = path.join(storeDir, 'config.v3.backup.json');
    fs.renameSync(oldConfigPath, backupPath);
    console.log('Old config backed up to:', backupPath);

    console.log('Migration completed successfully!');
    console.log('Migrated settings:', migratedSettingKeys);

    return {
      migrated: true,
      settings: migratedSettings,
      backupPath: backupPath,
    };
  } catch (error) {
    console.error('Migration error:', error);
    return {
      migrated: false,
      error: error.message,
    };
  }
}

export async function getMigrationStatus() {
  const migrationCompleted = store.get('migrationCompleted') as boolean | null;
  const migratedFrom = store.get('migratedFrom') as string | null;
  const migrationDate = store.get('migrationDate') as string | null;
  const migrationSettingKeys = store.get('migrationSettingKeys') as
    | string[]
    | null;

  return {
    completed: migrationCompleted || false,
    from: migratedFrom || null,
    date: migrationDate || null,
    settingKeys: Array.isArray(migrationSettingKeys)
      ? migrationSettingKeys
      : [],
  };
}
