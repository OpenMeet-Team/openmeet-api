import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { VisibilityGuard } from './visibility.guard';
import { EventService } from '../../event/event.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { GroupService } from '../../group/group.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import {
  EventVisibility,
  GroupVisibility,
} from '../../core/constants/constant';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';

describe('VisibilityGuard', () => {
  let guard: VisibilityGuard;
  let eventService: jest.Mocked<EventService>;
  let groupService: jest.Mocked<GroupService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisibilityGuard,
        {
          provide: EventService,
          useValue: {
            findEventBySlug: jest.fn(),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            findEventAttendeeByUserId: jest.fn(),
          },
        },
        {
          provide: GroupService,
          useValue: {
            findGroupBySlug: jest.fn(),
          },
        },
        {
          provide: GroupMemberService,
          useValue: {
            findGroupMemberByUserId: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<VisibilityGuard>(VisibilityGuard);
    eventService = module.get(EventService);
    groupService = module.get(GroupService);
  });

  const mockContext = (params: any = {}) => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: params.headers || {},
          params: params.params || {},
          user: params.user,
        }),
      }),
    } as ExecutionContext;
    return context;
  };

  describe('canActivate - Events', () => {
    it('should allow access to public events', async () => {
      const mockEvent = {
        visibility: EventVisibility.Public,
      } as unknown as EventEntity;
      eventService.findEventBySlug.mockResolvedValue(mockEvent);

      const context = mockContext({
        params: { slug: 'test-event' },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should throw NotFoundException when event not found', async () => {
      eventService.findEventBySlug.mockResolvedValue(
        null as unknown as EventEntity,
      );

      const context = mockContext({
        params: { slug: 'non-existent-event' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for private event without user', async () => {
      const mockEvent = {
        visibility: EventVisibility.Private,
      } as unknown as EventEntity;
      eventService.findEventBySlug.mockResolvedValue(mockEvent);

      const context = mockContext({
        params: { slug: 'private-event' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should check both header and params for event slug', async () => {
      const mockEvent = {
        visibility: EventVisibility.Public,
      } as unknown as EventEntity;
      eventService.findEventBySlug.mockResolvedValue(mockEvent);

      const context = mockContext({
        headers: { 'x-event-slug': 'header-event' },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(eventService.findEventBySlug).toHaveBeenCalledWith('header-event');
    });
  });

  describe('canActivate - Groups', () => {
    it('should allow access to public groups', async () => {
      const mockGroup = {
        visibility: GroupVisibility.Public,
      } as unknown as GroupEntity;
      groupService.findGroupBySlug.mockResolvedValue(mockGroup);

      const context = mockContext({
        params: { groupSlug: 'test-group' },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should throw NotFoundException when group not found', async () => {
      groupService.findGroupBySlug.mockResolvedValue(
        null as unknown as GroupEntity,
      );

      const context = mockContext({
        params: { groupSlug: 'non-existent-group' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for private group without user', async () => {
      const mockGroup = {
        visibility: GroupVisibility.Private,
      } as unknown as GroupEntity;
      groupService.findGroupBySlug.mockResolvedValue(mockGroup);

      const context = mockContext({
        params: { groupSlug: 'private-group' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should check both header and params for group slug', async () => {
      const mockGroup = {
        visibility: GroupVisibility.Public,
      } as unknown as GroupEntity;
      groupService.findGroupBySlug.mockResolvedValue(mockGroup);

      const context = mockContext({
        headers: { 'x-group-slug': 'header-group' },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(groupService.findGroupBySlug).toHaveBeenCalledWith('header-group');
    });
  });

  describe('canActivate - Authentication Required', () => {
    it('should require authentication for private events with authenticated visibility', async () => {
      const mockEvent = {
        visibility: EventVisibility.Authenticated,
      } as unknown as EventEntity;
      eventService.findEventBySlug.mockResolvedValue(mockEvent);

      const context = mockContext({
        params: { slug: 'auth-event' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow authenticated users to access authenticated events', async () => {
      const mockEvent = {
        visibility: EventVisibility.Authenticated,
      } as unknown as EventEntity;
      eventService.findEventBySlug.mockResolvedValue(mockEvent);

      const context = mockContext({
        params: { slug: 'auth-event' },
        user: { id: 1 },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
