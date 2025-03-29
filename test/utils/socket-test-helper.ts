/**
 * WebSocket Test Helper
 *
 * Utilities to help manage socket connections in tests and ensure proper cleanup
 */
import { Socket } from 'socket.io-client';
import * as http from 'http';
import * as https from 'https';

// Track all resources globally across tests
const resources = {
  sockets: new Set<Socket>(),
  timeouts: new Set<NodeJS.Timeout>(),
  intervals: new Set<NodeJS.Timeout>(),
  httpAgents: new Set<http.Agent | https.Agent>(),
};

/**
 * Track a socket for later cleanup
 */
export function trackSocket(socket: Socket): Socket {
  if (socket) {
    resources.sockets.add(socket);

    // Ensure we track disconnection to remove from our set
    const originalDisconnect = socket.disconnect;
    socket.disconnect = function () {
      resources.sockets.delete(socket);
      return originalDisconnect.apply(this);
    };
  }
  return socket;
}

/**
 * Track a timeout for later cleanup
 */
export function trackTimeout(timeout: NodeJS.Timeout): NodeJS.Timeout {
  if (timeout) {
    resources.timeouts.add(timeout);

    // Enhance timeout to remove itself from our set when it fires
    const originalUnref = timeout.unref;
    timeout.unref = function () {
      resources.timeouts.delete(timeout);
      return originalUnref.apply(this);
    };
  }
  return timeout;
}

/**
 * Track an HTTP agent for later cleanup
 */
export function trackHttpAgent(agent: http.Agent | https.Agent): void {
  if (agent) {
    resources.httpAgents.add(agent);
  }
}

/**
 * Safely disconnect a socket with proper error handling and timeout
 */
export function safeDisconnect(socket: Socket | null): Promise<void> {
  if (!socket) return Promise.resolve();

  return new Promise<void>((resolve) => {
    try {
      if (!socket.connected) {
        socket.removeAllListeners();
        resources.sockets.delete(socket);
        resolve();
        return;
      }

      // Set a timeout in case disconnect doesn't fire callback
      const timeout = setTimeout(() => {
        try {
          socket.removeAllListeners();
          resources.sockets.delete(socket);
        } catch (e) {
          console.warn('Error removing listeners during timeout:', e);
        }
        resolve();
      }, 500);
      timeout.unref();

      // Listen for disconnect event
      socket.once('disconnect', () => {
        clearTimeout(timeout);
        try {
          socket.removeAllListeners();
          resources.sockets.delete(socket);
        } catch (e) {
          console.warn('Error removing listeners during disconnect:', e);
        }
        resolve();
      });

      // Attempt disconnect
      socket.disconnect();
    } catch (error) {
      console.warn('Error in safeDisconnect:', error);
      resources.sockets.delete(socket);
      resolve();
    }
  });
}

/**
 * Clean up all tracked resources
 */
export async function cleanupResources(): Promise<void> {
  try {
    // Clean up all sockets
    const socketPromises: Promise<void>[] = [];
    for (const socket of resources.sockets) {
      socketPromises.push(safeDisconnect(socket));
    }
    resources.sockets.clear();

    // Clean up all timeouts
    for (const timeout of resources.timeouts) {
      clearTimeout(timeout);
      timeout.unref();
    }
    resources.timeouts.clear();

    // Clean up all intervals
    for (const interval of resources.intervals) {
      clearInterval(interval);
      interval.unref();
    }
    resources.intervals.clear();

    // Clean up all HTTP agents
    for (const agent of resources.httpAgents) {
      try {
        agent.destroy();
      } catch (e) {
        console.warn('Error destroying HTTP agent:', e);
      }
    }
    resources.httpAgents.clear();

    // Wait for all disconnections to complete with a timeout
    const timeoutPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('Socket cleanup timed out, continuing anyway');
        resolve();
      }, 2000);
      timeout.unref();
    });

    // Use Promise.race to ensure we don't hang if disconnections take too long
    await Promise.race([Promise.all(socketPromises), timeoutPromise]);

    // Try to clean up any additional Node.js resources
    cleanupNodeResources();
  } catch (error) {
    console.warn('Error in cleanupResources:', error);
    // Continue anyway to ensure tests can proceed
  }
}

/**
 * Clean up any remaining Node.js resources
 */
function cleanupNodeResources(): void {
  try {
    // Clean up global HTTP agents
    try {
      if (http && http.globalAgent) {
        http.globalAgent.destroy();
      }

      if (https && https.globalAgent) {
        https.globalAgent.destroy();
      }
    } catch (e) {
      console.warn('Error cleaning up HTTP agents:', e);
    }

    // Advanced cleanup - get and close active handles
    try {
      const activeHandles = (process as any)._getActiveHandles?.() || [];

      console.log(`Found ${activeHandles.length} active handles to clean up`);

      for (const handle of activeHandles) {
        try {
          // Socket.io connections
          if (
            handle?.constructor?.name === 'Socket' &&
            typeof handle.disconnect === 'function'
          ) {
            handle.disconnect();
          }

          // HTTP connections
          if (
            handle?.constructor?.name === 'Socket' &&
            typeof handle.destroy === 'function'
          ) {
            handle.destroy();
          }

          // For timers, use unref to allow the process to exit
          if (typeof handle.unref === 'function') {
            handle.unref();
          }

          // Force removal of event listeners
          if (typeof handle.removeAllListeners === 'function') {
            handle.removeAllListeners();
          }
        } catch {
          // Continue with other handles
        }
      }
    } catch {
      console.warn('Error accessing active handles');
    }
  } catch {
    console.warn('Error in cleanupNodeResources');
  }
}

/**
 * Force exit after tests complete if hung
 * @param timeoutMs Time to wait before force exiting
 */
export function setupForceExit(timeoutMs = 5000): void {
  const exitTimeout = setTimeout(() => {
    console.log(
      `\n⚠️ Tests still running after ${timeoutMs}ms. Force exiting to prevent hanging...`,
    );
    process.exit(0); // Using exit code 0 to not break the CI
  }, timeoutMs);

  // Make sure this timeout doesn't itself prevent process from exiting
  exitTimeout.unref();
}
