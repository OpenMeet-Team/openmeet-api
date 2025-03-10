import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sdk from 'matrix-js-sdk';
import * as pool from 'generic-pool';
import axios from 'axios';

import {
  ActiveClient,
  CreateRoomOptions,
  CreateUserOptions,
  InviteUserOptions,
  MatrixClientWithContext,
  MatrixUserInfo,
  Message,
  RoomInfo,
  SendMessageOptions,
  StartClientOptions,
} from './types/matrix.types';
import { MatrixConfig } from './config/matrix-config.type';

@Injectable()
export class MatrixService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatrixService.name);
  private readonly adminClient: sdk.MatrixClient;
  private readonly adminUserId: string;
  private readonly baseUrl: string;
  private readonly serverName: string;
  private readonly defaultDeviceId: string;
  private readonly defaultInitialDeviceDisplayName: string;

  // Connection pool for admin API operations
  private clientPool: pool.Pool<MatrixClientWithContext>;
  
  // Active client instances for real-time events/sync
  private activeClients: Map<string, ActiveClient> = new Map();
  
  // Interval for cleaning up inactive clients
  private cleanupInterval: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    const matrixConfig = this.configService.get<MatrixConfig>('matrix');
    
    if (!matrixConfig) {
      throw new Error('Matrix configuration is missing');
    }
    
    this.baseUrl = matrixConfig.baseUrl;
    this.adminUserId = `@${matrixConfig.adminUser}:${matrixConfig.serverName}`;
    this.serverName = matrixConfig.serverName;
    this.defaultDeviceId = matrixConfig.defaultDeviceId;
    this.defaultInitialDeviceDisplayName = matrixConfig.defaultInitialDeviceDisplayName;

    // Create admin client for API operations only
    this.adminClient = sdk.createClient({
      baseUrl: this.baseUrl,
      userId: this.adminUserId,
      accessToken: matrixConfig.adminAccessToken || '',
      useAuthorizationHeader: true,
    });

    // Initialize connection pool
    this.clientPool = pool.createPool<MatrixClientWithContext>(
      {
        create: async () => {
          // Use the same userId and accessToken for consistency
          const client = sdk.createClient({
            baseUrl: this.baseUrl,
            userId: this.adminUserId,
            accessToken: matrixConfig.adminAccessToken || '',
            useAuthorizationHeader: true,
          });
          return {
            client,
            userId: this.adminUserId,
          };
        },
        destroy: async (client) => {
          client.client.stopClient();
          return Promise.resolve();
        },
      },
      {
        max: matrixConfig.connectionPoolSize || 10,
        min: 2,
        acquireTimeoutMillis: matrixConfig.connectionPoolTimeout || 30000,
        idleTimeoutMillis: 30000,
        evictionRunIntervalMillis: 60000,
      },
    );
  }

  async onModuleInit() {
    this.logger.log(`Matrix service initialized with admin user ${this.adminUserId}`);
    
    // Warm up the connection pool for admin operations
    try {
      const clients = await Promise.all(
        Array(2).fill(0).map(() => this.clientPool.acquire())
      );
      
      for (const client of clients) {
        await this.clientPool.release(client);
      }
      
      this.logger.log('Matrix client pool initialized');
    } catch (error) {
      this.logger.error('Error initializing Matrix client pool', error.stack);
    }
    
    // Set up a cleanup interval for inactive clients (30 minutes)
    this.cleanupInterval = setInterval(() => this.cleanupInactiveClients(), 30 * 60 * 1000);
  }

  async onModuleDestroy() {
    // Stop the admin client
    this.adminClient.stopClient();
    
    // Stop all active clients
    for (const [userId, activeClient] of this.activeClients.entries()) {
      this.logger.log(`Stopping Matrix client for user ${userId}`);
      activeClient.client.stopClient();
    }
    this.activeClients.clear();
    
    // Clear the cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Drain and clear the connection pool
    await this.clientPool.drain();
    await this.clientPool.clear();
    
    this.logger.log('Matrix service destroyed');
  }
  
  /**
   * Clean up inactive clients (no activity for 2 hours)
   */
  private cleanupInactiveClients() {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    for (const [userId, activeClient] of this.activeClients.entries()) {
      if (activeClient.lastActivity < twoHoursAgo) {
        this.logger.log(`Cleaning up inactive Matrix client for user ${userId}`);
        activeClient.client.stopClient();
        this.activeClients.delete(userId);
      }
    }
  }

  /**
   * Create a new Matrix user using the Admin API
   */
  async createUser(options: CreateUserOptions): Promise<MatrixUserInfo> {
    const { username, password, displayName, adminUser = false } = options;
    
    try {
      // Register the user with the Matrix server using Admin API
      const registrationResponse = await axios.put(
        `${this.baseUrl}/_synapse/admin/v2/users/@${username}:${this.serverName}`,
        {
          password,
          admin: adminUser,
          deactivated: false,
        },
        {
          headers: {
            Authorization: `Bearer ${this.adminClient.getAccessToken()}`,
          },
        }
      );
      
      // The Admin API doesn't return access token/device ID, so we need to log in as the user
      const loginResponse = await axios.post(
        `${this.baseUrl}/_matrix/client/r0/login`,
        {
          type: 'm.login.password',
          identifier: {
            type: 'm.id.user',
            user: username,
          },
          password,
          device_id: this.defaultDeviceId,
          initial_device_display_name: this.defaultInitialDeviceDisplayName,
        }
      );
      
      const userId = loginResponse.data.user_id;
      const accessToken = loginResponse.data.access_token;
      const deviceId = loginResponse.data.device_id;
      
      // Set display name if provided
      if (displayName) {
        const userClient = sdk.createClient({
          baseUrl: this.baseUrl,
          userId,
          accessToken,
          deviceId,
          useAuthorizationHeader: true,
        });
        
        // Just use the client for this one operation without syncing
        await userClient.setDisplayName(displayName);
      }
      
      return {
        userId,
        accessToken,
        deviceId,
      };
    } catch (error) {
      this.logger.error(`Error creating Matrix user: ${error.message}`, error.stack);
      throw new Error(`Failed to create Matrix user: ${error.message}`);
    }
  }

  /**
   * Create a new Matrix room
   */
  async createRoom(options: CreateRoomOptions): Promise<RoomInfo> {
    const { name, topic, isPublic = false, isDirect = false, inviteUserIds = [], powerLevelContentOverride } = options;
    
    const client = await this.clientPool.acquire();
    
    try {
      const createRoomResponse = await client.client.createRoom({
        name,
        topic,
        visibility: isPublic ? sdk.Visibility.Public : sdk.Visibility.Private,
        preset: isPublic ? sdk.Preset.PublicChat : sdk.Preset.PrivateChat,
        is_direct: isDirect,
        invite: inviteUserIds,
        power_level_content_override: powerLevelContentOverride,
        initial_state: [
          {
            type: 'm.room.guest_access',
            state_key: '',
            content: {
              guest_access: 'forbidden',
            },
          },
          {
            type: 'm.room.history_visibility',
            state_key: '',
            content: {
              history_visibility: 'shared',
            },
          },
        ],
      });
      
      // Get room details
      const roomId = createRoomResponse.room_id;
      
      return {
        roomId,
        name,
        topic,
        invitedMembers: inviteUserIds,
      };
    } catch (error) {
      this.logger.error(`Error creating Matrix room: ${error.message}`, error.stack);
      throw new Error(`Failed to create Matrix room: ${error.message}`);
    } finally {
      await this.clientPool.release(client);
    }
  }

  /**
   * Invite a user to a room
   */
  async inviteUser(options: InviteUserOptions): Promise<void> {
    const { roomId, userId } = options;
    
    const client = await this.clientPool.acquire();
    
    try {
      await client.client.invite(roomId, userId);
    } catch (error) {
      this.logger.error(`Error inviting user ${userId} to room ${roomId}: ${error.message}`, error.stack);
      throw new Error(`Failed to invite user to Matrix room: ${error.message}`);
    } finally {
      await this.clientPool.release(client);
    }
  }

  /**
   * Remove a user from a room
   */
  async removeUserFromRoom(roomId: string, userId: string): Promise<void> {
    const client = await this.clientPool.acquire();
    
    try {
      await client.client.kick(roomId, userId, 'Removed from event/group in OpenMeet');
    } catch (error) {
      this.logger.error(`Error removing user ${userId} from room ${roomId}: ${error.message}`, error.stack);
      throw new Error(`Failed to remove user from Matrix room: ${error.message}`);
    } finally {
      await this.clientPool.release(client);
    }
  }

  /**
   * Send a message to a room
   */
  async sendMessage(options: SendMessageOptions): Promise<string> {
    const { roomId, body, msgtype = 'm.room.message', formatted_body, format } = options;
    
    const client = await this.clientPool.acquire();
    
    try {
      const content: any = {
        msgtype: 'm.text',
        body,
      };
      
      if (formatted_body && format) {
        content.format = format;
        content.formatted_body = formatted_body;
      }
      
      const response = await client.client.sendEvent(
        roomId,
        msgtype,
        content,
        '',
      );
      
      return response.event_id;
    } catch (error) {
      this.logger.error(`Error sending message to room ${roomId}: ${error.message}`, error.stack);
      throw new Error(`Failed to send message to Matrix room: ${error.message}`);
    } finally {
      await this.clientPool.release(client);
    }
  }

  /**
   * Start a Matrix client for a specific user with real-time sync
   */
  async startClient(options: StartClientOptions): Promise<void> {
    const { userId, accessToken, deviceId, onEvent, onSync } = options;
    
    // Check if client already exists
    if (this.activeClients.has(userId)) {
      const existingClient = this.activeClients.get(userId);
      
      if (existingClient) {
        // Update last activity
        existingClient.lastActivity = new Date();
        
        // Add new event callback if provided
        if (onEvent && !existingClient.eventCallbacks.includes(onEvent)) {
          existingClient.eventCallbacks.push(onEvent);
          existingClient.client.on('event' as any, onEvent);
        }
        
        // Add sync callback if provided
        if (onSync) {
          existingClient.client.on('sync' as any, onSync);
        }
      }
      
      return;
    }
    
    // Create a new client for this user
    const client = sdk.createClient({
      baseUrl: this.baseUrl,
      userId,
      accessToken,
      deviceId: deviceId || this.defaultDeviceId,
      useAuthorizationHeader: true,
    });
    
    // Set up event handling
    const eventCallbacks = onEvent ? [onEvent] : [];
    if (onEvent) {
      client.on('event' as any, onEvent);
    }
    
    // Set up sync handling
    if (onSync) {
      client.on('sync' as any, onSync);
    }
    
    // Start the client with minimal initial sync
    await client.startClient({ initialSyncLimit: 10 });
    
    // Store the active client
    this.activeClients.set(userId, {
      client,
      userId,
      lastActivity: new Date(),
      eventCallbacks,
    });
    
    this.logger.log(`Started Matrix client for user ${userId}`);
  }
  
  /**
   * Stop a Matrix client for a specific user
   */
  async stopClient(userId: string): Promise<void> {
    const activeClient = this.activeClients.get(userId);
    if (!activeClient) {
      return;
    }
    
    // Stop the client
    activeClient.client.stopClient();
    this.activeClients.delete(userId);
    
    this.logger.log(`Stopped Matrix client for user ${userId}`);
  }
  
  /**
   * Register an event callback for a specific user's client
   */
  addEventCallback(userId: string, callback: (event: any) => void): boolean {
    const activeClient = this.activeClients.get(userId);
    if (!activeClient) {
      return false;
    }
    
    // Add callback if not already registered
    if (!activeClient.eventCallbacks.includes(callback)) {
      activeClient.eventCallbacks.push(callback);
      activeClient.client.on('event' as any, callback);
    }
    
    // Update last activity
    activeClient.lastActivity = new Date();
    
    return true;
  }
  
  /**
   * Remove an event callback for a specific user's client
   */
  removeEventCallback(userId: string, callback: (event: any) => void): boolean {
    const activeClient = this.activeClients.get(userId);
    if (!activeClient) {
      return false;
    }
    
    // Remove callback if registered
    const index = activeClient.eventCallbacks.indexOf(callback);
    if (index !== -1) {
      activeClient.eventCallbacks.splice(index, 1);
      activeClient.client.removeListener('event' as any, callback);
    }
    
    // Update last activity
    activeClient.lastActivity = new Date();
    
    return true;
  }
  
  /**
   * Get room messages
   * This uses the client's sync state if available, otherwise falls back to REST API
   */
  async getRoomMessages(roomId: string, limit = 50, from?: string, userId?: string): Promise<{
    messages: Message[];
    end: string;
  }> {
    // If userId is provided, try to use their synced client first
    if (userId && this.activeClients.has(userId)) {
      try {
        const activeClient = this.activeClients.get(userId);
        
        if (activeClient) {
          // Update activity timestamp
          activeClient.lastActivity = new Date();
          
          // Use the client's timeline if available
          const room = activeClient.client.getRoom(roomId);
          
          if (room) {
            // Get timeline events from the client's sync data
            const timelineEvents = room.timeline || [];
            
            const messages = timelineEvents
              .filter(event => event.getType() === 'm.room.message')
              .slice(-limit)
              .map(event => ({
                eventId: event.getId() || '', // Ensure never undefined
                roomId,
                sender: event.getSender() || '', // Ensure never undefined
                content: event.getContent(),
                timestamp: event.getTs(),
              }));
            
            return {
              messages,
              end: '',  // No pagination token when using timeline
            };
          }
        }
      } catch (error) {
        this.logger.warn(`Error getting room messages from synced client: ${error.message}`, error.stack);
        // Fall back to REST API
      }
    }
    
    // Fall back to REST API for historical messages
    const client = await this.clientPool.acquire();
    
    try {
      // Use direct API access
      const url = `${this.baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages`;
      const params = new URLSearchParams({
        dir: 'f',
        limit: limit.toString(),
        ...(from ? { from } : {}),
      });
      
      const response = await axios.get(`${url}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${client.client.getAccessToken()}`,
        },
      });
      
      const messages = response.data.chunk
        .filter(event => event.type === 'm.room.message')
        .map(event => ({
          eventId: event.event_id || '', // Ensure never undefined
          roomId: event.room_id || roomId,
          sender: event.sender || '', // Ensure never undefined
          content: event.content,
          timestamp: event.origin_server_ts,
        }));
      
      return {
        messages,
        end: response.data.end || '',
      };
    } catch (error) {
      this.logger.error(`Error getting messages from room ${roomId}: ${error.message}`, error.stack);
      throw new Error(`Failed to get messages from Matrix room: ${error.message}`);
    } finally {
      await this.clientPool.release(client);
    }
  }

  /**
   * Set room power levels
   */
  async setRoomPowerLevels(roomId: string, userPowerLevels: Record<string, number>): Promise<void> {
    const client = await this.clientPool.acquire();
    
    try {
      // Get current power levels
      const stateEvent = await client.client.getStateEvent(roomId, 'm.room.power_levels' as any, '');
      
      // Update user power levels
      const updatedContent = {
        ...stateEvent,
        users: {
          ...stateEvent.users,
          ...userPowerLevels,
        },
      };
      
      // Set updated power levels
      // Cast the event type to any to work around TypeScript limitations
      await client.client.sendStateEvent(roomId, 'm.room.power_levels' as any, updatedContent, '');
    } catch (error) {
      this.logger.error(`Error setting power levels in room ${roomId}: ${error.message}`, error.stack);
      throw new Error(`Failed to set power levels in Matrix room: ${error.message}`);
    } finally {
      await this.clientPool.release(client);
    }
  }

}