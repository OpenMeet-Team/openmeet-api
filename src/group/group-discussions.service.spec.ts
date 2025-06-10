import { Test, TestingModule } from '@nestjs/testing';
import { GroupService } from './group.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import {
  mockGroup,
  mockTenantConnectionService,
  mockCategoryService,
  mockFilesS3PresignedService,
  mockMailService,
  mockDiscussionService,
} from '../test/mocks';
import {
  mockGroupMemberService,
  mockGroupRoleService,
  mockGroupMailService,
} from '../test/mocks/group-mocks';
import {
  mockChatRoomService,
  mockMatrixService,
} from '../test/mocks/chat-mocks';
import { mockEventManagementService } from '../test/mocks/event-management-mocks';
import { mockEventQueryService } from '../test/mocks/event-query-mocks';
import { mockEventRecommendationService } from '../test/mocks/event-recommendation-mocks';
import { mockUserService } from '../test/mocks/user-mocks';
import { CategoryService } from '../category/category.service';
import { GroupMemberService } from '../group-member/group-member.service';
import { EventManagementService } from '../event/services/event-management.service';
import { EventQueryService } from '../event/services/event-query.service';
import { EventRecommendationService } from '../event/services/event-recommendation.service';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { GroupRoleService } from '../group-role/group-role.service';
import { MailService } from '../mail/mail.service';
import { UserService } from '../user/user.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupMailService } from '../group-mail/group-mail.service';
import { ChatRoomService } from '../chat/rooms/chat-room.service';
import { DiscussionService } from '../chat/services/discussion.service';
import { MatrixChatProviderAdapter } from '../chat/adapters/matrix-chat-provider.adapter';

describe('GroupService - showGroupDiscussions', () => {
  let service: GroupService;

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        // Create a minimal set of dependencies for this specific test
        {
          provide: CategoryService,
          useValue: mockCategoryService,
        },
        {
          provide: GroupMemberService,
          useValue: mockGroupMemberService,
        },
        {
          provide: EventManagementService,
          useValue: mockEventManagementService,
        },
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: EventRecommendationService,
          useValue: mockEventRecommendationService,
        },
        {
          provide: FilesS3PresignedService,
          useValue: mockFilesS3PresignedService,
        },
        {
          provide: GroupRoleService,
          useValue: mockGroupRoleService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: MatrixChatProviderAdapter,
          useValue: mockMatrixService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: GroupMailService,
          useValue: mockGroupMailService,
        },
        {
          provide: ChatRoomService,
          useValue: mockChatRoomService,
        },
        {
          provide: DiscussionService,
          useValue: mockDiscussionService,
        },
      ],
    }).compile();

    service = await module.resolve<GroupService>(GroupService);
    await service.getTenantSpecificGroupRepository();
  });

  describe('showGroupDiscussions', () => {
    it('should delegate to discussion service and return messages', async () => {
      // Mock discussion service to return empty messages
      mockDiscussionService.getGroupDiscussionMessages.mockResolvedValue({
        messages: [],
        end: '',
        roomId: '!test:matrix.org',
      });

      const result = await service.showGroupDiscussions(mockGroup.slug);

      expect(result).toEqual({ messages: [] });
      expect(
        mockDiscussionService.getGroupDiscussionMessages,
      ).toHaveBeenCalledWith(
        mockGroup.slug,
        null, // null userId for unauthenticated access
        50, // default limit
        undefined, // no 'from' parameter
        TESTING_TENANT_ID,
      );
    });

    it('should return actual messages when discussion service provides them', async () => {
      const mockMessages = [
        { id: 'msg_1', content: 'Hello world', sender: 'user1' },
        { id: 'msg_2', content: 'How are you?', sender: 'user2' },
      ];

      mockDiscussionService.getGroupDiscussionMessages.mockResolvedValue({
        messages: mockMessages,
        end: 'end_token',
        roomId: '!test:matrix.org',
      });

      const result = await service.showGroupDiscussions('group-with-messages');

      expect(result).toEqual({ messages: mockMessages });
    });

    it('should handle discussion service errors gracefully', async () => {
      mockDiscussionService.getGroupDiscussionMessages.mockRejectedValue(
        new Error('Matrix service unavailable'),
      );

      const result = await service.showGroupDiscussions('failing-group');

      expect(result).toEqual({ messages: [] });
    });
  });
});
