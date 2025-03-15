import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WsException,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import {
  UseGuards,
  Logger,
  Injectable,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { Server, Socket } from 'socket.io';
import { MatrixService } from './matrix.service';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsJwtAuthGuard } from '../auth/ws-auth.guard';

@WebSocketGateway({
  namespace: '/matrix',
  cors: {
    origin: true, // Allow any origin that sent credentials
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['x-tenant-id', 'authorization', 'content-type', 'x-requested-with'],
  },
  transports: ['websocket', 'polling'],
  middlewares: [],
  path: '/socket.io', // This is important for Socket.io client to connect properly
})
@Injectable()
export class MatrixGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit
{
  // WebSocket server instance
  @WebSocketServer()
  server: Server;

  // Store user -> rooms mapping for this connection
  private userRooms: Map<string, Set<string>> = new Map();

  // Store socket -> user mapping
  private socketUsers: Map<
    string,
    { userId: number; matrixUserId: string | undefined }
  > = new Map();

  // Logger will be initialized in afterInit to ensure consistency
  private logger: Logger;

  // Don't store the UserService directly since it's request-scoped
  // Instead, we'll resolve it dynamically when needed

  constructor(
    @Inject(forwardRef(() => MatrixService))
    private readonly matrixService: MatrixService,
    private readonly moduleRef: ModuleRef,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // No logging here - logger will be initialized in afterInit

    // Verify essential services via console.log since logger isn't ready
    if (!jwtService) {
      console.error(
        'JwtService not injected properly, authentication will fail!',
      );
    }
    if (!configService) {
      console.error(
        'ConfigService not injected properly, JWT verification will fail!',
      );
    }
  }

  onModuleInit(): void {
    // Avoid using logger here as it's not guaranteed to be initialized yet
    console.log(
      'MatrixGateway: ModuleRef initialized for dynamic resolution of request-scoped UserService',
    );
  }

  afterInit(server: any) {
    this.logger = new Logger(MatrixGateway.name);

    this.logger.log('Matrix WebSocket Gateway initialized');

    try {
      // Add authentication middleware
      if (!server) {
        this.logger.error('Server instance is not available in afterInit');
        return;
      }

      // Set server to this.server if not already set
      if (!this.server && server) {
        this.server = server;
      }

      // Use the server that's available
      const socketServer = this.server || server;

      if (!socketServer) {
        this.logger.error('No socket server instance available');
        return;
      }

      socketServer.use(async (socket: Socket, next) => {
        try {
          // Check for token in various places it might be
          const token =
            socket.handshake.auth.token ||
            socket.handshake.headers.authorization ||
            socket.handshake.query?.token;

          this.logger.debug('Token search locations:', {
            authToken: !!socket.handshake.auth.token,
            headerAuth: !!socket.handshake.headers.authorization,
            queryToken: !!socket.handshake.query?.token,
          });

          if (!token) {
            this.logger.error('No authentication token found in connection');
            return next(
              new WsException('Authentication error - no token provided'),
            );
          }

          // Extract actual token from Bearer format
          const tokenStr = token.startsWith('Bearer ')
            ? token.substring(7)
            : token;

          this.logger.debug(
            `Received token: ${tokenStr.length > 10 ? 'Valid length' : 'Invalid length'}`,
          );

          try {
            // Verify the JWT token properly
            let payload;
            try {
              payload = await this.jwtService.verifyAsync(tokenStr, {
                secret: this.configService.get('auth.secret', { infer: true }),
              });

              this.logger.debug('JWT verification successful');
            } catch (verifyError) {
              this.logger.error('JWT verification error:', verifyError);
              return next(new WsException('Invalid authentication token'));
            }

            if (!payload || !payload.id) {
              this.logger.error('Invalid JWT payload');
              return next(new WsException('Invalid token - missing user ID'));
            }

            // Store the user ID for later use
            const userId = payload.id;
            socket.data = { userId };

            // Create a contextId for this request to resolve request-scoped services
            const contextId = ContextIdFactory.create();

            try {
              // Get the UserService instance for this context
              const userService = await this.moduleRef.resolve(
                UserService,
                contextId,
                { strict: false },
              );

              // Extract tenant ID from socket handshake
              const tenantId =
                socket.handshake.auth.tenantId ||
                socket.handshake.headers['x-tenant-id'] ||
                socket.handshake.query?.tenantId;

              this.logger.debug(
                `Using tenant ID for user lookup: ${tenantId || 'undefined'}`,
              );

              // Fetch user with Matrix credentials directly from database
              // Pass both user ID and tenant ID to the findById method
              const user = await userService.findById(userId, tenantId);

              if (!user) {
                this.logger.warn(`User ${userId} not found in database`);
                return next(new WsException('User not found'));
              }

              this.logger.debug(`Found user ${userId} in database`);

              // Check if user has Matrix credentials
              const hasMatrixCredentials = !!(
                user.matrixUserId &&
                user.matrixAccessToken &&
                user.matrixDeviceId
              );

              // Store minimal information in socket data
              socket.data.hasMatrixCredentials = hasMatrixCredentials;

              // We only store the Matrix user ID in the socket data, not sensitive credentials
              if (hasMatrixCredentials) {
                socket.data.matrixUserId = user.matrixUserId;

                // Store in our tracking maps for room subscriptions
                this.socketUsers.set(socket.id, {
                  userId: user.id,
                  matrixUserId: user.matrixUserId,
                });

                this.logger.debug(
                  `User ${userId} has Matrix credentials (${user.matrixUserId})`,
                );
              } else {
                this.logger.warn(
                  `User ${userId} missing Matrix credentials - some features may not work`,
                );
              }

              // Store tenant ID if provided
              if (socket.handshake.auth.tenantId) {
                socket.data.tenantId = socket.handshake.auth.tenantId;
              }

              next();
            } catch (error) {
              this.logger.error(
                `Error fetching user data: ${error.message}`,
                error.stack,
              );
              return next(new WsException('Error authenticating user'));
            }
          } catch (error) {
            this.logger.error('JWT verification error:', error);
            return next(
              new WsException('Authentication error - invalid token'),
            );
          }
        } catch (error) {
          this.logger.error('WebSocket authentication error:', error);
          return next(new WsException('Authentication error'));
        }
      });
    } catch (error) {
      this.logger.error('Error setting up WebSocket server middleware:', error);
    }
  }

  async handleConnection(client: Socket) {
    try {
      this.logger.log(`Client connected: ${client.id}`);

      // If the user has matrix credentials, start the matrix client
      if (!client.data) {
        this.logger.warn(`Client connected without data: ${client.id}`);
        return;
      }

      // Send a welcome event to confirm the connection is working
      client.emit('matrix-event', {
        type: 'connection_confirmed',
        timestamp: Date.now(),
        message: 'WebSocket connection established successfully',
      });

      if (client.data.hasMatrixCredentials) {
        try {
          // Initialize Matrix client for this user using credentials from database
          // Just initialize the client - we'll fetch it when needed for operations
          const userId = client.data.userId;

          // Create context ID for resolving UserService
          const contextId = ContextIdFactory.create();

          // Get UserService for this request context
          const userService = await this.moduleRef.resolve(
            UserService,
            contextId,
            { strict: false },
          );

          // Get tenant ID from client data
          const tenantId = client.data.tenantId;
          this.logger.debug(
            `Using tenant ID for Matrix client initialization: ${tenantId || 'undefined'}`,
          );

          // Initialize Matrix client using DB credentials (will be cached in MatrixService)
          // Pass userService and tenantId
          await this.matrixService.getClientForUser(
            userId,
            userService,
            tenantId,
          );

          // Store the user ID in socket data for connection management
          client.data.matrixClientInitialized = true;

          this.logger.log(`Matrix client initialized for user ${userId}`);
        } catch (error) {
          this.logger.error(
            `Failed to initialize Matrix client: ${error.message}`,
          );

          // Still allow connection, but mark client as not initialized
          client.data.hasMatrixCredentials = false;
          client.data.matrixClientInitialized = false;

          // Send error to client
          client.emit('matrix-event', {
            type: 'matrix_error',
            message:
              'Failed to initialize Matrix client. Some features may be unavailable.',
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `Error in handleConnection: ${error.message}`,
        error.stack,
      );

      // Send error to client instead of disconnecting
      client.emit('matrix-event', {
        type: 'error',
        message: `Error initializing connection: ${error.message}`,
        timestamp: Date.now(),
      });
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    try {
      if (!client || !client.id) {
        return;
      }

      // Get user info
      const userInfo = this.socketUsers.get(client.id);

      if (userInfo) {
        // Clean up room subscriptions
        if (userInfo.matrixUserId) {
          this.userRooms.delete(userInfo.matrixUserId);
        }

        // Unregister the client
        this.socketUsers.delete(client.id);

        // Release Matrix client if it was initialized
        if (client.data?.userId && client.data?.matrixClientInitialized) {
          try {
            this.matrixService.releaseClientForUser(client.data.userId);
            this.logger.debug(
              `Released Matrix client for user ${client.data.userId}`,
            );
          } catch (error) {
            this.logger.warn(`Error releasing Matrix client: ${error.message}`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error during disconnect cleanup: ${error.message}`);
    }
  }

  // Store recently broadcast event IDs to prevent duplicates
  private recentlyBroadcastEvents = new Map<string, number>();

  /**
   * Broadcasts a Matrix event to all clients in a room
   * This method is used by MatrixService to send events to all clients in a room
   * @param roomId Matrix room ID
   * @param event Event to broadcast
   */
  public broadcastRoomEvent(roomId: string, event: any): void {
    try {
      if (!roomId) {
        this.logger.warn('Attempted to broadcast to room with no room ID');
        return;
      }

      // Check if this is a duplicate event we've already broadcast
      // Use both event_id and _broadcastId to identify events
      const eventId = event.event_id || event.id || 'unknown';
      const existingBroadcastId = event._broadcastId || '';
      
      if (eventId !== 'unknown') {
        // Create a unique key to track this broadcast
        // Include broadcastId if available to make key more specific
        const broadcastKey = existingBroadcastId 
          ? `${roomId}:${eventId}:${existingBroadcastId}`
          : `${roomId}:${eventId}`;
        
        // Check if we've recently broadcast this exact event
        const lastBroadcast = this.recentlyBroadcastEvents.get(broadcastKey);
        if (lastBroadcast && Date.now() - lastBroadcast < 30000) { // 30 seconds
          this.logger.debug(`Skipping duplicate broadcast of event ${eventId} to room ${roomId}`);
          return;
        }
        
        // Also check if we've broadcast this event with a different broadcast ID
        // This handles the case where the same Matrix event comes from different sync responses
        if (!existingBroadcastId) {
          // Look for any keys that contain this roomId:eventId
          const baseKey = `${roomId}:${eventId}`;
          let isDuplicate = false;
          
          for (const [key, timestamp] of this.recentlyBroadcastEvents.entries()) {
            if (key.startsWith(baseKey) && Date.now() - timestamp < 30000) {
              this.logger.debug(`Skipping duplicate broadcast of event ${eventId} (matched existing broadcast)`);
              isDuplicate = true;
              break;
            }
          }
          
          if (isDuplicate) {
            return;
          }
        }
        
        // Record this broadcast to prevent duplicates
        this.recentlyBroadcastEvents.set(broadcastKey, Date.now());
        
        // Add a unique broadcast ID if one doesn't exist
        if (!event._broadcastId) {
          event._broadcastId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        }
        
        // Cleanup old entries every 10 broadcasts
        if (this.recentlyBroadcastEvents.size % 10 === 0) {
          this.cleanupOldBroadcasts();
        }
      }

      // Get socket.io adapter for detailed room information
      // Cast adapter to any to access the rooms property
      const adapter = this.server.adapter as any;
      const room = adapter?.rooms?.get?.(roomId);
      const clientCount = room ? room.size : 0;

      this.logger.log(
        `Broadcasting event to room ${roomId} with ${clientCount} clients`,
        {
          eventType: event.type,
          eventId: eventId,
          sender: event.sender || 'unknown',
        },
      );

      if (clientCount === 0) {
        this.logger.warn(`No clients in room ${roomId} to receive event!`);

        // Try to fix this by re-joining relevant clients to this room
        const usersInRoom: string[] = [];
        for (const [user, rooms] of this.userRooms.entries()) {
          if (rooms.has(roomId)) {
            usersInRoom.push(user);
          }
        }

        if (usersInRoom.length > 0) {
          this.logger.log(`Found ${usersInRoom.length} users who should be in room ${roomId}, rejoining them`);
          
          // For each user who should be in this room, find their socket and join
          for (const matrixUserId of usersInRoom) {
            // Find socket IDs for this Matrix user
            for (const [socketId, userInfo] of this.socketUsers.entries()) {
              if (userInfo.matrixUserId === matrixUserId) {
                const socket = this.server.sockets.sockets.get(socketId);
                if (socket) {
                  this.logger.log(`Re-joining socket ${socketId} to room ${roomId}`);
                  socket.join(roomId);
                }
              }
            }
          }
        }
      }

      // Add a unique broadcast ID to help clients identify duplicate broadcasts
      // This helps especially for test messages that might otherwise be sent multiple times
      const newBroadcastId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const eventWithBroadcastId = {
        ...event,
        _broadcastId: newBroadcastId,  // Add unique ID for this broadcast
        _broadcastTime: Date.now()  // Add broadcast timestamp
      };
      
      // Broadcast the event to all clients in the room
      this.server.to(roomId).emit('matrix-event', eventWithBroadcastId);
      
      // For messages, also emit a specific message event for easier client handling
      if (event.type === 'm.room.message') {
        this.server.to(roomId).emit('matrix-message', {
          roomId: roomId,
          sender: event.sender,
          content: event.content,
          eventId: event.event_id,
          timestamp: event.origin_server_ts || event.timestamp || Date.now(),
          _broadcastId: newBroadcastId  // Include broadcast ID here too
        });
      }
      
      // Check if the broadcast worked by checking room membership again
      const updatedRoom = adapter?.rooms?.get?.(roomId);
      const updatedClientCount = updatedRoom ? updatedRoom.size : 0;
      
      this.logger.log(`Event broadcast completed for room ${roomId}, sent to ${updatedClientCount} clients`);
    } catch (error) {
      this.logger.error(
        `Error broadcasting room event: ${error.message}`,
        error.stack,
      );
      
      // Try a fallback broadcast with simpler error handling
      try {
        this.server.to(roomId).emit('matrix-event', event);
      } catch (fallbackError) {
        this.logger.error(`Fallback broadcast also failed: ${fallbackError.message}`);
      }
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('join-user-rooms')
  async joinUserRooms(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; tenantId?: string },
  ) {
    try {
      const userId = client.data.userId;
      this.logger.log(`User ${userId} joining their Matrix rooms`);

      // Check if the client has initialized Matrix credentials
      if (
        !client.data.hasMatrixCredentials ||
        !client.data.matrixClientInitialized
      ) {
        this.logger.warn(
          `User ${userId} missing Matrix credentials in join-rooms request`,
        );

        // For development, return empty rooms instead of throwing an error
        return { success: true, roomCount: 0, rooms: [] };
      }

      // Verify that the user is joining their own rooms and not someone else's
      if (data.userId && data.userId !== client.data.matrixUserId) {
        this.logger.warn(
          `User ${userId} attempted to join rooms for different Matrix user ID: ${data.userId}`,
        );
        throw new WsException('Can only join your own rooms');
      }

      try {
        // Get tenant ID from client data or from the request
        const tenantId = client.data.tenantId || data.tenantId;
        this.logger.debug(
          `Using tenant ID for joinUserRooms: ${tenantId || 'undefined'}`,
        );

        // Get the Matrix client for this user from our service
        const matrixClient = await this.matrixService.getClientForUser(
          userId,
          null,
          tenantId,
        );

        // Use the authenticated user's Matrix ID from socket data
        const matrixUserId = client.data.matrixUserId;

        this.logger.debug(`Fetching rooms for Matrix user: ${matrixUserId}`);

        // Get rooms using the user's Matrix client
        const rooms =
          await this.matrixService.getUserRoomsWithClient(matrixClient);

        // Create a set to track which rooms this user has joined
        const userRoomSet = new Set<string>();

        // Join each room
        for (const room of rooms) {
          await client.join(room.roomId);
          userRoomSet.add(room.roomId);
          this.logger.debug(`User ${userId} joined room ${room.roomId}`);
        }

        // Store the mapping
        this.userRooms.set(matrixUserId, userRoomSet);

        return {
          success: true,
          roomCount: rooms.length,
          rooms: rooms.map((room) => ({
            id: room.roomId,
            name: room.name || room.roomId,
          })),
        };
      } catch (error) {
        this.logger.error(`Error getting Matrix client: ${error.message}`);
        return {
          success: false,
          error: `Error getting Matrix client: ${error.message}`,
          roomCount: 0,
          rooms: [],
        };
      }
    } catch (error) {
      this.logger.error(`Error joining rooms: ${error.message}`, error.stack);

      // Return error info instead of throwing exception
      return {
        success: false,
        error: `Error joining rooms: ${error.message}`,
        roomCount: 0,
        rooms: [],
      };
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { roomId: string; isTyping: boolean; tenantId?: string },
  ) {
    try {
      this.logger.debug(
        `Typing indicator from user ${client.data.userId} in room ${data.roomId}: ${data.isTyping}`,
      );

      // Check if the client has initialized Matrix credentials
      if (
        !client.data.hasMatrixCredentials ||
        !client.data.matrixClientInitialized
      ) {
        this.logger.warn(
          `Cannot send typing indicator for user ${client.data.userId} - Matrix client not initialized`,
        );
        return { success: false, error: 'Matrix credentials required' };
      }

      try {
        // Get tenant ID from client data or from the request
        const tenantId = client.data.tenantId || data.tenantId;
        this.logger.debug(
          `Using tenant ID for typing: ${tenantId || 'undefined'}`,
        );

        // Get Matrix client for this user using credentials from database
        const matrixClient = await this.matrixService.getClientForUser(
          client.data.userId,
          null,
          tenantId,
        );

        // Send typing notification using the client
        await matrixClient.sendTyping(data.roomId, data.isTyping, 30000);

        this.logger.debug(
          `Typing notification sent for user ${client.data.userId} in room ${data.roomId}`,
        );

        // Return success response
        return { success: true };
      } catch (error) {
        this.logger.error(`Error getting Matrix client: ${error.message}`);
        return {
          success: false,
          error: `Error sending typing notification: ${error.message}`,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error sending typing indicator: ${error.message}`,
        error.stack,
      );

      // Return error to client rather than throwing exception
      return {
        success: false,
        error: `Error sending typing indicator: ${error.message}`,
      };
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('join-room')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; tenantId?: string },
  ) {
    try {
      this.logger.log(
        `User ${client.data.userId} joining specific room: ${data.roomId}`,
      );

      // Check if the client has initialized Matrix credentials
      if (
        !client.data.hasMatrixCredentials ||
        !client.data.matrixClientInitialized
      ) {
        this.logger.warn(
          `User ${client.data.userId} missing Matrix credentials in join-room request`,
        );
        return { success: false, error: 'Matrix credentials required' };
      }

      try {
        // Socket.io join room
        await client.join(data.roomId);

        // Update our tracking maps
        const matrixUserId = client.data.matrixUserId;
        if (matrixUserId) {
          const userRoomSet =
            this.userRooms.get(matrixUserId) || new Set<string>();
          userRoomSet.add(data.roomId);
          this.userRooms.set(matrixUserId, userRoomSet);

          // Log current rooms for this user
          this.logger.log(
            `User ${client.data.userId} rooms after join: ${Array.from(userRoomSet).join(', ')}`,
          );
        }

        // Get socket.io adapter for detailed room information
        const adapter = this.server.adapter as any;
        const room = adapter?.rooms?.get?.(data.roomId);
        const clientCount = room ? room.size : 0;

        this.logger.log(
          `User ${client.data.userId} explicitly joined room ${data.roomId}. Room now has ${clientCount} clients`,
        );

        return { success: true };
      } catch (error) {
        this.logger.error(`Error joining room: ${error.message}`);
        return {
          success: false,
          error: `Error joining room: ${error.message}`,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error in join-room handler: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: `Internal error joining room: ${error.message}`,
      };
    }
  }

  /**
   * Cleanup old broadcast records to prevent memory leaks
   * Only keeps records from the last 10 minutes
   */
  private cleanupOldBroadcasts(): void {
    try {
      const now = Date.now();
      const tenMinutesAgo = now - 10 * 60 * 1000; // 10 minutes
      
      // Remove entries older than 10 minutes
      for (const [key, timestamp] of this.recentlyBroadcastEvents.entries()) {
        if (timestamp < tenMinutesAgo) {
          this.recentlyBroadcastEvents.delete(key);
        }
      }
      
      this.logger.debug(`Cleaned up old broadcast records. Current count: ${this.recentlyBroadcastEvents.size}`);
    } catch (error) {
      this.logger.error(`Error cleaning up broadcast records: ${error.message}`);
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; message: string; tenantId?: string },
  ) {
    try {
      this.logger.debug(
        `Message from user ${client.data.userId} in room ${data.roomId}`,
      );

      // Check if the client has initialized Matrix credentials
      if (
        !client.data.hasMatrixCredentials ||
        !client.data.matrixClientInitialized
      ) {
        this.logger.warn(
          `Cannot send message for user ${client.data.userId} - Matrix client not initialized`,
        );
        return { success: false, error: 'Matrix credentials required' };
      }

      try {
        // Get tenant ID from client data or from the request
        const tenantId = client.data.tenantId || data.tenantId;
        this.logger.debug(
          `Using tenant ID for message: ${tenantId || 'undefined'}`,
        );

        // Get Matrix client for this user using credentials from database
        const matrixClient = await this.matrixService.getClientForUser(
          client.data.userId,
          null,
          tenantId,
        );

        // Send message using the client
        const result = await matrixClient.sendTextMessage(
          data.roomId,
          data.message,
        );

        this.logger.debug(
          `Message sent for user ${client.data.userId} in room ${data.roomId}`,
        );

        // Return the event ID to the sender
        return {
          success: true,
          id: result.event_id || 'unknown-event-id',
        };
      } catch (error) {
        this.logger.error(`Error getting Matrix client: ${error.message}`);
        return {
          success: false,
          error: `Error sending message: ${error.message}`,
        };
      }
    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`, error.stack);

      // Return error to client rather than throwing exception
      return {
        success: false,
        error: `Error sending message: ${error.message}`,
      };
    }
  }
}
