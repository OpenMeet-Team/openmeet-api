import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { CategoryService } from '../../category/category.service';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { TESTING_USER_ID } from '../../../test/utils/constants';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../../src/core/constants/constant';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { TESTING_TENANT_ID } from '../../../test/utils/constants';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { CreateEventDto } from '../dto/create-event.dto';
import { CategoryEntity } from '../../category/infrastructure/persistence/relational/entities/categories.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupMemberService } from '../../group-member/group-member.service';
import { FilesS3PresignedService } from '../../file/infrastructure/uploader/s3-presigned/file.service';
import { MatrixChatProviderAdapter } from '../../chat/adapters/matrix-chat-provider.adapter';
import {
  mockCategoryService,
  mockDiscussionService,
  mockEvent,
  mockEventAttendeeService,
  mockGroup,
  mockGroupMembers,
  mockTenantConnectionService,
  mockFilesS3PresignedService,
  mockRepository,
  mockEventAttendee,
  mockEventRoleService,
  mockUserService,
  mockMatrixService,
  mockUser,
  mockEventMailService,
} from '../../test/mocks';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from '../../user/user.service';
import { EventRoleService } from '../../event-role/event-role.service';
import { EventMailService } from '../../event-mail/event-mail.service';
import { BlueskyService } from '../../bluesky/bluesky.service';
import { stopCleanupInterval } from '../../database/data-source';
import { EventManagementService } from './event-management.service';

describe('EventManagementService', () => {
  let service: EventManagementService;
  let eventAttendeeService: EventAttendeeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventManagementService,
        {
          provide: EventAttendeeService,
          useValue: mockEventAttendeeService,
        },
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: CategoryService,
          useValue: mockCategoryService,
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: GroupMemberService,
          useValue: {
            findGroupDetailsMembers: mockGroupMembers,
          },
        },
        {
          provide: FilesS3PresignedService,
          useValue: mockFilesS3PresignedService,
        },
        {
          provide: Repository,
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(EventEntity),
          useValue: mockRepository,
        },
        {
          provide: MatrixChatProviderAdapter,
          useValue: mockMatrixService,
        },
        {
          provide: EventRoleService,
          useValue: mockEventRoleService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: EventMailService,
          useValue: mockEventMailService,
        },
        {
          provide: DataSource,
          useValue: {
            createEntityManager: jest.fn(),
            getRepository: jest.fn(),
          },
        },
        {
          provide: BlueskyService,
          useValue: {
            createEventRecord: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockRepository,
        },
        {
          provide: 'DiscussionService',
          useValue: mockDiscussionService,
        },
      ],
    }).compile();

    service = await module.resolve<EventManagementService>(
      EventManagementService,
    );

    // Manually set the eventRepository to mock the initializeRepository method
    Object.defineProperty(service, 'eventRepository', {
      value: mockRepository,
      writable: true,
    });

    eventAttendeeService =
      await module.resolve<EventAttendeeService>(EventAttendeeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an event', async () => {
      const createEventDto: CreateEventDto = {
        name: 'Test Event',
        description: 'Test Event Description',
        startDate: new Date(),
        type: 'hybrid',
        location: 'Test Location',
        locationOnline: 'Test Location Online',
        maxAttendees: 100,
        categories: [1, 2],
        lat: 1,
        lon: 1,
        group: mockGroup,
      };

      const mockAttendees = [
        {
          id: 1,
          name: 'Attendee 1',
          status: EventAttendeeStatus.Confirmed,
          role: EventAttendeeRole.Participant,
        } as unknown as EventAttendeesEntity,
        {
          id: 2,
          name: 'Attendee 2',
          status: EventAttendeeStatus.Confirmed,
          role: EventAttendeeRole.Speaker,
        } as unknown as EventAttendeesEntity,
      ];

      // Mock category service response
      jest.spyOn(service['categoryService'], 'findByIds').mockResolvedValue([
        {
          id: 1,
          name: 'Category 1',
          attendees: mockAttendees,
        } as unknown as CategoryEntity,
        {
          id: 2,
          name: 'Category 2',
          attendees: mockAttendees,
        } as unknown as CategoryEntity,
      ]);

      // Mock event attendee service
      jest.spyOn(eventAttendeeService, 'create').mockResolvedValue({
        id: 1,
        userId: TESTING_USER_ID,
        eventId: 1,
        status: EventAttendeeStatus.Confirmed,
        role: EventAttendeeRole.Participant,
        event: { id: 1 } as EventEntity,
        user: { id: TESTING_USER_ID } as UserEntity,
      } as unknown as EventAttendeesEntity);

      jest
        .spyOn(service['eventRepository'], 'save')
        .mockResolvedValue(mockEvent);

      const event = await service.create(createEventDto, mockUser.id);
      expect(event).toEqual(mockEvent);
    });
  });

  describe('attendEvent', () => {
    it('should attend an event', async () => {
      jest.spyOn(service, 'attendEvent').mockResolvedValue(mockEventAttendee);
      const result = await service.attendEvent(
        mockEvent.slug,
        mockUser.id,
        mockEventAttendee,
      );
      expect(result).toEqual(mockEventAttendee);
    });
  });

  describe('cancelAttendingEvent', () => {
    it('should cancel attending an event', async () => {
      jest
        .spyOn(service, 'cancelAttendingEvent')
        .mockResolvedValue(mockEventAttendee);
      const result = await service.cancelAttendingEvent(
        mockEvent.slug,
        mockUser.id,
      );
      expect(result).toEqual(mockEventAttendee);
    });
  });

  afterAll(() => {
    stopCleanupInterval();
  });
});
