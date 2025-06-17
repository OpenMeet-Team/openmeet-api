import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { GlobalMatrixValidationService } from './global-matrix-validation.service';

describe('GlobalMatrixValidationService', () => {
  let service: GlobalMatrixValidationService;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GlobalMatrixValidationService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<GlobalMatrixValidationService>(
      GlobalMatrixValidationService,
    );
  });

  describe('isMatrixHandleUnique', () => {
    it('should return true for available handle', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.isMatrixHandleUnique('john.smith');

      expect(result).toBe(true);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        'SELECT handle FROM matrix_handle_registry WHERE LOWER(handle) = LOWER($1)',
        ['john.smith'],
      );
    });

    it('should return false for taken handle', async () => {
      mockDataSource.query.mockResolvedValue([{ handle: 'john.smith' }]);

      const result = await service.isMatrixHandleUnique('john.smith');

      expect(result).toBe(false);
    });

    it('should return false for invalid handle', async () => {
      const result = await service.isMatrixHandleUnique(
        'invalid handle with spaces',
      );

      expect(result).toBe(false);
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('registerMatrixHandle', () => {
    it('should register a valid unique handle', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([]) // isMatrixHandleUnique check
        .mockResolvedValueOnce(undefined); // registration

      await service.registerMatrixHandle('john.smith', 'tenant123', 456);

      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
      expect(mockDataSource.query).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO matrix_handle_registry'),
        ['john.smith', 'tenant123', 456],
      );
    });

    it('should throw error for taken handle', async () => {
      mockDataSource.query.mockResolvedValue([{ handle: 'john.smith' }]); // taken

      await expect(
        service.registerMatrixHandle('john.smith', 'tenant123', 456),
      ).rejects.toThrow('Matrix handle john.smith is already taken');
    });
  });

  describe('suggestAvailableHandles', () => {
    it('should suggest variations for taken handle', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ handle: 'john.smith' }]) // original taken
        .mockResolvedValueOnce([]) // john.smith2 available
        .mockResolvedValueOnce([]) // john.smith3 available
        .mockResolvedValueOnce([]); // johnsmith available

      const suggestions = await service.suggestAvailableHandles(
        'john.smith',
        3,
      );

      expect(suggestions).toEqual(['john.smith2', 'john.smith3', 'johnsmith']);
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
        'a'.repeat(256), // too long
        'john!smith', // invalid character
      ];

      invalidHandles.forEach((handle) => {
        expect(service['isValidMatrixHandle'](handle)).toBe(false);
      });
    });
  });
});
