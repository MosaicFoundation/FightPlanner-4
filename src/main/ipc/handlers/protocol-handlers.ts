const { ipcMain } = require('electron');
const https = require('https');
const { getProtocolHandler } = require('../../main-protocol-setup');
const {
  handleError,
  createErrorResponse,
  ErrorCodes,
} = require('../../utils/error-handler');

function registerProtocolHandlers(ipcMain) {
  ipcMain.handle('confirm-protocol-install', async (event, url, downloadId) => {
    try {
      const protocolHandler = getProtocolHandler();
      if (protocolHandler) {
        await protocolHandler.proceedWithInstall(downloadId);
        return { success: true };
      }
      return createErrorResponse(
        ErrorCodes.PROTOCOL_HANDLER_NOT_INITIALIZED,
        'Protocol handler not available',
      );
    } catch (error) {
      handleError(error, 'confirm-protocol-install');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('cancel-protocol-install', async (event, downloadId) => {
    try {
      const protocolHandler = getProtocolHandler();
      if (protocolHandler && protocolHandler.pendingInstalls) {
        protocolHandler.pendingInstalls.delete(downloadId);
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      handleError(error, 'cancel-protocol-install');
      return { success: false };
    }
  });

  ipcMain.handle('fetch-gamebanana-preview', async (event, modId) => {
    try {
      const apiUrl = `https://gamebanana.com/apiv11/Mod/${modId}?_csvProperties=%40gbprofile`;

      return new Promise((resolve) => {
        https
          .get(apiUrl, (res) => {
            let data = '';

            res.on('data', (chunk) => {
              data += chunk;
            });

            res.on('end', () => {
              try {
                const json = JSON.parse(data);

                if (
                  json._aPreviewMedia &&
                  json._aPreviewMedia._aImages &&
                  json._aPreviewMedia._aImages.length > 0
                ) {
                  const firstImage = json._aPreviewMedia._aImages[0];
                  if (firstImage._sBaseUrl && firstImage._sFile) {
                    const imageUrl =
                      firstImage._sBaseUrl + '/' + firstImage._sFile;
                    resolve({ success: true, imageUrl });
                    return;
                  }
                }

                resolve({
                  success: false,
                  error: 'No preview image found',
                });
              } catch (error) {
                resolve(
                  createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message),
                );
              }
            });
          })
          .on('error', (error) => {
            resolve(
              createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message),
            );
          });
      });
    } catch (error) {
      handleError(error, 'fetch-gamebanana-preview');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });
}

module.exports = { registerProtocolHandlers };
