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
import { ModuleRef } from '@nestjs/core';
import { Server, Socket } from 'socket.io';
// UserService is imported dynamically via ModuleRef
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MatrixUserService } from './services/matrix-user.service';
import { MatrixRoomService } from './services/matrix-room.service';
import { MatrixMessageService } from './services/matrix-message.service';
import { WsJwtAuthGuard } from '../auth/ws-auth.guard';
import {
  BroadcastManager,
  MatrixGatewayHelper,
  RoomMembershipManager,
  SocketAuthHandler,
  TypingManager,
} from './helpers';

@WebSocketGateway({
  namespace: '/matrix',
  cors: {
    origin: true, // Allow any origin that sent credentials
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: [
      'x-tenant-id',
      'authorization',
      'content-type',
      'x-requested-with',
    ],
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

  // Logger will be initialized in afterInit to ensure consistency
  private logger: Logger;

  // Helper instances for different responsibilities
  private roomMembershipManager: RoomMembershipManager;
  private broadcastManager: BroadcastManager;
  private typingManager: TypingManager;
  private socketAuthHandler: SocketAuthHandler;

  constructor(
    @Inject(forwardRef(() => MatrixUserService))
    private readonly matrixUserService: MatrixUserService,
    @Inject(forwardRef(() => MatrixRoomService))
    private readonly matrixRoomService: MatrixRoomService,
    @Inject(forwardRef(() => MatrixMessageService))
    private readonly matrixMessageService: MatrixMessageService,
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

    // Initialize helper instances
    this.roomMembershipManager = new RoomMembershipManager(MatrixGateway.name);
    this.broadcastManager = new BroadcastManager(MatrixGateway.name);
    this.typingManager = new TypingManager(MatrixGateway.name);

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

      // Initialize auth handler with dependencies
      this.socketAuthHandler = new SocketAuthHandler(
        this.logger,
        this.jwtService,
        this.configService,
        this.moduleRef,
        this.roomMembershipManager,
      );

      // Set up authentication middleware
      socketServer.use((socket, next) =>
        this.socketAuthHandler.authenticate(socket, next),
      );
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

      // Extract the tenant ID from the handshake headers
      if (!client.data.tenantId && client.handshake?.headers?.['x-tenant-id']) {
        client.data.tenantId = client.handshake.headers['x-tenant-id'];
        this.logger.debug(
          `Applied tenant ID from handshake headers: ${client.data.tenantId}`,
        );
      }

      // Verify we have a tenant ID
      if (!client.data.tenantId) {
        this.logger.warn(`Client connected without tenant ID: ${client.id}`);
        // Send error to client
        client.emit('matrix-event', {
          type: 'error',
          message: 'Tenant ID is required for Matrix integration',
          timestamp: Date.now(),
        });
        return;
      }

      // Create context for user service
      const userService = await MatrixGatewayHelper.createUserServiceForRequest(
        this.moduleRef,
        this.logger,
      );

      // Get the user with Matrix credentials
      const user = await MatrixGatewayHelper.resolveUserById(
        client.data.userId,
        userService,
        client.data.tenantId,
        this.logger,
      );

      // Set Matrix credentials in socket data if user has them
      if (user.matrixUserId && user.matrixAccessToken) {
        client.data.hasMatrixCredentials = true;
        client.data.matrixUserId = user.matrixUserId;
        client.data.matrixAccessToken = user.matrixAccessToken;
        client.data.matrixDeviceId = user.matrixDeviceId;
        this.logger.debug(
          `User ${client.data.userId} has Matrix credentials (${user.matrixUserId})`,
        );
      } else {
        client.data.hasMatrixCredentials = false;
        client.data.matrixUserId = null;
        client.data.matrixAccessToken = null;
        client.data.matrixDeviceId = null;
        this.logger.warn(
          `User ${client.data.userId} missing Matrix credentials`,
        );
      }

      // Send a welcome event to confirm the connection is working
      client.emit('matrix-event', {
        type: 'connection_confirmed',
        timestamp: Date.now(),
        message: 'WebSocket connection established successfully',
        hasMatrixCredentials: client.data.hasMatrixCredentials,
        matrixUserId: client.data.matrixUserId,
      });

      await this.initializeMatrixClientForConnection(client);
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

  /**
   * Initialize Matrix client for a user connection
   * @param client Connected socket client
   */
  private async initializeMatrixClientForConnection(
    client: Socket,
  ): Promise<void> {
    if (!client.data.hasMatrixCredentials) {
      return;
    }

    try {
      // Initialize Matrix client for this user using credentials from database
      // Just initialize the client - we'll fetch it when needed for operations
      const userId = client.data.userId;

      // Create context ID for resolving UserService
      const userService = await MatrixGatewayHelper.createUserServiceForRequest(
        this.moduleRef,
        this.logger,
      );

      // Get tenant ID from client data
      const tenantId = client.data.tenantId;
      this.logger.debug(
        `Using tenant ID for Matrix client initialization: ${tenantId || 'undefined'}`,
      );

      // Fetch user to get the slug
      const user = await MatrixGatewayHelper.resolveUserById(
        userId,
        userService,
        tenantId,
        this.logger,
      );

      // Initialize Matrix client using DB credentials (will be cached in MatrixUserService)
      // Pass userService and tenantId
      await this.matrixUserService.getClientForUser(
        user.slug,
        userService,
        tenantId,
      );

      // Store the user ID in socket data for connection management
      client.data.matrixClientInitialized = true;

      this.logger.log(`Matrix client initialized for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to initialize Matrix client: ${error.message}`);

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

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    try {
      if (!client || !client.id) {
        return;
      }

      await this.cleanupClientConnection(client);
    } catch (error) {
      this.logger.error(`Error during disconnect cleanup: ${error.message}`);
    }
  }

  /**
   * Clean up resources when a client disconnects
   * @param client Disconnected socket client
   */
  private async cleanupClientConnection(client: Socket): Promise<void> {
    // Get user info
    const userInfo = this.roomMembershipManager.unregisterSocket(client.id);

    if (userInfo) {
      // Clean up room subscriptions
      if (userInfo.matrixUserId) {
        this.roomMembershipManager.removeUserFromAllRooms(
          userInfo.matrixUserId,
        );
      }

      // Release Matrix client if it was initialized
      if (
        client.data?.userId &&
        client.data?.matrixClientInitialized &&
        userInfo?.userId
      ) {
        try {
          // Get user to find slug for releasing client
          const userService =
            await MatrixGatewayHelper.createUserServiceForRequest(
              this.moduleRef,
              this.logger,
            );

          // Get tenant ID from client data
          const tenantId = client.data.tenantId;

          const user = await MatrixGatewayHelper.resolveUserById(
            userInfo.userId,
            userService,
            tenantId,
            this.logger,
          );

          this.matrixUserService.releaseClientForUser(user.slug);
          this.logger.debug(`Released Matrix client for user ${user.slug}`);
        } catch (error) {
          this.logger.warn(`Error releasing Matrix client: ${error.message}`);
        }
      }
    }
  }

  /**
   * Broadcasts a Matrix event to all clients in a room
   * This method is used by the specialized Matrix services (MatrixUserService, MatrixRoomService, MatrixMessageService)
   * to send events to all clients in a room
   * @param roomId Matrix room ID
   * @param event Event to broadcast
   */
  public broadcastRoomEvent(roomId: string, event: any): void {
    try {
      if (!roomId) {
        this.logger.warn('Attempted to broadcast to room with no room ID');
        return;
      }

      // Skip duplicates
      if (this.broadcastManager.shouldSkipDuplicateBroadcast(roomId, event)) {
        return;
      }

      // Add a unique broadcast ID if one doesn't exist
      if (!event._broadcastId) {
        event._broadcastId = this.broadcastManager.generateBroadcastId();
      }

      const clientCount = this.getClientCountInRoom(roomId);

      // Only log broadcasts that will actually reach clients
      if (clientCount > 0) {
        this.logger.log(
          `Broadcasting event to room ${roomId} with ${clientCount} clients`,
          {
            eventType: event.type,
            eventId: event.event_id || event.id || 'unknown',
            sender: event.sender || 'unknown',
          },
        );
      } else {
        // Still try to fix room membership
        this.roomMembershipManager.fixRoomMembership(roomId, this.server);
      }

      // Add broadcasting metadata
      const newBroadcastId = this.broadcastManager.generateBroadcastId();
      const eventWithBroadcastId = {
        ...event,
        _broadcastId: newBroadcastId, // Add unique ID for this broadcast
        _broadcastTime: Date.now(), // Add broadcast timestamp
      };

      // Broadcast the event to all clients in the room
      this.server.to(roomId).emit('matrix-event', eventWithBroadcastId);

      // For messages, also emit a specific message event for easier client handling
      if (event.type === 'm.room.message') {
        this.broadcastMatrixMessage(roomId, event, newBroadcastId);
      }

      // Only log completion for broadcasts that actually reached clients
      if (clientCount > 0) {
        const updatedClientCount = this.getClientCountInRoom(roomId);
        this.logger.log(
          `Event broadcast completed for room ${roomId}, sent to ${updatedClientCount} clients`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error broadcasting room event: ${error.message}`,
        error.stack,
      );

      // Try a fallback broadcast with simpler error handling
      try {
        this.server.to(roomId).emit('matrix-event', event);
      } catch (fallbackError) {
        this.logger.error(
          `Fallback broadcast also failed: ${fallbackError.message}`,
        );
      }
    }
  }

  /**
   * Broadcasts a Matrix message event with simplified format
   * @param roomId Room ID to broadcast to
   * @param event Original Matrix event
   * @param broadcastId Broadcast ID for tracking
   */
  private broadcastMatrixMessage(
    roomId: string,
    event: any,
    broadcastId: string,
  ): void {
    this.server.to(roomId).emit('matrix-message', {
      roomId: roomId,
      sender: event.sender,
      content: event.content,
      eventId: event.event_id,
      timestamp: event.origin_server_ts || event.timestamp || Date.now(),
      _broadcastId: broadcastId, // Include broadcast ID here too
    });
  }

  /**
   * Gets the number of clients in a room
   * @param roomId Room ID to check
   * @returns Number of clients in the room
   */
  private getClientCountInRoom(roomId: string): number {
    try {
      // Get socket.io adapter for detailed room information
      // Cast adapter to any to access the rooms property
      const adapter = this.server.adapter as any;
      const room = adapter?.rooms?.get?.(roomId);
      return room ? room.size : 0;
    } catch (error) {
      this.logger.error(`Error getting client count: ${error.message}`);
      return 0;
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('join-user-rooms')
  async joinUserRooms(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; tenantId?: string },
  ) {
    return await MatrixGatewayHelper.withErrorHandling(
      async () => {
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

        return await this.getUserRoomsAndJoin(client, data);
      },
      'Error joining rooms',
      this.logger,
    );
  }

  /**
   * Gets a user's Matrix rooms and joins them
   * @param client Socket client
   * @param data Request data
   * @returns Room information
   */
  private async getUserRoomsAndJoin(
    client: Socket,
    data: { userId?: string; tenantId?: string },
  ): Promise<{
    success: boolean;
    roomCount: number;
    rooms: Array<{ id: string; name: string }>;
  }> {
    // Get tenant ID from client data or from the request
    const tenantId = MatrixGatewayHelper.getTenantId(client, data);
    this.logger.debug(
      `Using tenant ID for joinUserRooms: ${tenantId || 'undefined'}`,
    );

    // Create context for user service
    const userService = await MatrixGatewayHelper.createUserServiceForRequest(
      this.moduleRef,
      this.logger,
    );

    const user = await MatrixGatewayHelper.resolveUserById(
      client.data.userId,
      userService,
      tenantId,
      this.logger,
    );

    // Get the Matrix client for this user from our service using slug
    const matrixClient = await this.matrixUserService.getClientForUser(
      user.slug,
      userService,
      tenantId,
    );

    // Use the authenticated user's Matrix ID from socket data
    const matrixUserId = client.data.matrixUserId;

    this.logger.debug(`Fetching rooms for Matrix user: ${matrixUserId}`);

    // Get rooms using the user's Matrix client
    const rooms =
      await this.matrixRoomService.getUserRoomsWithClient(matrixClient);

    // Create a set to track which rooms this user has joined
    const userRoomSet = new Set<string>();

    // Join each room
    for (const room of rooms) {
      await client.join(room.roomId);
      userRoomSet.add(room.roomId);
      this.logger.debug(
        `User ${client.data.userId} joined room ${room.roomId}`,
      );
    }

    // Store the mapping
    if (matrixUserId) {
      this.roomMembershipManager.removeUserFromAllRooms(matrixUserId);

      for (const room of rooms) {
        this.roomMembershipManager.addUserToRoom(matrixUserId, room.roomId);
      }
    }

    return {
      success: true,
      roomCount: rooms.length,
      rooms: rooms.map((room) => ({
        id: room.roomId,
        name: room.name || room.roomId,
      })),
    };
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { roomId: string; isTyping: boolean; tenantId?: string },
  ) {
    return await MatrixGatewayHelper.withErrorHandling(
      async () => {
        // Check if state has changed since last call - implement debounce
        if (
          !this.typingManager.shouldSendTypingNotification(
            client.data.userId,
            data.roomId,
            data.isTyping,
          )
        ) {
          return { success: true, cached: true };
        }

        // Check if the client has Matrix credentials
        MatrixGatewayHelper.validateClientHasMatrixCredentials(
          client,
          this.logger,
        );

        return await this.sendTypingNotification(client, data);
      },
      'Error processing typing event',
      this.logger,
    );
  }

  /**
   * Sends a typing notification to Matrix
   * @param client Socket client
   * @param data Typing notification data
   * @returns Success status
   */
  private async sendTypingNotification(
    client: Socket,
    data: { roomId: string; isTyping: boolean; tenantId?: string },
  ): Promise<{ success: boolean; warning?: string }> {
    // Get tenant ID from client data or from the request
    const tenantId = MatrixGatewayHelper.getTenantId(client, data);

    // Create context for user service
    const userService = await MatrixGatewayHelper.createUserServiceForRequest(
      this.moduleRef,
      this.logger,
    );

    const user = await MatrixGatewayHelper.resolveUserById(
      client.data.userId,
      userService,
      tenantId,
      this.logger,
    );

    // Get Matrix client for this user using credentials from database
    const matrixClient = await this.matrixUserService.getClientForUser(
      user.slug,
      userService,
      tenantId,
    );

    // Send typing notification using the client with error handling
    try {
      await matrixClient.sendTyping(data.roomId, data.isTyping, 30000);
      return { success: true };
    } catch (error) {
      // Just log the error but don't fail the request for typing indicators
      this.logger.warn(
        `Non-critical: Typing notification failed for user ${user.matrixUserId} in room ${data.roomId}`,
        {
          error: error.message,
          roomId: data.roomId,
          isTyping: data.isTyping,
        },
      );

      // Return success anyway since typing is not a critical function
      return {
        success: true,
        warning: 'Typing notification failed but continuing',
      };
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('join-room')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; tenantId?: string },
  ) {
    return await MatrixGatewayHelper.withErrorHandling(
      async () => {
        this.logger.log(
          `User ${client.data.userId} joining specific room: ${data.roomId}`,
        );

        // Check if the client has initialized Matrix credentials
        MatrixGatewayHelper.validateClientHasMatrixCredentials(
          client,
          this.logger,
        );

        // Socket.io join room
        await client.join(data.roomId);

        // Update our tracking maps
        const matrixUserId = client.data.matrixUserId;
        if (matrixUserId) {
          this.roomMembershipManager.addUserToRoom(matrixUserId, data.roomId);

          // Log current rooms for this user
          const userRooms =
            this.roomMembershipManager.getUserRooms(matrixUserId);
          this.logger.log(
            `User ${client.data.userId} rooms after join: ${Array.from(userRooms).join(', ')}`,
          );
        }

        // Also make sure the user is actually joined on the Matrix server
        await this.ensureMatrixRoomMembership(client, data);

        return { success: true };
      },
      'Error in join-room handler',
      this.logger,
    );
  }

  /**
   * Ensures the user is joined to the Matrix room
   * @param client Socket client
   * @param data Room data
   */
  private async ensureMatrixRoomMembership(
    client: Socket,
    data: { roomId: string; tenantId?: string },
  ): Promise<void> {
    try {
      // Create a contextId for this request to resolve request-scoped services
      const userService = await MatrixGatewayHelper.createUserServiceForRequest(
        this.moduleRef,
        this.logger,
      );

      // Get tenant ID from client data or from the request
      const tenantId = MatrixGatewayHelper.getTenantId(client, data);

      // Get the user with Matrix credentials
      const user = await MatrixGatewayHelper.resolveUserById(
        client.data.userId,
        userService,
        tenantId,
        this.logger,
      );

      if (user.matrixUserId && user.matrixAccessToken) {
        // Explicitly join the Matrix room to ensure membership
        await this.matrixRoomService.joinRoom(
          data.roomId,
          user.matrixUserId,
          user.matrixAccessToken,
          user.matrixDeviceId,
        );
        this.logger.log(
          `Ensured Matrix membership for user ${client.data.userId} in room ${data.roomId}`,
        );
      }
    } catch (matrixError) {
      // Don't fail the whole request if Matrix join fails
      // It might fail because they're already a member or for other reasons
      this.logger.warn(
        `Matrix join attempt for user ${client.data.userId} in room ${data.roomId} resulted in: ${matrixError.message}`,
      );
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('leave-room')
  async leaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; tenantId?: string },
  ) {
    return await MatrixGatewayHelper.withErrorHandling(
      async () => {
        this.logger.log(
          `User ${client.data?.userId} leaving room: ${data.roomId}`,
        );

        // Socket.io leave room
        await client.leave(data.roomId);

        // Update our tracking maps
        const matrixUserId = client.data?.matrixUserId;
        if (matrixUserId) {
          this.roomMembershipManager.removeUserFromRoom(
            matrixUserId,
            data.roomId,
          );
        }

        return { success: true };
      },
      'Error leaving room',
      this.logger,
    );
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; message: string; tenantId?: string },
  ) {
    return await MatrixGatewayHelper.withErrorHandling(
      async () => {
        this.logger.debug(
          `Message from user ${client.data.userId} in room ${data.roomId}`,
        );

        // Check if the client has initialized Matrix credentials
        MatrixGatewayHelper.validateClientHasMatrixCredentials(
          client,
          this.logger,
        );

        // Send the message and get the result
        const result = await this.sendMatrixMessage(client, data);

        // Send a confirmation to the client that the message was received
        client.emit('message-sent', {
          success: true,
          messageId: result.id,
          roomId: data.roomId,
          timestamp: Date.now(),
        });

        // Also send as a matrix-event for clients listening to that channel
        client.emit('matrix-event', {
          type: 'message-sent',
          success: true,
          messageId: result.id,
          roomId: data.roomId,
          timestamp: Date.now(),
        });

        return result;
      },
      'Error sending message',
      this.logger,
    );
  }

  /**
   * Sends a message to a Matrix room
   * @param client Socket client
   * @param data Message data
   * @returns Event ID of the sent message
   */
  private async sendMatrixMessage(
    client: Socket,
    data: { roomId: string; message: string; tenantId?: string },
  ): Promise<{ id: string }> {
    // Get tenant ID from client data or from the request
    const tenantId = MatrixGatewayHelper.getTenantId(client, data);

    // Create context for user service
    const userService = await MatrixGatewayHelper.createUserServiceForRequest(
      this.moduleRef,
      this.logger,
    );

    const user = await MatrixGatewayHelper.resolveUserById(
      client.data.userId,
      userService,
      tenantId,
      this.logger,
    );

    // Get user Matrix credentials
    if (!user.matrixUserId || !user.matrixAccessToken) {
      this.logger.error(
        `User ${user.id} missing Matrix credentials required to send messages`,
      );
      throw new Error('Matrix credentials missing');
    }

    // Verify if the token is valid
    let isTokenValid = false;
    try {
      isTokenValid = await this.matrixUserService.verifyAccessToken(
        user.matrixUserId,
        user.matrixAccessToken,
      );
    } catch (error) {
      this.logger.warn(`Error verifying token: ${error.message}`);
      isTokenValid = false;
    }

    // If token is invalid, try to refresh it
    if (!isTokenValid) {
      this.logger.warn(
        `Matrix token for user ${user.id} is invalid, attempting to regenerate...`,
      );

      try {
        const newToken = await this.matrixUserService.generateNewAccessToken(
          user.matrixUserId,
        );
        if (newToken) {
          this.logger.log(`Successfully regenerated token for user ${user.id}`);

          // Update user record with new token
          await userService.update(
            user.id,
            { matrixAccessToken: newToken },
            tenantId,
          );

          // Update the token for this connection
          user.matrixAccessToken = newToken;

          // Update socket data for future requests in this session
          client.data.matrixAccessToken = newToken;
        } else {
          this.logger.error(`Failed to regenerate token for user ${user.id}`);
          throw new Error('Failed to refresh Matrix credentials');
        }
      } catch (error) {
        this.logger.error(
          `Error refreshing token: ${error.message}`,
          error.stack,
        );
        throw new Error(
          `Failed to refresh Matrix credentials: ${error.message}`,
        );
      }
    }

    // Use the MatrixMessageService to send the message
    const eventId = await this.matrixMessageService.sendMessage({
      roomId: data.roomId,
      userId: user.matrixUserId,
      accessToken: user.matrixAccessToken,
      deviceId: user.matrixDeviceId,
      content: data.message,
      messageType: 'm.text',
    });

    // Create a result object similar to what we'd get from a Matrix client
    const result = { event_id: eventId };

    this.logger.debug(
      `Message sent for user ${client.data.userId} in room ${data.roomId}`,
    );

    // Return the event ID to the sender
    return {
      id: result.event_id || 'unknown-event-id',
    };
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; message: string; tenantId?: string },
  ) {
    try {
      // Forward to our regular message handler and get the result
      const result = await this.handleMessage(client, data);

      // Return the result directly as an acknowledgement
      return {
        success: true,
        messageId: result?.id || 'unknown',
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(`Error in send-message handler: ${error.message}`);
      // Return error info in the acknowledgement
      return {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; tenantId?: string },
  ) {
    try {
      this.logger.log(
        `User ${client.data?.userId} subscribing to room: ${data.roomId}`,
      );

      // Forward to our join-room handler
      await this.joinRoom(client, data);

      // Send confirmation of room subscription as an event
      client.emit('subscription_confirmed', {
        roomId: data.roomId,
        success: true,
        timestamp: Date.now(),
      });

      // Return a direct acknowledgement that can be received by the client
      return {
        success: true,
        roomId: data.roomId,
        subscribed: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(`Error in subscribe handler: ${error.message}`);

      // Return error in acknowledgement
      return {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('subscribe-room')
  async handleSubscribeRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; tenantId?: string },
  ) {
    try {
      // Forward to our join-room handler
      await this.joinRoom(client, data);

      // Send confirmation of room subscription as an event
      client.emit('matrix-event', {
        type: 'room_subscribed',
        roomId: data.roomId,
        success: true,
        timestamp: Date.now(),
      });

      // Also return a direct acknowledgement that can be received by the client
      return {
        success: true,
        roomId: data.roomId,
        subscribed: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(`Error in subscribe-room handler: ${error.message}`);

      // Return error in acknowledgement
      return {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }
}
