export class RmrError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "RmrError";
    this.code = code;
  }
}

export class UserInputError extends RmrError {
  public constructor(message: string) {
    super("E_USER_INPUT", message);
    this.name = "UserInputError";
  }
}

export class ConfigError extends RmrError {
  public constructor(message: string) {
    super("E_CONFIG", message);
    this.name = "ConfigError";
  }
}

export class ValidationError extends RmrError {
  public constructor(message: string) {
    super("E_VALIDATION", message);
    this.name = "ValidationError";
  }
}

export class StorageError extends RmrError {
  public constructor(message: string) {
    super("E_STORAGE", message);
    this.name = "StorageError";
  }
}
