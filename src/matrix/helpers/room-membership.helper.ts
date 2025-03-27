import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * Manages WebSocket room membership for Matrix users
 */
export class RoomMembershipManager {
  // Store user -> rooms mapping
  private userRooms: Map<string, Set<string>> = new Map();

  // Store socket -> user mapping
  private socketUsers: Map<
    string,
    { userId: number; matrixUserId: string | undefined }
  > = new Map();

  private logger: Logger;

  constructor(loggerContext: string) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * Registers a socket client with a user
   * @param socketId Socket ID to register
   * @param userId OpenMeet user ID
   * @param matrixUserId Matrix user ID
   */
  registerSocket(
    socketId: string,
    userId: number,
    matrixUserId: string | undefined,
  ): void {
    this.socketUsers.set(socketId, {
      userId,
      matrixUserId,
    });
  }

  /**
   * Unregisters a socket client
   * @param socketId Socket ID to unregister
   * @returns The user info that was associated with this socket
   */
  unregisterSocket(
    socketId: string,
  ): { userId: number; matrixUserId: string | undefined } | undefined {
    const userInfo = this.socketUsers.get(socketId);
    if (userInfo) {
      this.socketUsers.delete(socketId);
    }
    return userInfo;
  }

  /**
   * Removes all room memberships for a Matrix user
   * @param matrixUserId Matrix user ID to remove from all rooms
   */
  removeUserFromAllRooms(matrixUserId: string): void {
    this.userRooms.delete(matrixUserId);
  }

  /**
   * Adds a Matrix user to a room
   * @param matrixUserId Matrix user ID to add
   * @param roomId Room ID to add the user to
   */
  addUserToRoom(matrixUserId: string, roomId: string): void {
    const userRoomSet = this.userRooms.get(matrixUserId) || new Set<string>();
    userRoomSet.add(roomId);
    this.userRooms.set(matrixUserId, userRoomSet);
  }

  /**
   * Removes a Matrix user from a room
   * @param matrixUserId Matrix user ID to remove
   * @param roomId Room ID to remove the user from
   */
  removeUserFromRoom(matrixUserId: string, roomId: string): void {
    const userRoomSet = this.userRooms.get(matrixUserId);
    if (userRoomSet) {
      userRoomSet.delete(roomId);

      // If user has no rooms left, clean up the entry
      if (userRoomSet.size === 0) {
        this.userRooms.delete(matrixUserId);
      }
    }
  }

  /**
   * Gets all Matrix user IDs that should be in a room
   * @param roomId Room ID to check
   * @returns Array of Matrix user IDs that should be in the room
   */
  getUsersInRoom(roomId: string): string[] {
    const usersInRoom: string[] = [];

    for (const [user, rooms] of this.userRooms.entries()) {
      if (rooms.has(roomId)) {
        usersInRoom.push(user);
      }
    }

    return usersInRoom;
  }

  /**
   * Attempts to fix room membership by rejoining users who should be in a room
   * @param roomId Room ID to fix
   * @param server Socket.io server instance to use for joining
   */
  fixRoomMembership(roomId: string, server: Server): void {
    try {
      const usersInRoom = this.getUsersInRoom(roomId);

      if (usersInRoom.length > 0) {
        this.logger.log(
          `Found ${usersInRoom.length} users who should be in room ${roomId}, rejoining them`,
        );

        // For each user who should be in this room, find their socket and join
        for (const matrixUserId of usersInRoom) {
          // Find socket IDs for this Matrix user
          for (const [socketId, userInfo] of this.socketUsers.entries()) {
            if (userInfo.matrixUserId === matrixUserId) {
              const socket = server.sockets.sockets.get(socketId);
              if (socket) {
                this.logger.log(
                  `Re-joining socket ${socketId} to room ${roomId}`,
                );
                void socket.join(roomId);
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Error fixing room membership: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Gets all rooms that a Matrix user should be in
   * @param matrixUserId Matrix user ID to check
   * @returns Set of room IDs the user should be in, or empty set if none
   */
  getUserRooms(matrixUserId: string): Set<string> {
    return this.userRooms.get(matrixUserId) || new Set<string>();
  }
}
