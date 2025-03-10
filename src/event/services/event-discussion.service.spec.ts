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
  mockMatrixMessageResponse,
  mockUserService,
} from '../../test/mocks';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventDiscussionService } from './event-discussion.service';
import { MatrixService } from '../../matrix/matrix.service';
import { UserService } from '../../user/user.service';

describe('EventDiscussionService', () => {
  let service: EventDiscussionService;

  const mockMatrixService = {
    sendMessage: jest.fn(),
    updateMessage: jest.fn(),
    deleteMessage: jest.fn(),
    getInitializedClient: jest.fn(),
    createRoom: jest.fn(),
    getRoomId: jest.fn(),
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
          provide: MatrixService,
          useValue: mockMatrixService,
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
      mockMatrixService.getRoomId.mockResolvedValue('!room123:example.com');
      mockMatrixService.sendMessage.mockResolvedValue(
        mockMatrixMessageResponse,
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

      expect(result).toEqual(mockMatrixMessageResponse);
    });
  });

  describe('updateEventDiscussionMessage', () => {
    it('should update an event discussion message', async () => {
      mockUserService.getUserById.mockResolvedValue(mockUser);
      mockMatrixService.updateMessage.mockResolvedValue(
        mockMatrixMessageResponse,
      );

      const result = await service.updateEventDiscussionMessage(
        1,
        'Updated Message',
        mockUser.id,
      );

      expect(result).toEqual(mockMatrixMessageResponse);
    });
  });

  describe('deleteEventDiscussionMessage', () => {
    it('should delete an event discussion message', async () => {
      mockMatrixService.deleteMessage.mockResolvedValue(
        mockMatrixMessageResponse,
      );

      const result = await service.deleteEventDiscussionMessage(1);

      expect(result).toEqual(mockMatrixMessageResponse);
    });
  });
});
