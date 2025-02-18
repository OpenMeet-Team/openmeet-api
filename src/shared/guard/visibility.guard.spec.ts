import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { VisibilityGuard } from './visibility.guard';
import { EventQueryService } from '../../event/services/event-query.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { GroupService } from '../../group/group.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import {
  EventVisibility,
  GroupVisibility,
} from '../../core/constants/constant';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';
import { mockEventQueryService } from '../../test/mocks';

describe('VisibilityGuard', () => {
  let guard: VisibilityGuard;
  let eventQueryService: jest.Mocked<EventQueryService>;
  let groupService: jest.Mocked<GroupService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisibilityGuard,
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
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
    eventQueryService = module.get(EventQueryService);
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
      mockEventQueryService.findEventBySlug.mockResolvedValueOnce({
        visibility: EventVisibility.Public,
      } as unknown as EventEntity);

      const context = mockContext({
        headers: { 'x-event-slug': 'test-event' },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should throw NotFoundException when event not found', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValueOnce(
        null as unknown as EventEntity,
      );

      const context = mockContext({
        headers: { 'x-event-slug': 'non-existent-event' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for private event without user', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValueOnce({
        visibility: EventVisibility.Private,
      } as unknown as EventEntity);

      const context = mockContext({
        headers: { 'x-event-slug': 'private-event' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should check both header and params for event slug', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValueOnce({
        visibility: EventVisibility.Public,
      } as unknown as EventEntity);

      const context = mockContext({
        headers: { 'x-event-slug': 'header-event' },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(eventQueryService.findEventBySlug).toHaveBeenCalledWith(
        'header-event',
      );
    });
  });

  describe('canActivate - Groups', () => {
    it('should allow access to public groups', async () => {
      const mockGroup = {
        visibility: GroupVisibility.Public,
      } as unknown as GroupEntity;
      groupService.findGroupBySlug.mockResolvedValue(mockGroup);

      const context = mockContext({
        headers: { 'x-group-slug': 'test-group' },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should throw NotFoundException when group not found', async () => {
      groupService.findGroupBySlug.mockResolvedValue(
        null as unknown as GroupEntity,
      );

      const context = mockContext({
        headers: { 'x-group-slug': 'non-existent-group' },
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
        headers: { 'x-group-slug': 'private-group' },
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
    it('should require authentication for events with authenticated visibility', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValueOnce({
        visibility: EventVisibility.Authenticated,
      } as unknown as EventEntity);

      const context = mockContext({
        params: { slug: 'auth-event' },
        headers: { 'x-event-slug': 'auth-event' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow authenticated users to access authenticated events', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValueOnce({
        visibility: EventVisibility.Authenticated,
      } as unknown as EventEntity);

      const context = mockContext({
        headers: { 'x-event-slug': 'auth-event' },
        user: { id: 1 },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
