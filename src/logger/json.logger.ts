import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { LoggingContextStorage } from './logging.context';

export class JsonLogger extends ConsoleLogger {
  protected formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
  ): string {
    const pid = pidMessage.replace(/[\[\]]/g, '');
    const context = contextMessage.replace(/\u001b\[\d+[\d;]*m/g, '').trim();

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: logLevel,
      message:
        typeof message === 'object'
          ? message
          : this.stringifyMessage(message, logLevel),
      context: context || undefined,
      pid: pid || undefined,
      ms: timestampDiff
        ? parseFloat(timestampDiff.replace('ms', ''))
        : undefined,
      ...LoggingContextStorage.get(),
    };

    Object.keys(logEntry).forEach(
      (key) => logEntry[key] === undefined && delete logEntry[key],
    );

    return JSON.stringify(logEntry) + '\n';
  }

  // Disable colorization
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected colorize(message: string, logLevel: LogLevel): string {
    return message;
  }
}
