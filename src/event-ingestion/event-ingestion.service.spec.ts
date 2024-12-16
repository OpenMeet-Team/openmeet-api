import { Test, TestingModule } from '@nestjs/testing';
import { EventIngestionService } from './event-ingestion.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import axios from 'axios';
import { OpenAI } from 'openai';

// Create a proper mock for OpenAI
const mockCreateCompletion = jest.fn();
const mockOpenAI = {
  chat: {
    completions: {
      create: mockCreateCompletion,
    },
  },
};

jest.mock('openai', () => ({
  OpenAI: jest.fn(() => mockOpenAI),
}));

// Mock axios
jest.mock('axios');

describe('EventIngestionService', () => {
  let service: EventIngestionService;
  let mockTenantConnectionService: jest.Mocked<TenantConnectionService>;

  beforeEach(async () => {
    mockTenantConnectionService = {
      getCurrentTenant: jest.fn().mockResolvedValue({ id: 'test-tenant' }),
      onModuleInit: jest.fn(),
      getTenantConnection: jest.fn(),
      getTenantDataSource: jest.fn(),
      setCurrentTenant: jest.fn(),
      clearCurrentTenant: jest.fn(),
    } as unknown as jest.Mocked<TenantConnectionService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventIngestionService,
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
      ],
    }).compile();

    service = module.get<EventIngestionService>(EventIngestionService);
    
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('processTextForEvents', () => {
    it('should successfully extract multiple events from text', async () => {
      const mockEvents = [
        {
          name: 'Tech Conference 2024',
          description: 'Annual tech conference',
          startDate: '2024-01-01T09:00:00Z',
          endDate: '2024-01-01T17:00:00Z',
          location: '123 Main St, City, State 12345',
          categoryId: 1,
          type: 'in-person'
        },
        {
          name: 'Coding Workshop',
          description: 'Learn to code workshop',
          startDate: '2024-01-02T10:00:00Z',
          endDate: '2024-01-02T15:00:00Z',
          location: '456 Tech Ave, City, State 12345',
          categoryId: 4,
          type: 'hybrid',
          locationOnline: 'https://zoom.us/meeting'
        }
      ];

      // Mock OpenAI response
      mockCreateCompletion.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ events: mockEvents })
            }
          }
        ]
      });

      // Mock geocoding responses
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: [{ lat: '40.7128', lon: '-74.0060' }] })  // First event
        .mockResolvedValueOnce({ data: [{ lat: '40.7589', lon: '-73.9851' }] }); // Second event

      const result = await service.processTextForEvents('Sample text with multiple events');

      // Verify OpenAI was called with correct parameters
      expect(mockCreateCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      );

      // Verify multiple events were processed
      expect(result).toHaveLength(2);
      
      // Verify first event
      expect(result[0]).toMatchObject({
        ...mockEvents[0],
        lat: '40.7128',
        lon: '-74.0060'
      });

      // Verify second event
      expect(result[1]).toMatchObject({
        ...mockEvents[1],
        lat: '40.7589',
        lon: '-73.9851'
      });

      // Verify geocoding was called twice
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    it('should handle empty or invalid text input', async () => {
      mockCreateCompletion.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ events: [] })
            }
          }
        ]
      });

      const result = await service.processTextForEvents('');
      expect(result).toHaveLength(0);
    });

    it('should handle geocoding failures gracefully', async () => {
      const mockEvent = {
        name: 'Tech Conference 2024',
        description: 'Annual tech conference',
        startDate: '2024-01-01T09:00:00Z',
        location: '123 Main St, City, State 12345',
        categoryId: 1,
        type: 'in-person'
      };

      mockCreateCompletion.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ events: [mockEvent] })
            }
          }
        ]
      });

      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Geocoding failed'));

      const result = await service.processTextForEvents('Sample event text');
      expect(result).toHaveLength(1);
      expect(result[0].lat).toBeUndefined();
      expect(result[0].lon).toBeUndefined();
    });
  });

  describe('validateAndEnrichEvent', () => {
    it('should validate and enrich a valid event', async () => {
      const inputEvent = {
        name: 'Test Event',
        description: 'Test Description',
        startDate: '2024-01-01T09:00:00Z',
        location: 'Test Location',
        categoryId: 1,
        type: 'in-person'
      };

      const result = await service.validateAndEnrichEvent(inputEvent);
      
      expect(result).toMatchObject({
        ...inputEvent,
        maxAttendees: 100 // Default value
      });
    });

    it('should reject events without required fields', async () => {
      const invalidEvent = {
        description: 'Test Description',
        location: 'Test Location',
        categoryId: 1,
        type: 'in-person'
      };

      await expect(service.validateAndEnrichEvent(invalidEvent as any))
        .rejects
        .toThrow('Event must have at least a name and start date');
    });

    it('should reject events with invalid category IDs', async () => {
      const invalidEvent = {
        name: 'Test Event',
        startDate: '2024-01-01T09:00:00Z',
        categoryId: 999, // Invalid category
        type: 'in-person'
      };

      await expect(service.validateAndEnrichEvent(invalidEvent as any))
        .rejects
        .toThrow('Invalid category ID');
    });

    it('should handle invalid dates', async () => {
      const invalidEvent = {
        name: 'Test Event',
        startDate: 'invalid-date',
        categoryId: 1,
        type: 'in-person'
      };

      await expect(service.validateAndEnrichEvent(invalidEvent as any))
        .rejects
        .toThrow('Invalid date format');
    });
  });
});
