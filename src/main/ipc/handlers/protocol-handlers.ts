import { IpcMain } from 'electron';
import * as https from 'https';
import { getProtocolHandler } from '../../main-protocol-setup';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type ProtocolHandlers = typeof ProtocolHandlers;

const ProtocolHandlers = {
  ['confirm-protocol-install']: async (
    common: BaseHandlerArg,
    url: string,
    downloadId: string,
  ) => {
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
  },

  ['cancel-protocol-install']: async (
    common: BaseHandlerArg,
    downloadId: string,
  ) => {
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
  },

  ['fetch-gamebanana-preview']: async (
    common: BaseHandlerArg,
    modId: string,
  ): Promise<
    HandlerResponse<{
      imageUrl: string;
    }>
  > => {
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
  },
} as const;

/**
 * Register all IPC handlers related to protocol operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerProtocolHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(ProtocolHandlers) as Array<
    keyof typeof ProtocolHandlers
  >) {
    const handler = ProtocolHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
