import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Logger,
  Req,
  Inject,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { JWTAuthGuard } from '../auth/auth.guard';
import { OptionalJWTAuthGuard } from '../calendar-feed/optional-auth.guard';
import { VisibilityGuard } from '../shared/guard/visibility.guard';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { Optional } from '@nestjs/common';
import { DiscussionService } from './services/discussion.service';
import { ChatRoomService } from './rooms/chat-room.service';
import { ChatRoomManagerInterface } from './interfaces/chat-room-manager.interface';
import { DiscussionMessagesResponseDto } from './dto/discussion-message.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '../role/role.enum';
import { RolesGuard } from '../role/role.guard';
import { MatrixBotService } from '../matrix/services/matrix-bot.service';

/**
 * Chat Controller - Matrix Integration
 *
 * MIGRATION NOTE: Several endpoints in this controller are deprecated due to
 * the migration to Matrix Application Service (MAS). With MAS:
 * - Room creation/joining happens automatically via Application Service
 * - Users authenticate directly with Matrix via MAS
 * - No explicit API calls needed for room operations
 *
 * Deprecated endpoints:
 * - POST /event/:slug/join - Room joining handled by MAS
 * - POST /group/:slug/join - Room joining handled by MAS
 * - POST /event/:slug/ensure-room - Room creation handled by MAS
 * - POST /group/:slug/ensure-room - Room creation handled by MAS
 */
@ApiTags('Chat')
@Controller('chat')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly discussionService: DiscussionService,
    private readonly chatRoomService: ChatRoomService,
    @Inject('ChatRoomManagerInterface')
    private readonly chatRoomManager: ChatRoomManagerInterface,
    private readonly matrixBotService: MatrixBotService,
  ) {
    this.logger.log(
      'ChatController constructor called - dependencies injected successfully',
    );
  }

  /**
   * Event discussion endpoints
   */
  @Post('event/:slug/message')
  @ApiOperation({
    summary: 'Send a message to an event discussion',
    deprecated: true,
    description:
      'This endpoint has been deprecated. Use Matrix SDK directly for messaging.',
  })
  sendEventMessage(
    @Param('slug') _slug: string,
    @Body() _body: { message: string },
    @AuthUser() _user: User,
  ): { error: string; message: string } {
    return {
      error: 'DEPRECATED_ENDPOINT',
      message:
        'Message sending has been moved to frontend Matrix client. Use Matrix SDK directly for real-time messaging.',
    };
  }

  @Get('event/:slug/messages')
  @ApiOperation({
    summary: 'Get messages from an event discussion',
    deprecated: true,
    description:
      'This endpoint has been deprecated. Use Matrix SDK directly for messaging.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deprecated endpoint - use Matrix SDK for messaging',
  })
  getEventMessages(
    @Param('slug') _slug: string,
    @AuthUser() _user: User,
    @Query('limit') _limit?: number,
    @Query('from') _from?: string,
  ): { error: string; message: string } {
    return {
      error: 'DEPRECATED_ENDPOINT',
      message:
        'Message retrieval has been moved to frontend Matrix client. Use Matrix SDK directly for real-time messaging.',
    };
  }

  @Post('event/:slug/join')
  @ApiOperation({
    summary: 'Join an event chat room with appropriate permissions',
    deprecated: true,
    description:
      'DEPRECATED: Room joining will be handled automatically by Matrix Application Service (MAS). This endpoint will be removed in a future version.',
  })
  async joinEventChatRoom(
    @Param('slug') eventSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; roomId?: string; message?: string }> {
    const tenantId = request.tenantId;
    this.logger.warn(
      `DEPRECATED: joinEventChatRoom called for ${eventSlug} by user ${user.id}. This endpoint will be removed when MAS handles room joining automatically.`,
    );

    try {
      // Use ChatRoomManager which supports Matrix bot authentication
      await this.chatRoomManager.addUserToEventChatRoom(
        eventSlug,
        user.slug,
        tenantId,
      );

      // Get the room entity to return room ID
      const roomEntity = await this.chatRoomManager.ensureEventChatRoom(
        eventSlug,
        user.slug,
        tenantId,
      );

      this.logger.log(
        `Successfully joined event chat room for ${eventSlug}, with Matrix room ID: ${roomEntity.matrixRoomId || 'unknown'}`,
      );

      return {
        success: true,
        roomId: roomEntity.matrixRoomId,
        message: 'Successfully joined event chat room',
      };
    } catch (error) {
      this.logger.error(
        `Error joining event chat room for ${eventSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not join chat room: ${error.message}`,
      };
    }
  }

  @Post('event/:slug/members/:userSlug')
  @ApiOperation({ summary: 'Add a member to the event chat room' })
  async addMemberToEventDiscussion(
    @Param('slug') eventSlug: string,
    @Param('userSlug') userSlug: string,
    @AuthUser() _user: User, // Prefix with underscore to indicate unused parameter
  ): Promise<{
    success: boolean;
    roomId?: string;
    message?: string;
  }> {
    try {
      const roomInfo =
        await this.discussionService.addMemberToEventDiscussionBySlugAndGetRoomId(
          eventSlug,
          userSlug,
        );

      return {
        success: true,
        roomId: roomInfo.roomId,
        message: 'Member added to event discussion successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error adding member to event discussion: ${error.message}`,
      );
      // Return a minimal success response to avoid breaking the frontend
      return {
        success: false,
        message: error.message || 'Failed to add member to event discussion',
      };
    }
  }

  @Delete('event/:slug/members/:userSlug')
  @ApiOperation({ summary: 'Remove a member from the event chat room' })
  async removeMemberFromEventDiscussion(
    @Param('slug') eventSlug: string,
    @Param('userSlug') userSlug: string,
    @AuthUser() _user: User, // Auth required but not used directly
    @Req() request: any,
  ): Promise<void> {
    // Pass the tenant ID explicitly from the request
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Use ChatRoomManager directly instead of going through DiscussionService
    await this.chatRoomManager.removeUserFromEventChatRoom(
      eventSlug,
      userSlug,
      tenantId,
    );
  }

  /**
   * Group discussion endpoints (placeholders for future implementation)
   */
  @Post('group/:slug/message')
  @ApiOperation({
    summary: 'Send a message to a group discussion',
    deprecated: true,
    description:
      'This endpoint has been deprecated. Use Matrix SDK directly for messaging.',
  })
  sendGroupMessage(
    @Param('slug') _slug: string,
    @Body() _body: { message: string },
    @AuthUser() _user: User,
    @Req() _request: any,
  ): { error: string; message: string } {
    return {
      error: 'DEPRECATED_ENDPOINT',
      message:
        'Message sending has been moved to frontend Matrix client. Use Matrix SDK directly for real-time messaging.',
    };
  }

  @Public()
  @UseGuards(OptionalJWTAuthGuard, VisibilityGuard)
  @Get('group/:slug/messages')
  @ApiOperation({
    summary: 'Get messages from a group discussion',
    deprecated: true,
    description:
      'This endpoint has been deprecated. Use Matrix SDK directly for messaging.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deprecated endpoint - use Matrix SDK for messaging',
  })
  getGroupMessages(
    @Param('slug') _slug: string,
    @Req() _request: any,
    @Query('limit') _limit?: number,
    @Query('from') _from?: string,
    @Optional() @AuthUser() _user?: User,
  ): { error: string; message: string } {
    return {
      error: 'DEPRECATED_ENDPOINT',
      message:
        'Message retrieval has been moved to frontend Matrix client. Use Matrix SDK directly for real-time messaging.',
    };
  }

  @Post('group/:slug/join')
  @ApiOperation({
    summary: 'Join a group chat room with appropriate permissions',
    deprecated: true,
    description:
      'DEPRECATED: Room joining will be handled automatically by Matrix Application Service (MAS). This endpoint will be removed in a future version.',
  })
  async joinGroupChatRoom(
    @Param('slug') groupSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; roomId?: string; message?: string }> {
    this.logger.warn(
      `DEPRECATED: joinGroupChatRoom called for ${groupSlug} by user ${user.id}. This endpoint will be removed when MAS handles room joining automatically.`,
    );

    // Pass the tenant ID explicitly from the request
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    try {
      // Use ChatRoomManager which supports Matrix bot authentication
      await this.chatRoomManager.addUserToGroupChatRoom(
        groupSlug,
        user.slug,
        tenantId,
      );

      // Get the room ID from the group
      const result = await this.chatRoomService.ensureRoomAccess(
        'group',
        groupSlug,
        user.slug,
        tenantId,
      );

      return {
        success: result.success,
        roomId: result.roomId,
        message: result.message,
      };
    } catch (error) {
      this.logger.error(
        `Error joining group chat room for ${groupSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not join chat room: ${error.message}`,
      };
    }
  }

  @Post('group/:slug/members/:userSlug')
  @ApiOperation({ summary: 'Add a member to the group chat room' })
  async addMemberToGroupDiscussion(
    @Param('slug') groupSlug: string,
    @Param('userSlug') userSlug: string,
    @AuthUser() _user: User, // Auth required but not used directly
    @Req() request: any,
  ): Promise<void> {
    // Pass the tenant ID explicitly from the request
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    return await this.discussionService.addMemberToGroupDiscussionBySlug(
      groupSlug,
      userSlug,
      tenantId, // Pass tenant ID explicitly
    );
  }

  @Delete('group/:slug/members/:userSlug')
  @ApiOperation({ summary: 'Remove a member from the group chat room' })
  async removeMemberFromGroupDiscussion(
    @Param('slug') groupSlug: string,
    @Param('userSlug') userSlug: string,
    @AuthUser() _user: User, // Auth required but not used directly
    @Req() request: any,
  ): Promise<{ message: string }> {
    this.logger.log(
      `removeMemberFromGroupDiscussion: Starting removal of ${userSlug} from group ${groupSlug}`,
    );

    try {
      // Pass the tenant ID explicitly from the request
      const tenantId = request.tenantId;
      if (!tenantId) {
        this.logger.error(
          'removeMemberFromGroupDiscussion: Tenant ID is required',
        );
        throw new Error('Tenant ID is required');
      }

      this.logger.log(
        `removeMemberFromGroupDiscussion: Using tenant ID ${tenantId}`,
      );

      // Use ChatRoomManager directly instead of going through DiscussionService
      this.logger.log(
        `removeMemberFromGroupDiscussion: About to call chatRoomManager.removeUserFromGroupChatRoom`,
      );

      try {
        await this.chatRoomManager.removeUserFromGroupChatRoom(
          groupSlug,
          userSlug,
          tenantId,
        );

        this.logger.log(
          `removeMemberFromGroupDiscussion: ChatRoomManager call completed successfully`,
        );

        return { message: 'Member removed successfully' };
      } catch (chatRoomError) {
        this.logger.error(
          `removeMemberFromGroupDiscussion: ChatRoomManager call failed: ${chatRoomError.message}`,
          chatRoomError.stack,
        );

        // Re-throw with more context
        throw new Error(
          `Failed to remove user from group chat room: ${chatRoomError.message}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `removeMemberFromGroupDiscussion: Error removing ${userSlug} from group ${groupSlug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Direct message endpoints (placeholders for future implementation)
   */
  @Post('direct/:recipientId/message')
  @ApiOperation({ summary: 'Send a direct message to a user' })
  async sendDirectMessage(
    @Param('recipientId') recipientId: number,
    @Body() body: { message: string },
    @AuthUser() user: User,
  ): Promise<{ id: string }> {
    return await this.discussionService.sendDirectMessage(
      recipientId,
      user.id,
      body,
    );
  }

  @Get('direct/:userId/messages')
  @ApiOperation({ summary: 'Get direct messages between users' })
  @ApiResponse({
    status: 200,
    description: 'Direct messages between users',
    type: DiscussionMessagesResponseDto,
  })
  async getDirectMessages(
    @Param('userId') otherUserId: number,
    @AuthUser() user: User,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
  ): Promise<DiscussionMessagesResponseDto> {
    return await this.discussionService.getDirectMessages(
      user.id,
      otherUserId,
      limit,
      from,
    );
  }

  /**
   * Admin endpoints for chat room management
   */
  @Delete('admin/event/:slug/chatroom')
  @UseGuards(JWTAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiOperation({ summary: 'Delete an event chat room (admin only)' })
  async deleteEventChatRoom(
    @Param('slug') eventSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; message?: string }> {
    const tenantId = request.tenantId;
    this.logger.log(
      `Admin user ${user.id} attempting to delete event chat room for ${eventSlug} in tenant ${tenantId}`,
    );

    try {
      await this.discussionService.deleteEventChatRoom(eventSlug, tenantId);

      this.logger.log(`Successfully deleted event chat room for ${eventSlug}`);

      return {
        success: true,
        message: 'Chat room deleted successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error deleting event chat room for ${eventSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not delete chat room: ${error.message}`,
      };
    }
  }

  @Post('admin/event/:slug/chatroom')
  @UseGuards(JWTAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiOperation({ summary: 'Create a new event chat room (admin only)' })
  async createEventChatRoom(
    @Param('slug') eventSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; roomId?: string; message?: string }> {
    const tenantId = request.tenantId;
    this.logger.log(
      `Admin user ${user.id} attempting to create event chat room for ${eventSlug} in tenant ${tenantId}`,
    );

    try {
      const result = await this.chatRoomService.ensureRoomAccess(
        'event',
        eventSlug,
        user.slug,
        tenantId,
      );

      this.logger.log(
        `Successfully created event chat room for ${eventSlug}, with Matrix room ID: ${result.roomId || 'unknown'}`,
      );

      return {
        success: result.success,
        roomId: result.roomId,
        message: result.message || 'Chat room created successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error creating event chat room for ${eventSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not create chat room: ${error.message}`,
      };
    }
  }

  @Delete('admin/group/:slug/chatroom')
  @UseGuards(JWTAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiOperation({ summary: 'Delete a group chat room (admin only)' })
  async deleteGroupChatRoom(
    @Param('slug') groupSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; message?: string }> {
    const tenantId = request.tenantId;
    this.logger.log(
      `Admin user ${user.id} attempting to delete group chat room for ${groupSlug} in tenant ${tenantId}`,
    );

    try {
      await this.discussionService.deleteGroupChatRoom(groupSlug, tenantId);

      this.logger.log(`Successfully deleted group chat room for ${groupSlug}`);

      return {
        success: true,
        message: 'Chat room deleted successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error deleting group chat room for ${groupSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not delete chat room: ${error.message}`,
      };
    }
  }

  @Post('admin/group/:slug/chatroom')
  @UseGuards(JWTAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiOperation({ summary: 'Create a new group chat room (admin only)' })
  async createGroupChatRoom(
    @Param('slug') groupSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; roomId?: string; message?: string }> {
    const tenantId = request.tenantId;
    this.logger.log(
      `Admin user ${user.id} attempting to create group chat room for ${groupSlug} in tenant ${tenantId}`,
    );

    try {
      const result = await this.chatRoomService.ensureRoomAccess(
        'group',
        groupSlug,
        user.slug,
        tenantId,
      );

      this.logger.log(
        `Successfully created group chat room for ${groupSlug}, with Matrix room ID: ${result.roomId || 'unknown'}`,
      );

      return {
        success: result.success,
        roomId: result.roomId,
        message: result.message || 'Chat room created successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error creating group chat room for ${groupSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not create chat room: ${error.message}`,
      };
    }
  }

  @Post('event/:slug/ensure-room')
  @ApiOperation({
    summary: 'Ensure event Matrix room exists and is accessible',
    deprecated: true,
    description:
      'DEPRECATED: Matrix rooms will be created automatically by the Application Service (MAS). This endpoint will be removed in a future version.',
  })
  async ensureEventRoom(
    @Param('slug') eventSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{
    success: boolean;
    roomId?: string;
    recreated: boolean;
    message?: string;
  }> {
    this.logger.warn(
      `DEPRECATED: ensureEventRoom called for ${eventSlug} by user ${user.id}. This endpoint will be removed when MAS handles room creation automatically.`,
    );

    try {
      // Use ChatRoomManager which supports Matrix bot authentication
      const result = await this.chatRoomManager.ensureEventChatRoom(
        eventSlug,
        user.slug,
        request.tenantId,
      );

      return {
        success: true,
        roomId: result.matrixRoomId,
        recreated: false, // ChatRoomEntity doesn't track recreation
        message: 'Room ensured successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error ensuring event room for ${eventSlug}: ${error.message}`,
      );
      return {
        success: false,
        recreated: false,
        message: `Could not ensure room: ${error.message}`,
      };
    }
  }

  @Post('group/:slug/ensure-room')
  @ApiOperation({
    summary: 'Ensure group Matrix room exists and is accessible',
    deprecated: true,
    description:
      'DEPRECATED: Matrix rooms will be created automatically by the Application Service (MAS). This endpoint will be removed in a future version.',
  })
  async ensureGroupRoom(
    @Param('slug') groupSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{
    success: boolean;
    roomId?: string;
    recreated: boolean;
    message?: string;
  }> {
    this.logger.warn(
      `DEPRECATED: ensureGroupRoom called for ${groupSlug} by user ${user.id}. This endpoint will be removed when MAS handles room creation automatically.`,
    );

    try {
      // Use ChatRoomService which tracks room recreation
      const result = await this.chatRoomService.ensureRoomAccess(
        'group',
        groupSlug,
        user.slug,
        request.tenantId,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Error ensuring group room for ${groupSlug}: ${error.message}`,
      );
      return {
        success: false,
        recreated: false,
        message: `Could not ensure room: ${error.message}`,
      };
    }
  }

  /**
   * Diagnostic endpoints for Matrix room permission testing
   */
  @Get('admin/room/:roomType/:slug/permissions-diagnostic')
  @UseGuards(JWTAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiOperation({
    summary:
      'Diagnose Matrix room permissions and test bot capabilities (admin only)',
    description:
      'Tests if the Matrix bot has sufficient permissions in a room and attempts to fix them if needed',
  })
  async diagnoseRoomPermissions(
    @Param('roomType') roomType: 'event' | 'group',
    @Param('slug') slug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{
    success: boolean;
    roomId?: string;
    diagnostics?: {
      botUserId: string;
      botCurrentPowerLevel: number;
      botCanInvite: boolean;
      botCanKick: boolean;
      botCanModifyPowerLevels: boolean;
      permissionFixAttempted: boolean;
      permissionFixSuccessful: boolean;
      roomExists: boolean;
      errors: string[];
    };
    message?: string;
  }> {
    const tenantId = request.tenantId;
    this.logger.log(
      `Admin user ${user.id} requesting permissions diagnostic for ${roomType} ${slug} in tenant ${tenantId}`,
    );

    try {
      // First, ensure the room exists and get its ID
      const roomResult = await this.chatRoomService.ensureRoomAccess(
        roomType,
        slug,
        user.slug,
        tenantId,
      );

      if (!roomResult.success || !roomResult.roomId) {
        return {
          success: false,
          message: `Could not access ${roomType} room for ${slug}: ${roomResult.message}`,
        };
      }

      const roomId = roomResult.roomId;
      const botUserId = this.matrixBotService.getBotUserId(tenantId);

      this.logger.log(
        `Running diagnostics on room ${roomId} for bot ${botUserId}`,
      );

      const diagnostics = {
        botUserId,
        botCurrentPowerLevel: 0,
        botCanInvite: false,
        botCanKick: false,
        botCanModifyPowerLevels: false,
        permissionFixAttempted: false,
        permissionFixSuccessful: false,
        roomExists: false,
        errors: [] as string[],
      };

      // Test 1: Check if room exists and bot can access it
      try {
        const roomExists = await this.matrixRoomService.verifyRoomExists(
          roomId,
          tenantId,
        );
        diagnostics.roomExists = roomExists;

        if (!roomExists) {
          diagnostics.errors.push(
            'Room does not exist or bot cannot access it',
          );
        }
      } catch (error) {
        diagnostics.errors.push(
          `Room existence check failed: ${error.message}`,
        );
      }

      // Test 2: Check if bot is in the room
      try {
        const botInRoom = await this.matrixBotService.isBotInRoom(
          roomId,
          tenantId,
        );
        if (!botInRoom) {
          this.logger.log(`Bot not in room ${roomId}, attempting to join...`);
          await this.matrixBotService.joinRoom(roomId, tenantId);
        }
      } catch (error) {
        diagnostics.errors.push(`Bot room join failed: ${error.message}`);
      }

      // Test 3: Test bot's ability to invite users (requires moderate permissions)
      try {
        // We'll test invite capability by trying to invite the current user
        // This should be safe since they already have access to the room
        await this.matrixBotService.inviteUser(
          roomId,
          `@${user.slug}:matrix.openmeet.net`,
          tenantId,
        );
        diagnostics.botCanInvite = true;
        this.logger.log(`✅ Bot can invite users to room ${roomId}`);
      } catch (error) {
        diagnostics.botCanInvite = false;
        diagnostics.errors.push(`Bot invite test failed: ${error.message}`);
        this.logger.log(
          `❌ Bot cannot invite users to room ${roomId}: ${error.message}`,
        );
      }

      // Test 4: Test bot's ability to kick users (requires moderate permissions)
      // We'll simulate this by testing the remove method, but won't actually remove the user
      try {
        // Note: We won't actually remove the user, just test if the method would work
        // The removeUser method should handle "user not in room" gracefully
        await this.matrixBotService.removeUser(
          roomId,
          `@nonexistent-user:matrix.openmeet.net`,
          tenantId,
        );
        diagnostics.botCanKick = true;
        this.logger.log(`✅ Bot can kick users from room ${roomId}`);
      } catch (error) {
        // Check if error is about permissions vs user not found
        const errorMsg = error.message || error.toString();
        if (
          errorMsg.includes('not found') ||
          errorMsg.includes('not in room')
        ) {
          // This is expected - user doesn't exist, but bot has kick permissions
          diagnostics.botCanKick = true;
          this.logger.log(
            `✅ Bot can kick users from room ${roomId} (tested with non-existent user)`,
          );
        } else {
          diagnostics.botCanKick = false;
          diagnostics.errors.push(`Bot kick test failed: ${error.message}`);
          this.logger.log(
            `❌ Bot cannot kick users from room ${roomId}: ${error.message}`,
          );
        }
      }

      // Test 5: Attempt to fix permissions using syncPermissions
      if (!diagnostics.botCanKick || !diagnostics.botCanInvite) {
        this.logger.log(`Attempting to fix permissions for room ${roomId}...`);
        diagnostics.permissionFixAttempted = true;

        try {
          // Try to elevate bot to admin level
          const powerLevels = {
            [botUserId]: 100, // Admin level for bot
          };

          await this.matrixBotService.syncPermissions(
            roomId,
            powerLevels,
            tenantId,
          );
          diagnostics.permissionFixSuccessful = true;
          this.logger.log(
            `✅ Successfully fixed permissions for room ${roomId}`,
          );

          // Re-test capabilities after fix
          try {
            await this.matrixBotService.inviteUser(
              roomId,
              `@${user.slug}:matrix.openmeet.net`,
              tenantId,
            );
            diagnostics.botCanInvite = true;
          } catch (retestError) {
            diagnostics.errors.push(
              `Post-fix invite test failed: ${retestError.message}`,
            );
          }
        } catch (error) {
          diagnostics.permissionFixSuccessful = false;
          diagnostics.errors.push(`Permission fix failed: ${error.message}`);
          this.logger.error(
            `❌ Failed to fix permissions for room ${roomId}: ${error.message}`,
          );
        }
      }

      // Test 6: Get bot's actual power level from Matrix room state
      try {
        diagnostics.botCurrentPowerLevel =
          await this.matrixBotService.getBotPowerLevel(roomId, tenantId);
        diagnostics.botCanModifyPowerLevels =
          diagnostics.botCurrentPowerLevel >= 50;

        this.logger.log(
          `✅ Bot actual power level in room ${roomId}: ${diagnostics.botCurrentPowerLevel}`,
        );
      } catch (error) {
        diagnostics.errors.push(`Power level query failed: ${error.message}`);
        diagnostics.botCurrentPowerLevel = -1; // Indicate unknown/error state
        diagnostics.botCanModifyPowerLevels = false;
      }

      this.logger.log(`Diagnostics complete for room ${roomId}:`, diagnostics);

      return {
        success: true,
        roomId,
        diagnostics,
        message: `Diagnostics completed. Bot has ${diagnostics.botCanKick && diagnostics.botCanInvite ? 'sufficient' : 'insufficient'} permissions.`,
      };
    } catch (error) {
      this.logger.error(
        `Error running room diagnostics for ${roomType} ${slug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not run diagnostics: ${error.message}`,
      };
    }
  }

  /**
   * Admin endpoint to list all rooms with permission issues
   */
  @Get('admin/rooms/permission-issues')
  @UseGuards(JWTAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiOperation({
    summary: 'List all rooms with Matrix permission issues (admin only)',
    description:
      'Scans all chat rooms and identifies those where bots have insufficient permissions',
  })
  async listRoomsWithPermissionIssues(
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{
    success: boolean;
    roomsWithIssues: Array<{
      roomType: 'event' | 'group';
      slug: string;
      roomId: string;
      botCurrentPowerLevel: number;
      botExpectedPowerLevel: number;
      canBeFixed: boolean;
      issues: string[];
    }>;
    summary: {
      totalRooms: number;
      roomsWithIssues: number;
      fixableRooms: number;
    };
    message?: string;
  }> {
    const tenantId = request.tenantId;
    this.logger.log(
      `Admin user ${user.id} requesting list of rooms with permission issues in tenant ${tenantId}`,
    );

    try {
      const result =
        await this.chatRoomService.findRoomsWithPermissionIssues(tenantId);

      return {
        success: true,
        ...result,
        message: `Found ${result.roomsWithIssues.length} rooms with permission issues`,
      };
    } catch (error) {
      this.logger.error(
        `Error listing rooms with permission issues: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        roomsWithIssues: [],
        summary: {
          totalRooms: 0,
          roomsWithIssues: 0,
          fixableRooms: 0,
        },
        message: `Could not list rooms: ${error.message}`,
      };
    }
  }

  /**
   * Admin endpoint to fix permissions for specific rooms
   */
  @Post('admin/rooms/fix-permissions')
  @UseGuards(JWTAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiOperation({
    summary: 'Fix Matrix permissions for specified rooms (admin only)',
    description:
      'Attempts to fix bot permissions for the provided list of room IDs',
  })
  async fixRoomPermissions(
    @Body() body: { roomIds: string[] },
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{
    success: boolean;
    results: Array<{
      roomId: string;
      fixed: boolean;
      newPowerLevel: number;
      error?: string;
    }>;
    summary: {
      totalAttempted: number;
      successfulFixes: number;
      failedFixes: number;
    };
    message?: string;
  }> {
    const tenantId = request.tenantId;
    const { roomIds } = body;

    this.logger.log(
      `Admin user ${user.id} attempting to fix permissions for ${roomIds.length} rooms in tenant ${tenantId}`,
    );

    try {
      const result = await this.chatRoomService.fixRoomPermissions(
        roomIds,
        tenantId,
      );

      return {
        success: true,
        ...result,
        message: `Fixed permissions for ${result.summary.successfulFixes}/${result.summary.totalAttempted} rooms`,
      };
    } catch (error) {
      this.logger.error(
        `Error fixing room permissions: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        results: [],
        summary: {
          totalAttempted: roomIds.length,
          successfulFixes: 0,
          failedFixes: roomIds.length,
        },
        message: `Could not fix room permissions: ${error.message}`,
      };
    }
  }
}
