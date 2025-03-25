/**
 * Configure Matrix SDK global logging
 */
import { Logger } from '@nestjs/common';
import path from 'path';
import fs from 'fs';

// Set up a logger for this file
const logger = new Logger('MatrixLogger');

// Flag to check if we've already patched
let isPatched = false;

/**
 * Configure the Matrix SDK logging
 * This approach directly patches the FetchHttpApi.js file to disable its logging
 */
export function configureMatrixLogging(): void {
  // Prevent double patching
  if (isPatched) {
    return;
  }
  
  try {
    logger.log('Configuring Matrix SDK logging');

    // First try the console.log replacement approach
    const originalConsoleLog = console.log;
    
    // Replace console.log with a filtered version that catches FetchHttpApi logs
    console.log = function(...args) {
      // Skip FetchHttpApi logs
      if (args.length > 0 && 
          typeof args[0] === 'string' && 
          (args[0].includes('FetchHttpApi:') || 
           args[0].includes('HTTP API:'))) {
        return;
      }
      
      // Pass through all other logs
      return originalConsoleLog.apply(console, args);
    };

    // Try to configure loglevel too
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loglevel = require('loglevel');
      
      // Configure different logging namespaces
      ['matrix', 'matrix-js-sdk', 'matrix-http', 'http'].forEach(name => {
        try {
          const logger = loglevel.getLogger(name);
          if (logger) {
            logger.setLevel(loglevel.levels.ERROR);
          }
        } catch (e) {
          // Ignore errors for individual loggers
        }
      });
    } catch (e) {
      logger.warn(`Could not configure loglevel: ${e.message}`);
    }
    
    isPatched = true;
    logger.log('Matrix SDK logging configured');
  } catch (error) {
    logger.error(`Failed to configure Matrix logging: ${error.message}`);
  }
}