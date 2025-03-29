import request from 'supertest';
import { io as Client, Socket } from 'socket.io-client';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester, createEvent } from '../utils/functions';
import * as http from 'http';
import * as https from 'https';

/**
 * Matrix WebSocket Client Tests
 *
 * These tests verify the real-time WebSocket functionality using socket.io with Matrix.
 * Note: These tests require a running Matrix server in the test environment.
 */
describe('Matrix WebSocket Client Tests', () => {
  let token: string;
  let eventSlug: string;
  let socketClient: Socket | null = null;
  let roomId: string;
  let socketClients: Socket[] = [];
  const httpAgents: any[] = [];

  // Helper function to setup socket connection
  const setupSocketConnection = async (): Promise<void> => {
    // Get websocket connection info first
    const wsInfoResponse = await request(TESTING_APP_URL)
      .post('/api/matrix/websocket-info')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    if (wsInfoResponse.request && (wsInfoResponse.request as any).agent) {
      httpAgents.push((wsInfoResponse.request as any).agent);
    }

    expect(wsInfoResponse.status).toBe(200);
    expect(wsInfoResponse.body).toHaveProperty('endpoint');
    expect(wsInfoResponse.body).toHaveProperty('authenticated');
    expect(wsInfoResponse.body).toHaveProperty('matrixUserId');

    console.log('WebSocket endpoint:', wsInfoResponse.body.endpoint);

    // The WebSocket endpoint doesn't include the namespace in the API response
    // We need to add '/matrix' to connect to the Matrix Gateway
    const wsEndpoint = `${wsInfoResponse.body.endpoint}/matrix`;
    console.log('Using WebSocket endpoint with namespace:', wsEndpoint);

    // Create a new socket connection
    socketClient = Client(wsEndpoint, {
      auth: {
        token: token,
        tenantId: TESTING_TENANT_ID,
      },
      transports: ['websocket'],
    } as any); // Cast to any to allow additional properties

    // Add more logging to debug socket events
    socketClient.onAny((event, ...args) => {
      console.log(`Socket received event: ${event}`, args);
    });

    // Debug connection events
    socketClient.on('connect', () => {
      console.log('Socket connected');
    });

    socketClient.on('connect_error', (err) => {
      console.log('Socket connection error:', err.message);
    });

    socketClient.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    socketClient.on('error', (err) => {
      console.log('Socket error:', err);
    });

    // Debug specific matrix events
    socketClient.on('matrix-event', (data) => {
      console.log('Matrix event received:', data);
    });

    socketClient.on('matrix-message', (data) => {
      console.log('Matrix message received:', data);
    });

    socketClient.on('message-sent', (data) => {
      console.log('Message sent confirmation received:', data);
    });

    // Track this socket for cleanup
    socketClients.push(socketClient);

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Socket connection timeout'));
      }, 5000);
      timeout.unref();

      if (!socketClient) {
        reject(new Error('Socket client is null'));
        return;
      }

      socketClient.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      socketClient.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    if (!socketClient) {
      throw new Error('Socket client is null after connection');
    }

    expect(socketClient.connected).toBe(true);
  };

  // Helper function to safely disconnect a socket
  const safeDisconnect = (socket: Socket | null): Promise<void> => {
    if (!socket) return Promise.resolve();

    return new Promise<void>((resolve) => {
      try {
        if (!socket.connected) {
          // Even for disconnected sockets, remove all listeners
          socket.removeAllListeners();
          resolve();
          return;
        }

        // Set a timeout in case disconnect doesn't fire callback
        const timeout = setTimeout(() => {
          try {
            // Ensure all listeners are removed
            socket.removeAllListeners();
          } catch (e) {
            console.warn('Error removing listeners during timeout:', e);
          }
          resolve();
        }, 300);
        timeout.unref();

        socket.once('disconnect', () => {
          clearTimeout(timeout);
          try {
            socket.removeAllListeners();
          } catch (e) {
            console.warn('Error removing listeners during disconnect:', e);
          }
          resolve();
        });

        // Attempt disconnect
        socket.disconnect();
      } catch (error) {
        console.warn('Error in safeDisconnect:', error);
        // Still resolve to prevent blocking
        resolve();
      }
    });
  };

  // Helper function to cleanup all sockets
  const cleanupAllSockets = async () => {
    try {
      const promises: Promise<void>[] = [];

      // Clean up main socket
      if (socketClient) {
        promises.push(safeDisconnect(socketClient));
        socketClient = null;
      }

      // Clean up all tracked sockets
      for (const socket of socketClients) {
        promises.push(safeDisconnect(socket));
      }
      socketClients = [];

      // Wait for all disconnections to complete with a timeout
      const timeoutPromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('Socket cleanup timed out, continuing anyway');
          resolve();
        }, 2000);
        timeout.unref();
      });

      // Use Promise.race to ensure we don't hang if disconnections take too long
      await Promise.race([Promise.all(promises), timeoutPromise]);
    } catch (error) {
      console.warn('Error in cleanupAllSockets:', error);
      // Continue anyway to ensure tests can proceed
    }
  };

  beforeAll(async () => {
    // Use the global timeout of 120000ms set at the top of the file
    // Removing the local timeout override that was causing tests to fail

    try {
      token = await loginAsTester();

      // Get the current user information
      expect(TESTING_APP_URL).toBeDefined();
      console.log('TESTING_APP_URL', TESTING_APP_URL);
      const meResponse = await request(TESTING_APP_URL)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(meResponse.status).toBe(200);
      const currentUser = meResponse.body;

      // Create a test event to use for WebSocket testing
      const eventData = {
        name: 'WebSocket Client Test Event',
        description: 'An event created for WebSocket client testing',
        startDate: new Date(),
        endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
        maxAttendees: 100,
        locationOnline: 'https://meet.openmeet.com/test',
        categories: [1],
        status: 'published',
        type: 'online',
        userSlug: currentUser.slug,
      };

      try {
        const event = await createEvent(TESTING_APP_URL, token, eventData);
        eventSlug = event.slug;
        console.log('eventSlug', eventSlug);
        // Provision a Matrix user for testing - this is required for WebSocket connections
        const provisionResponse = await request(TESTING_APP_URL)
          .post('/api/matrix/provision-user')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(provisionResponse.status).toBe(200);
        expect(provisionResponse.body).toHaveProperty('matrixUserId');
        console.log('provisionResponse', provisionResponse.body);

        // Join the event chat room to ensure it exists
        const joinResponse = await request(TESTING_APP_URL)
          .post(`/api/chat/event/${eventSlug}/join`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(joinResponse.status).toBe(201);
        console.log('joinResponse', joinResponse.body);
        // Get the room ID for this event by retrieving messages
        // We need to retry a few times because the room might not be created immediately
        let retries = 0;
        const maxRetries = 5;
        while (retries < maxRetries) {
          const messagesResponse = await request(TESTING_APP_URL)
            .get(`/api/chat/event/${eventSlug}/messages`)
            .set('Authorization', `Bearer ${token}`)
            .set('x-tenant-id', TESTING_TENANT_ID);

          console.log(
            `Try ${retries + 1}/${maxRetries} - messagesResponse:`,
            messagesResponse.body,
          );

          if (messagesResponse.status === 200 && messagesResponse.body.roomId) {
            roomId = messagesResponse.body.roomId;
            console.log(`Successfully got room ID: ${roomId}`);
            break;
          }

          // If room ID is not found, wait a bit and retry
          await new Promise((resolve) => setTimeout(resolve, 2000));
          retries++;
        }

        if (!roomId) {
          console.warn('Could not get room ID after several attempts');
        }
      } catch (error) {
        console.warn(`Error in Matrix setup: ${error.message}`);
        // Continue the test - this will make the roomId tests skip
      }
    } catch (error) {
      console.error(`Error in beforeAll setup: ${error.message}`);
      // Let the tests handle missing data gracefully instead of hanging
    }
  }, 15000);

  afterEach(async () => {
    // Clean up all sockets after each test
    await cleanupAllSockets();
  });

  afterAll(async () => {
    try {
      // Final cleanup of any remaining sockets
      await cleanupAllSockets();

      // Make sure to clear any remaining setTimeout/setInterval calls
      jest.useRealTimers();

      // Advanced cleanup - get and close active handles with proper protection
      try {
        const activeHandles = (process as any)._getActiveHandles?.() || [];

        console.log(`Cleaning up ${activeHandles.length} active handles`);

        // Close any socket connections
        for (const handle of activeHandles) {
          try {
            // Close socket.io connections
            if (
              handle?.constructor?.name === 'Socket' &&
              typeof handle.disconnect === 'function'
            ) {
              handle.disconnect();
            }

            // Close HTTP connections
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
          } catch (error) {
            console.warn('Error cleaning up handle:', error);
            // Continue with other handles
          }
        }
      } catch (handleError) {
        console.warn('Error accessing active handles:', handleError);
      }

      // Also try to close any HTTP agents that might be keeping process alive
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

      // Clean up any stray connections from supertest
      for (const agent of httpAgents) {
        if (agent && typeof agent.destroy === 'function') {
          try {
            agent.destroy();
          } catch (e) {
            console.warn('Error destroying HTTP agent:', e);
          }
        }
      }

      // Reset the Jest timeout
      jest.setTimeout(5000);

      // Force the event loop to finish any pending tasks
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000);
        timer.unref();
      });

      // Clear all timers
      jest.clearAllTimers();
    } catch (cleanupError) {
      console.warn('Error in afterAll cleanup:', cleanupError);
      // Continue anyway so the test can complete
    }
  });

  describe.skip('WebSocket Connection', () => {
    it('should successfully connect to the WebSocket server', async () => {
      await setupSocketConnection();
    }, 10000);
  });

  describe.skip('Event Subscriptions', () => {
    beforeEach(async () => {
      await setupSocketConnection();
    });

    it('should subscribe to a Matrix room and receive events', async () => {
      if (!roomId) {
        throw new Error('Room ID not available');
      }

      console.log('Socket connected, subscribing to room:', roomId);

      // Wait for subscription confirmation
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Subscription confirmation timeout'));
        }, 10000);
        timeout.unref();

        if (!socketClient) {
          reject(new Error('Socket client is null'));
          return;
        }

        console.log(
          `Listening for matrix-event or response event for room: ${roomId}`,
        );

        // Listen for matrix-event
        const matrixEventListener = (data: any) => {
          console.log('Received matrix-event:', data);
          if (
            data.success &&
            data.roomId === roomId &&
            data.type === 'room_subscribed'
          ) {
            clearTimeout(timeout);
            socketClient?.off('matrix-event', matrixEventListener);
            resolve();
          }
        };

        socketClient.on('matrix-event', matrixEventListener);

        // Also check the direct acknowledgement from the emit function
        socketClient.emit('subscribe-room', { roomId }, (response: any) => {
          console.log('Received subscribe-room response:', response);

          // If we receive a successful acknowledgement, consider it confirmed too
          if (response && response.success && response.roomId === roomId) {
            clearTimeout(timeout);
            socketClient?.off('matrix-event', matrixEventListener);
            resolve();
          }
        });
      });
    }, 15000);
  });

  describe.skip('Real-time Messaging', () => {
    beforeEach(async () => {
      await setupSocketConnection();
    });

    it('should send a message via WebSocket and receive confirmation', async () => {
      if (!roomId) {
        throw new Error('Room ID not available');
      }

      console.log('Socket connected for messaging test, roomId:', roomId);

      const messageData = {
        roomId,
        message: 'Test message via WebSocket',
      };

      // Send message and wait for confirmation
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Message send timeout'));
        }, 5000);
        timeout.unref();

        if (!socketClient) {
          reject(new Error('Socket client is null'));
          return;
        }

        console.log(`Emitting send-message event for room: ${roomId}`);
        socketClient.emit('send-message', messageData, (response: any) => {
          console.log('Received send-message response:', response);
          clearTimeout(timeout);
          if (response.success) {
            resolve();
          } else {
            reject(new Error('Message send failed'));
          }
        });
      });
    }, 15000);
  });
});
