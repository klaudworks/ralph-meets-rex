export class RexError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "RexError";
    this.code = code;
  }
}

export class UserInputError extends RexError {
  public constructor(message: string) {
    super("E_USER_INPUT", message);
    this.name = "UserInputError";
  }
}

export class ConfigError extends RexError {
  public constructor(message: string) {
    super("E_CONFIG", message);
    this.name = "ConfigError";
  }
}

export class ValidationError extends RexError {
  public constructor(message: string) {
    super("E_VALIDATION", message);
    this.name = "ValidationError";
  }
}

export class StorageError extends RexError {
  public constructor(message: string) {
    super("E_STORAGE", message);
    this.name = "StorageError";
  }
}
