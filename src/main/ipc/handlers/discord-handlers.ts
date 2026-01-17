const { ipcMain } = require('electron');

function registerDiscordHandlers(ipcMain, discordRPC) {
  ipcMain.on('discord-rpc-update', (event, data) => {
    console.log('Received discord-rpc-update:', data);

    if (!discordRPC) {
      console.warn('Discord RPC manager not initialized');
      return;
    }

    const { tab, modCount } = data;

    switch (tab) {
      case 'tools':
        console.log(`Setting Mods tab with ${modCount} mods`);
        discordRPC.setModsTab(modCount || 0);
        break;
      case 'plugins':
        console.log('Setting Plugins tab');
        discordRPC.setPluginsTab();
        break;
      case 'characters':
        console.log('Setting Characters tab');
        discordRPC.setCharactersTab();
        break;
      case 'downloads':
        console.log('Setting Downloads tab');
        discordRPC.setDownloadsTab();
        break;
      case 'social':
        console.log('Setting Social tab');
        discordRPC.setSocialTab();
        break;
      case 'settings':
        console.log('Setting Settings tab');
        discordRPC.setSettingsTab();
        break;
      default:
        console.log('Setting Idle state');
        discordRPC.setIdleState();
        break;
    }
  });
}

module.exports = { registerDiscordHandlers };
