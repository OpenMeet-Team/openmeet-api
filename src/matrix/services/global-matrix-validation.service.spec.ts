import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GlobalMatrixValidationService } from './global-matrix-validation.service';

describe('GlobalMatrixValidationService', () => {
  let service: GlobalMatrixValidationService;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;
  let mockRepository: any;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    mockDataSource = {
      getRepository: jest.fn().mockReturnValue(mockRepository),
    } as any;

    mockEventEmitter = {
      emit: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GlobalMatrixValidationService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<GlobalMatrixValidationService>(
      GlobalMatrixValidationService,
    );
  });

  describe('isMatrixHandleUnique', () => {
    it('should return true for available handle', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.isMatrixHandleUnique('john.smith');

      expect(result).toBe(true);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { handle: 'john.smith' },
      });
    });

    it('should return false for taken handle', async () => {
      mockRepository.findOne.mockResolvedValue({ handle: 'john.smith' });

      const result = await service.isMatrixHandleUnique('john.smith');

      expect(result).toBe(false);
    });

    it('should return false for invalid handle with spaces', async () => {
      const result = await service.isMatrixHandleUnique('invalid handle');

      expect(result).toBe(false);
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return false for invalid handle with uppercase', async () => {
      const result = await service.isMatrixHandleUnique('John.Smith');

      expect(result).toBe(false);
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return false for invalid handle starting with underscore', async () => {
      const result = await service.isMatrixHandleUnique('_john.smith');

      expect(result).toBe(false);
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return false for empty handle', async () => {
      const result = await service.isMatrixHandleUnique('');

      expect(result).toBe(false);
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('registerMatrixHandle', () => {
    it('should register a valid unique handle', async () => {
      mockRepository.findOne.mockResolvedValue(null); // Handle is unique
      const mockEntity = {
        handle: 'john.smith',
        tenantId: 'tenant123',
        userId: 456,
      };
      mockRepository.create.mockReturnValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.registerMatrixHandle('john.smith', 'tenant123', 456);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { handle: 'john.smith' },
      });
      expect(mockRepository.create).toHaveBeenCalledWith({
        handle: 'john.smith',
        tenantId: 'tenant123',
        userId: 456,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockEntity);
    });

    it('should throw error for taken handle', async () => {
      mockRepository.findOne.mockResolvedValue({ handle: 'john.smith' });

      await expect(
        service.registerMatrixHandle('john.smith', 'tenant123', 456),
      ).rejects.toThrow('Matrix handle john.smith is already taken');
    });

    it('should throw error for invalid handle', async () => {
      await expect(
        service.registerMatrixHandle('Invalid Handle', 'tenant123', 456),
      ).rejects.toThrow('Invalid Matrix handle format: Invalid Handle');
    });
  });

  describe('getMatrixHandleRegistration', () => {
    it('should return registration for existing user', async () => {
      const mockRegistration = {
        id: 1,
        handle: 'john.smith',
        tenantId: 'tenant123',
        userId: 456,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepository.findOne.mockResolvedValue(mockRegistration);

      const result = await service.getMatrixHandleRegistration(
        'tenant123',
        456,
      );

      expect(result).toEqual(mockRegistration);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant123', userId: 456 },
      });
    });

    it('should return null for non-existent user', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getMatrixHandleRegistration(
        'tenant123',
        999,
      );

      expect(result).toBeNull();
    });
  });

  describe('unregisterMatrixHandle', () => {
    it('should complete successfully when handle exists', async () => {
      // Setup: Mock finding and deleting existing handle
      mockRepository.findOne.mockResolvedValue({
        handle: 'existing-handle',
        tenantId: 'tenant123',
        userId: 456,
      });
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      // Should not throw
      await expect(
        service.unregisterMatrixHandle('tenant123', 456),
      ).resolves.not.toThrow();
    });

    it('should complete successfully when no handle exists', async () => {
      // Setup: Mock no handle found
      mockRepository.findOne.mockResolvedValue(null);

      // Should not throw - graceful handling of non-existent handle
      await expect(
        service.unregisterMatrixHandle('tenant123', 999),
      ).resolves.not.toThrow();
    });

    it('should propagate database errors', async () => {
      // Setup: Mock database error during findOne
      const dbError = new Error('Database connection failed');
      mockRepository.findOne.mockRejectedValue(dbError);

      // Should propagate the database error
      await expect(
        service.unregisterMatrixHandle('tenant123', 456),
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle deletion error after finding handle', async () => {
      // Setup: Mock finding handle but deletion fails
      mockRepository.findOne.mockResolvedValue({
        handle: 'existing-handle',
        tenantId: 'tenant123',
        userId: 456,
      });
      const deleteError = new Error('Delete operation failed');
      mockRepository.delete.mockRejectedValue(deleteError);

      // Should propagate the deletion error
      await expect(
        service.unregisterMatrixHandle('tenant123', 456),
      ).rejects.toThrow('Delete operation failed');
    });
  });

  describe('suggestAvailableHandles', () => {
    it('should suggest original handle if available', async () => {
      // Mock findOne to return null for first call (handle is available)
      mockRepository.findOne.mockResolvedValue(null);

      const suggestions = await service.suggestAvailableHandles(
        'john.smith',
        3,
      );

      expect(suggestions).toContain('john.smith');
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should suggest numbered variants when original is taken', async () => {
      // Mock sequence: original taken, numbered variants available
      mockRepository.findOne
        .mockResolvedValueOnce({ handle: 'john.smith' }) // original taken
        .mockResolvedValue(null); // all variants available

      const suggestions = await service.suggestAvailableHandles(
        'john.smith',
        3,
      );

      expect(suggestions).toContain('john.smith2');
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should clean invalid characters from handle', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const suggestions = await service.suggestAvailableHandles(
        'John Smith!',
        2,
      );

      expect(suggestions).toContain('johnsmith');
      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should respect maxSuggestions limit', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const suggestions = await service.suggestAvailableHandles(
        'john.smith',
        1,
      );

      expect(suggestions).toHaveLength(1);
    });
  });

  describe('handle validation', () => {
    it('should accept valid Matrix handles', () => {
      const validHandles = [
        'john.smith',
        'john-smith',
        'johnsmith123',
        'j.smith',
        'user.name',
        'test-user-123',
        'user_name_123',
        'test_handle',
        'a',
        'x'.repeat(255),
      ];

      validHandles.forEach((handle) => {
        expect(service['isValidMatrixHandle'](handle)).toBe(true);
      });
    });

    it('should reject invalid Matrix handles', () => {
      const invalidHandles = [
        '', // empty
        'John.Smith', // uppercase
        'john smith', // spaces
        'john@smith', // @ symbol
        '_john.smith', // starts with underscore
        'x'.repeat(256), // too long
        'john!smith', // invalid character
        'john#smith', // invalid character
        'john%smith', // invalid character
        'john+smith', // invalid character
      ];

      invalidHandles.forEach((handle) => {
        expect(service['isValidMatrixHandle'](handle)).toBe(false);
      });
    });
  });

  describe('handle cleaning', () => {
    it('should clean handles properly', () => {
      const testCases = [
        ['John Smith', 'johnsmith'],
        ['john@smith.com', 'johnsmith.com'],
        ['UPPERCASE', 'uppercase'],
        ['_invalid_start', 'invalid_start'], // leading underscores removed
        ['user_name_123', 'user_name_123'], // non-leading underscores preserved
        ['Special!@#$%Chars', 'specialchars'],
        ['dots.and-dashes', 'dots.and-dashes'],
        ['123numbers456', '123numbers456'],
      ];

      testCases.forEach(([input, expected]) => {
        expect(service['cleanHandle'](input)).toBe(expected);
      });
    });

    it('should handle empty input', () => {
      expect(service['cleanHandle']('')).toBe('');
      expect(service['cleanHandle'](null as any)).toBe('');
      expect(service['cleanHandle'](undefined as any)).toBe('');
    });

    it('should respect length limit', () => {
      const longInput = 'a'.repeat(300);
      const result = service['cleanHandle'](longInput);
      expect(result.length).toBe(255);
    });
  });
});
