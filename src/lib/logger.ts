const colors = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
  green: "\u001b[32m"
} as const;

function wrap(color: string, text: string): string {
  return `${color}${text}${colors.reset}`;
}

export const logger = {
  header(text: string): void {
    process.stdout.write(`${wrap(colors.bold + colors.cyan, text)}\n`);
  },

  info(text: string): void {
    process.stdout.write(`${text}\n`);
  },

  success(text: string): void {
    process.stdout.write(`${wrap(colors.green, text)}\n`);
  },

  warn(text: string): void {
    process.stderr.write(`${wrap(colors.yellow, text)}\n`);
  },

  error(text: string): void {
    process.stderr.write(`${wrap(colors.red, text)}\n`);
  }
};
