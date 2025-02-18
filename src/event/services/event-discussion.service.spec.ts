import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { TESTING_TENANT_ID } from '../../../test/utils/constants';
import {
  mockEvent,
  mockTenantConnectionService,
  mockRepository,
  mockUser,
  mockZulipMessageResponse,
  mockUserService,
} from '../../test/mocks';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventDiscussionService } from './event-discussion.service';
import { ZulipService } from '../../zulip/zulip.service';
import { UserService } from '../../user/user.service';

describe('EventDiscussionService', () => {
  let service: EventDiscussionService;

  const mockZulipService = {
    sendUserMessage: jest.fn(),
    updateUserMessage: jest.fn(),
    deleteAdminMessage: jest.fn(),
    getInitialisedClient: jest.fn(),
    subscribeAdminToChannel: jest.fn(),
    getAdminStreamId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventDiscussionService,
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: ZulipService,
          useValue: mockZulipService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: getRepositoryToken(EventEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = await module.resolve<EventDiscussionService>(
      EventDiscussionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendEventDiscussionMessage', () => {
    it('should send an event discussion message', async () => {
      jest.spyOn(mockRepository, 'findOne').mockResolvedValue(mockEvent);
      mockZulipService.getAdminStreamId.mockResolvedValue({ id: 1 });
      mockZulipService.sendUserMessage.mockResolvedValue(
        mockZulipMessageResponse,
      );
      mockUserService.getUserById.mockResolvedValue({
        ...mockUser,
        reload: jest.fn(),
      });

      const result = await service.sendEventDiscussionMessage(
        mockEvent.slug,
        mockUser.id,
        { message: 'Test Message', topicName: 'Test Topic' },
      );

      expect(result).toEqual(mockZulipMessageResponse);
    });
  });

  describe('updateEventDiscussionMessage', () => {
    it('should update an event discussion message', async () => {
      mockUserService.getUserById.mockResolvedValue(mockUser);
      mockZulipService.updateUserMessage.mockResolvedValue(
        mockZulipMessageResponse,
      );

      const result = await service.updateEventDiscussionMessage(
        1,
        'Updated Message',
        mockUser.id,
      );

      expect(result).toEqual(mockZulipMessageResponse);
    });
  });

  describe('deleteEventDiscussionMessage', () => {
    it('should delete an event discussion message', async () => {
      mockZulipService.deleteAdminMessage.mockResolvedValue(
        mockZulipMessageResponse,
      );

      const result = await service.deleteEventDiscussionMessage(1);

      expect(result).toEqual(mockZulipMessageResponse);
    });
  });
});
