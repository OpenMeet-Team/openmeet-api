import { LoggerService } from '@nestjs/common';

export class SimpleLogger implements LoggerService {
  private logLevels: string[] = ['error', 'warn', 'log', 'debug', 'verbose'];

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  setLogLevels(levels: string[]) {
    this.logLevels = levels;
  }

  log(message: string) {
    if (this.logLevels.includes('log')) {
      console.log(`[${this.getTimestamp()}] ${message}`);
    }
  }

  error(message: string, trace?: string) {
    if (this.logLevels.includes('error')) {
      console.error(`[${this.getTimestamp()}] ${message}`);
      if (trace) console.error(`[${this.getTimestamp()}] ${trace}`);
    }
  }

  warn(message: string) {
    if (this.logLevels.includes('warn')) {
      console.warn(`[${this.getTimestamp()}] ${message}`);
    }
  }

  debug(message: string) {
    if (this.logLevels.includes('debug')) {
      console.debug(`[${this.getTimestamp()}] ${message}`);
    }
  }

  verbose(message: string) {
    if (this.logLevels.includes('verbose')) {
      console.log(`[${this.getTimestamp()}] ${message}`);
    }
  }
}
