import { Test, TestingModule } from '@nestjs/testing';
import { DIDApiController } from './did-api.controller';
import { DIDApiService } from './did-api.service';
import { Reflector } from '@nestjs/core';
import { User } from '../user/domain/user';
import {
  GroupVisibility,
  EventType,
  EventVisibility,
  EventStatus,
  EventAttendeeStatus,
} from '../core/constants/constant';

describe('DIDApiController', () => {
  let controller: DIDApiController;
  let service: jest.Mocked<DIDApiService>;

  const mockUser = { id: 1 } as User;

  beforeEach(async () => {
    const mockService = {
      getMyGroups: jest.fn(),
      getMyEvents: jest.fn(),
      getEventBySlug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DIDApiController],
      providers: [{ provide: DIDApiService, useValue: mockService }, Reflector],
    }).compile();

    controller = module.get<DIDApiController>(DIDApiController);
    service = module.get(DIDApiService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyGroups', () => {
    it('should call service.getMyGroups with the user ID', async () => {
      const expectedResult = {
        groups: [
          {
            slug: 'test-group',
            name: 'Test Group',
            description: 'A test group',
            visibility: GroupVisibility.Private,
            role: 'member',
            memberCount: 5,
            upcomingEventCount: 2,
            image: null,
          },
        ],
      };
      service.getMyGroups.mockResolvedValue(expectedResult as any);

      const result = await controller.getMyGroups(mockUser);

      expect(service.getMyGroups).toHaveBeenCalledWith(1);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getMyEvents', () => {
    it('should call service.getMyEvents with user ID and query', async () => {
      const query = { includePublic: true, limit: 10 };
      const expectedResult = { events: [], cursor: null };
      service.getMyEvents.mockResolvedValue(expectedResult);

      const result = await controller.getMyEvents(mockUser, query);

      expect(service.getMyEvents).toHaveBeenCalledWith(1, query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getEventBySlug', () => {
    it('should call service.getEventBySlug with user ID and slug', async () => {
      const expectedResult = {
        slug: 'test-event',
        name: 'Test Event',
        description: 'A test event',
        startDate: new Date(),
        endDate: new Date(),
        location: null,
        locationOnline: null,
        type: EventType.InPerson,
        visibility: EventVisibility.Private,
        status: EventStatus.Published,
        atprotoUri: null,
        group: { slug: 'test-group', name: 'Test Group', role: 'member' },
        attendeesCount: 5,
        userRsvpStatus: EventAttendeeStatus.Confirmed,
        image: null,
      };
      service.getEventBySlug.mockResolvedValue(expectedResult as any);

      const result = await controller.getEventBySlug(mockUser, 'test-event');

      expect(service.getEventBySlug).toHaveBeenCalledWith(1, 'test-event');
      expect(result).toEqual(expectedResult);
    });
  });
});
