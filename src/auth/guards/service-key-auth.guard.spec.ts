import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceKeyAuthGuard } from './service-key-auth.guard';

describe('ServiceKeyAuthGuard', () => {
  let guard: ServiceKeyAuthGuard;
  let configService: jest.Mocked<ConfigService>;

  // Mock API Keys
  const mockApiKeys = 'test-key-1,test-key-2';

  beforeEach(async () => {
    // Create config service mock
    configService = {
      get: jest.fn(),
    } as any;

    // Set up mock behavior
    configService.get.mockImplementation((key: string) => {
      if (key === 'SERVICE_API_KEYS') {
        return mockApiKeys;
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceKeyAuthGuard,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    guard = module.get<ServiceKeyAuthGuard>(ServiceKeyAuthGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow request with valid API key in Authorization header', () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        headers: {
          authorization: 'Bearer test-key-1',
        },
      });

      // Act
      const result = guard.canActivate(mockContext);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow request with valid API key in query parameter', () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        query: {
          api_key: 'test-key-2',
        },
      });

      // Act
      const result = guard.canActivate(mockContext);

      // Assert
      expect(result).toBe(true);
    });

    it('should reject request with no API key', () => {
      // Arrange
      const mockContext = createMockExecutionContext({});

      // Act & Assert
      expect(() => guard.canActivate(mockContext)).toThrow(
        UnauthorizedException,
      );
    });

    it('should reject request with invalid API key', () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        headers: {
          authorization: 'Bearer invalid-key',
        },
      });

      // Act & Assert
      expect(() => guard.canActivate(mockContext)).toThrow(
        UnauthorizedException,
      );
    });

    it('should handle empty API keys configuration', async () => {
      // Arrange
      configService.get.mockReturnValue(undefined);

      const moduleWithNoKeys: TestingModule = await Test.createTestingModule({
        providers: [
          ServiceKeyAuthGuard,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const guardWithNoKeys =
        moduleWithNoKeys.get<ServiceKeyAuthGuard>(ServiceKeyAuthGuard);

      const mockContext = createMockExecutionContext({
        headers: {
          authorization: 'Bearer any-key',
        },
      });

      // Act & Assert
      expect(() => guardWithNoKeys.canActivate(mockContext)).toThrow(
        UnauthorizedException,
      );
    });
  });
});

// Helper function to create a mock execution context
function createMockExecutionContext(requestPartial: any): ExecutionContext {
  const request = {
    headers: {},
    query: {},
    ...requestPartial,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}
