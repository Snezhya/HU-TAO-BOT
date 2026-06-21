import chalk from 'chalk';

const time = () =>
  new Date().toLocaleTimeString('id-ID', { hour12: false });

export const log = {
  info: (msg, ...args) => console.log(chalk.cyan(`[${time()}] ℹ`), chalk.white(msg), ...args),
  success: (msg, ...args) => console.log(chalk.green(`[${time()}] ✓`), chalk.white(msg), ...args),
  warn: (msg, ...args) => console.log(chalk.yellow(`[${time()}] ⚠`), chalk.white(msg), ...args),
  error: (msg, ...args) => console.error(chalk.red(`[${time()}] ✗`), chalk.white(msg), ...args),
  cmd: (user, cmd) =>
    console.log(
      chalk.magenta(`[${time()}] ⌘`),
      chalk.gray(user),
      chalk.white('→'),
      chalk.bold(cmd)
    ),
  ai: (provider, ms) =>
    console.log(
      chalk.blue(`[${time()}] 🤖`),
      chalk.white(`AI via ${provider}`),
      chalk.gray(`(${ms}ms)`)
    )
};
