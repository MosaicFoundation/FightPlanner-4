export type HandlerResponse<SuccessData extends {} = {}> = Promise<
  | (SuccessData & {
      success: true;
    })
  | {
      success: false;
      error?: string;
      code?: string;
      details?: Record<string, unknown>;
      canceled?: boolean;
    }
>;
