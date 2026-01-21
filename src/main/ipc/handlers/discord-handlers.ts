import { IpcMain } from 'electron';
import DiscordRPCManager from '../../discord-rpc';

export const discordEventMap = {
  'discord-rpc-update': 'updateDiscordRPC',
} as const;

export const DiscordHandlers = {
  async updateDiscordRPC(data: any) {
    console.log('Received discord-rpc-update:', data);

    if (!this.discordRPC) {
      console.warn('Discord RPC manager not initialized');
      return;
    }

    const { tab, modCount } = data;

    switch (tab) {
      case 'tools':
        console.log(`Setting Mods tab with ${modCount} mods`);
        this.discordRPC.setModsTab(modCount || 0);
        break;

      case 'plugins':
        console.log('Setting Plugins tab');
        this.discordRPC.setPluginsTab();
        break;

      case 'characters':
        console.log('Setting Characters tab');
        this.discordRPC.setCharactersTab();
        break;

      case 'downloads':
        console.log('Setting Downloads tab');
        this.discordRPC.setDownloadsTab();
        break;

      case 'social':
        console.log('Setting Social tab');
        this.discordRPC.setSocialTab();
        break;

      case 'settings':
        console.log('Setting Settings tab');
        this.discordRPC.setSettingsTab();
        break;

      default:
        console.log('Setting Idle state');
        this.discordRPC.setIdleState();
        break;
    }
  },
};

/**
 * Register all IPC event handlers related to Discord RPC operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 * @param discordRPC - Discord RPC manager instance
 */
export function registerDiscordHandlers(
  ipcMain: IpcMain,
  discordRPC: DiscordRPCManager | null,
) {
  for (const channel of Object.keys(discordEventMap)) {
    ipcMain.on(channel, (event, ...args) => {
      DiscordHandlers[discordEventMap[channel]].call(
        { event, discordRPC },
        ...args,
      );
    });
  }
}
