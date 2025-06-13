import { Test, TestingModule } from '@nestjs/testing';
import { MatrixClientOperationsService } from './matrix-client-operations.service';
import { MatrixTokenManagerService } from './matrix-token-manager.service';
import { MatrixCoreService } from './matrix-core.service';
import { MatrixUserService } from './matrix-user.service';

describe('MatrixClientOperationsService', () => {
  let service: MatrixClientOperationsService;
  let tokenManager: MatrixTokenManagerService;
  let matrixCore: MatrixCoreService;
  let matrixUser: MatrixUserService;

  const mockMatrixClient = {
    sendEvent: jest.fn(),
    joinRoom: jest.fn(),
    invite: jest.fn(),
    stopClient: jest.fn(),
  };

  const mockMatrixSdk = {
    createClient: jest.fn().mockReturnValue(mockMatrixClient),
  };

  const mockConfig = {
    baseUrl: 'https://matrix.example.org',
    serverName: 'example.org',
    adminUserId: '@admin:example.org',
    defaultDeviceId: 'OPENMEET_SERVER',
    defaultInitialDeviceDisplayName: 'OpenMeet Server',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixClientOperationsService,
        {
          provide: MatrixTokenManagerService,
          useValue: {
            getAdminToken: jest.fn().mockReturnValue('admin-token'),
            reportTokenInvalid: jest.fn(),
            getValidUserToken: jest.fn(),
          },
        },
        {
          provide: MatrixCoreService,
          useValue: {
            getSdk: jest.fn().mockReturnValue(mockMatrixSdk),
            getConfig: jest.fn().mockReturnValue(mockConfig),
          },
        },
        {
          provide: MatrixUserService,
          useValue: {
            generateMatrixUsername: jest.fn().mockImplementation((user, tenantId) => 
              tenantId ? `${user.slug}_${tenantId}` : user.slug
            ),
          },
        },
      ],
    }).compile();

    service = module.get<MatrixClientOperationsService>(MatrixClientOperationsService);
    tokenManager = module.get<MatrixTokenManagerService>(MatrixTokenManagerService);
    matrixCore = module.get<MatrixCoreService>(MatrixCoreService);
    matrixUser = module.get<MatrixUserService>(MatrixUserService);
  });

  describe('withAdminClient', () => {
    it('should execute operation with admin client successfully', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await service.withAdminClient(mockOperation);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledWith(mockMatrixClient);
      expect(mockMatrixClient.stopClient).toHaveBeenCalled();
    });

    it('should retry operation after token regeneration on 401 error', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce({
          response: { status: 401 },
        })
        .mockResolvedValueOnce('success-after-retry');

      // Mock successful token regeneration
      (tokenManager.reportTokenInvalid as jest.Mock).mockResolvedValueOnce(true);
      (tokenManager.getAdminToken as jest.Mock)
        .mockReturnValueOnce('admin-token') // First call
        .mockReturnValueOnce('new-admin-token'); // After regeneration

      const result = await service.withAdminClient(mockOperation);

      expect(result).toBe('success-after-retry');
      expect(mockOperation).toHaveBeenCalledTimes(2);
      expect(tokenManager.reportTokenInvalid).toHaveBeenCalled();
      expect(mockMatrixClient.stopClient).toHaveBeenCalledTimes(2); // Called in finally block for both attempts
    });

    it('should fail if token regeneration fails', async () => {
      const originalError = { response: { status: 401 } };
      const mockOperation = jest.fn().mockRejectedValue(originalError);

      // Mock failed token regeneration
      (tokenManager.reportTokenInvalid as jest.Mock).mockResolvedValueOnce(false);

      // Should throw the original error since regeneration failed
      await expect(service.withAdminClient(mockOperation)).rejects.toBe(originalError);
      expect(tokenManager.reportTokenInvalid).toHaveBeenCalled();
    });

    it('should throw non-401 errors immediately without retry', async () => {
      const mockError = { response: { status: 500 } };
      const mockOperation = jest.fn().mockRejectedValue(mockError);

      await expect(service.withAdminClient(mockOperation)).rejects.toBe(mockError);
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(tokenManager.reportTokenInvalid).not.toHaveBeenCalled();
    });

    it('should stop client even if operation throws', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Test error'));

      await expect(service.withAdminClient(mockOperation)).rejects.toThrow('Test error');
      expect(mockMatrixClient.stopClient).toHaveBeenCalled();
    });

    it('should handle retry failure gracefully', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 401 } })
        .mockRejectedValueOnce(new Error('Retry failed'));

      // Mock successful token regeneration
      (tokenManager.reportTokenInvalid as jest.Mock).mockResolvedValueOnce(true);
      (tokenManager.getAdminToken as jest.Mock)
        .mockReturnValueOnce('admin-token')
        .mockReturnValueOnce('new-admin-token');

      await expect(service.withAdminClient(mockOperation)).rejects.toThrow('Retry failed');
      expect(mockOperation).toHaveBeenCalledTimes(2);
      expect(tokenManager.reportTokenInvalid).toHaveBeenCalled();
    });
  });

  describe('withMatrixClient', () => {
    it('should execute operation with user client successfully', async () => {
      const mockOperation = jest.fn().mockResolvedValue('user-success');
      
      // Mock user token retrieval
      (tokenManager.getValidUserToken as jest.Mock).mockResolvedValueOnce('user-token');

      const result = await service.withMatrixClient('test-user', mockOperation, 'tenant1');

      expect(result).toBe('user-success');
      expect(tokenManager.getValidUserToken).toHaveBeenCalledWith(
        '@test-user_tenant1:example.org',
        'tenant1'
      );
      expect(mockOperation).toHaveBeenCalledWith(mockMatrixClient);
      expect(mockMatrixClient.stopClient).toHaveBeenCalled();
    });

    it('should throw error if user token cannot be obtained', async () => {
      const mockOperation = jest.fn();
      
      // Mock failed token retrieval
      (tokenManager.getValidUserToken as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.withMatrixClient('test-user', mockOperation, 'tenant1')
      ).rejects.toThrow('Could not obtain valid token for user @test-user_tenant1:example.org');

      expect(mockOperation).not.toHaveBeenCalled();
    });

    it('should stop client even if operation fails', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('User operation failed'));
      
      (tokenManager.getValidUserToken as jest.Mock).mockResolvedValueOnce('user-token');

      await expect(
        service.withMatrixClient('test-user', mockOperation, 'tenant1')
      ).rejects.toThrow('User operation failed');

      expect(mockMatrixClient.stopClient).toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('should execute event operation with correct room ID', async () => {
      const mockOperation = jest.fn().mockResolvedValue('event-success');
      
      (tokenManager.getValidUserToken as jest.Mock).mockResolvedValueOnce('user-token');

      const result = await service.withEventOperation(
        'test-event',
        'test-user',
        mockOperation,
        'tenant1'
      );

      expect(result).toBe('event-success');
      expect(mockOperation).toHaveBeenCalledWith(
        mockMatrixClient,
        '!event_test-event:example.org'
      );
    });

    it('should execute admin event operation', async () => {
      const mockOperation = jest.fn().mockResolvedValue('admin-event-success');

      const result = await service.withAdminEventOperation('test-event', mockOperation);

      expect(result).toBe('admin-event-success');
      expect(mockOperation).toHaveBeenCalledWith(
        mockMatrixClient,
        '!event_test-event:example.org'
      );
    });

    it('should execute message operation', async () => {
      const mockOperation = jest.fn().mockResolvedValue('message-success');
      
      (tokenManager.getValidUserToken as jest.Mock).mockResolvedValueOnce('user-token');

      const result = await service.withMessageOperation(
        'test-event',
        'test-user',
        mockOperation,
        'tenant1'
      );

      expect(result).toBe('message-success');
      expect(mockOperation).toHaveBeenCalledWith(
        mockMatrixClient,
        '!event_test-event:example.org'
      );
    });
  });
});