import { LoggerService } from '@nestjs/common';

export class SimpleLogger implements LoggerService {
  log(message: string) {
    console.log(message);
  }
  error(message: string, trace?: string) {
    console.error(message);
    if (trace) console.error(trace);
  }
  warn(message: string) {
    console.warn(message);
  }
  debug(message: string) {
    console.debug(message);
  }
  verbose(message: string) {
    console.log(message);
  }
}
