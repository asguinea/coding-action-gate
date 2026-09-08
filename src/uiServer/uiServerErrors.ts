export type UiServerErrorCode =
  | "UI_SERVER_UNSAFE_HOST"
  | "UI_ROUTE_NOT_FOUND"
  | "UI_METHOD_NOT_ALLOWED"
  | "UI_INVALID_QUERY"
  | "UI_ADAPTER_ERROR"
  | "UI_SERVER_START_ERROR";

export class UiServerError extends Error {
  readonly code: UiServerErrorCode;
  readonly statusCode: number;

  constructor(code: UiServerErrorCode, message: string, statusCode = 500) {
    super(message);
    this.name = "UiServerError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
