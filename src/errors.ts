import chalk from "chalk";

export class AppError extends Error {
  public readonly hint: string;

  constructor(message: string, hint: string) {
    super(message);
    this.name = "AppError";
    this.hint = hint;
  }
}

export function formatError(error: unknown): string {
  if (error instanceof AppError) {
    return `${chalk.red("Error:")} ${error.message}\n\n${chalk.yellow("Hint:")} ${error.hint}`;
  }
  if (error instanceof Error) {
    return `${chalk.red("Error:")} ${error.message}`;
  }
  return `${chalk.red("Error:")} ${String(error)}`;
}
