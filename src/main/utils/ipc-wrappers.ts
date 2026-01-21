import { ipcRenderer } from 'electron';

/**
 * Wraps an IPC invoke call for a specific channel and handler, ensuring the
 * resulting function matches the expected handler signature.
 *
 * @param channel The IPC channel to invoke.
 * @param _handlerMap The mapping of channels to handler names. Used only
 * for type inference.
 * @param _handlers The actual handlers object. Used only for type inference.
 *
 * @returns A function that invokes the IPC channel with the correct parameters
 * and return type as defined by the handler.
 */
export function _wrapInvoke<
  Channel extends keyof HandlerMap,
  HandlerMap extends Record<string, string>,
  Handlers extends Record<HandlerMap[keyof HandlerMap], any>,
>(
  channel: Channel,
  _handlerMap: HandlerMap,
  _handlers: Handlers,
): Handlers[HandlerMap[Channel]] {
  return ((...args: any[]) =>
    ipcRenderer.invoke(
      channel as string,
      ...args,
    )) as Handlers[HandlerMap[Channel]];
}

/**
 * Wraps all IPC invoke calls defined in the handler map and handlers object,
 * returning an API object with correctly typed functions.
 *
 * @param handlerMap The mapping of IPC channels to handler names.
 * @param handlers The actual handlers object containing the function signatures.
 *
 * @returns An object containing all wrapped IPC invoke functions with correct
 * typings.
 */
export function wrapAllInvokes<
  HandlerMap extends Record<string, string>,
  Handlers extends Record<HandlerMap[keyof HandlerMap], any>,
>(
  handlerMap: HandlerMap,
  handlers: Handlers,
): {
  [K in HandlerMap[keyof HandlerMap]]: K extends keyof Handlers
    ? Handlers[K]
    : never;
} {
  return Object.entries(handlerMap).reduce(
    (api, [channel, handlerName]) => {
      api[handlerName as string] = _wrapInvoke(
        channel as keyof HandlerMap,
        handlerMap,
        handlers,
      );

      return api;
    },
    {} as {
      [HandlerName in keyof Handlers]: Handlers[HandlerName];
    },
  );
}
