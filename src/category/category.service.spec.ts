import { Test, TestingModule } from '@nestjs/testing';
import { CategoryService } from './category.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { Repository } from 'typeorm';
import { CategoryEntity } from './infrastructure/persistence/relational/entities/categories.entity';
import { REQUEST } from '@nestjs/core';

describe('CategoryService', () => {
  let service: CategoryService;
  let mockCategoryRepository: Partial<Repository<CategoryEntity>>;
  let mockTenantConnectionService: Partial<TenantConnectionService>;

  beforeEach(async () => {
    // Mock repository methods
    mockCategoryRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    // Mock tenant connection service
    mockTenantConnectionService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: () => mockCategoryRepository,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: REQUEST,
          useValue: { tenantId: 'test-tenant' },
        },
      ],
    }).compile();

    service = await module.resolve<CategoryService>(CategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all categories with only id and name selected and no relations or cache', async () => {
      const mockCategories = [
        { id: 1, name: 'Category 1' },
        { id: 2, name: 'Category 2' },
      ];

      (mockCategoryRepository.find as jest.Mock).mockResolvedValue(
        mockCategories,
      );

      const result = await service.findAll();

      expect(mockCategoryRepository.find).toHaveBeenCalledWith({
        select: ['id', 'name'],
      });
      expect(result).toEqual(mockCategories);
    });

    it('should handle errors during findAll', async () => {
      const mockError = new Error('Database error');
      (mockCategoryRepository.find as jest.Mock).mockRejectedValue(mockError);

      await expect(service.findAll()).rejects.toThrow(mockError);
    });
  });

  describe('findOne', () => {
    it('should load only subCategories relation, not events or groups', async () => {
      const mockCategory = {
        id: 1,
        name: 'Category 1',
        subCategories: [],
      };

      (mockCategoryRepository.findOne as jest.Mock).mockResolvedValue(
        mockCategory,
      );

      const result = await service.findOne(1);

      expect(mockCategoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['subCategories'],
      });
      expect(result).toEqual(mockCategory);
    });

    it('should return null when category is not found', async () => {
      (mockCategoryRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.findOne(999);

      expect(result).toBeNull();
    });
  });

  describe('findByIds', () => {
    it('should return categories for given ids', async () => {
      const mockCategories = [
        { id: 1, name: 'Category 1' },
        { id: 2, name: 'Category 2' },
      ];
      const ids = [1, 2];

      (mockCategoryRepository.find as jest.Mock).mockResolvedValue(
        mockCategories,
      );

      const result = await service.findByIds(ids);

      expect(mockCategoryRepository.find).toHaveBeenCalledWith({
        where: {
          id: expect.any(Object), // In operator will be here
        },
      });
      expect(result).toEqual(mockCategories);
    });
  });

  describe('getHomePageFeaturedCategories', () => {
    it('should return random featured categories', async () => {
      const mockCategories = [
        { id: 1, name: 'Category 1' },
        { id: 2, name: 'Category 2' },
      ];

      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockCategories),
      };

      (mockCategoryRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.getHomePageFeaturedCategories();

      expect(mockCategoryRepository.createQueryBuilder).toHaveBeenCalledWith(
        'category',
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('RANDOM()');
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
      expect(result).toEqual(mockCategories);
    });
  });
});
