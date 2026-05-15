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
  ): HandlerResponse<{
    imageUrl: string;
  }> => {
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

  ['fetch-gamebanana-details']: async (
    common: BaseHandlerArg,
    modelName: string,
    submissionId: string,
  ): HandlerResponse<any> => {
    try {
      const safeModelName = encodeURIComponent(modelName || 'Mod');
      const safeSubmissionId = encodeURIComponent(submissionId);
      const apiUrl = `https://gamebanana.com/apiv11/${safeModelName}/${safeSubmissionId}?_csvProperties=%40gbprofile`;

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

                if (res.statusCode && res.statusCode >= 400) {
                  resolve({
                    success: false,
                    error: `GameBanana returned ${res.statusCode}`,
                  });
                  return;
                }

                resolve({ success: true, data: json });
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
      handleError(error, 'fetch-gamebanana-details');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['fetch-gamebanana-files']: async (
    common: BaseHandlerArg,
    modelName: string,
    submissionId: string,
  ): HandlerResponse<{ files: any[] }> => {
    try {
      const safeModelName = encodeURIComponent(modelName || 'Mod');
      const safeSubmissionId = encodeURIComponent(submissionId);
      const apiUrl = `https://gamebanana.com/apiv11/${safeModelName}/${safeSubmissionId}?_csvProperties=_aFiles,_aModManagerIntegrations`;

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

                if (res.statusCode && res.statusCode >= 400) {
                  resolve({
                    success: false,
                    error: `GameBanana returned ${res.statusCode}`,
                  });
                  return;
                }

                const integrations = json?._aModManagerIntegrations || {};
                const getFightPlannerDownloadUrl = (fileId: string) => {
                  const entries = Array.isArray(integrations[fileId])
                    ? integrations[fileId]
                    : [];
                  const integration = entries.find((entry) => {
                    const alias = String(entry?._sModManagerAlias || '').toLowerCase();
                    const installer = String(entry?._sInstallerName || '').toLowerCase();
                    return (
                      entry?._sDownloadUrl?.startsWith('fightplanner:') &&
                      (alias === 'fightplanner' || installer === 'fightplanner')
                    );
                  });
                  return integration?._sDownloadUrl || '';
                };

                const files = json?._aFiles;
                const fileEntries = Array.isArray(files)
                  ? files
                  : Object.values(files || {});
                const enrichedFileEntries = fileEntries.map((file: any) => {
                  const fileId = file?._idRow ? String(file._idRow) : '';
                  const fightPlannerUrl = fileId
                    ? getFightPlannerDownloadUrl(fileId)
                    : '';
                  return fightPlannerUrl
                    ? { ...file, _sFightPlannerDownloadUrl: fightPlannerUrl }
                    : file;
                });

                resolve({ success: true, files: enrichedFileEntries });
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
      handleError(error, 'fetch-gamebanana-files');
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
