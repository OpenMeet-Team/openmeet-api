import { Test, TestingModule } from '@nestjs/testing';
import { ShadowAccountController } from './shadow-account.controller';
import { ShadowAccountService } from './shadow-account.service';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { CreateShadowAccountDto } from './dto/shadow-account.dto';

describe('ShadowAccountController', () => {
  let controller: ShadowAccountController;
  let service: ShadowAccountService;

  const mockUser = {
    id: 1,
    ulid: 'user123',
    firstName: 'testuser',
    socialId: 'did:plc:1234',
    provider: AuthProvidersEnum.bluesky,
    isShadowAccount: true,
    createdAt: new Date(),
    preferences: {
      bluesky: {
        did: 'did:plc:1234',
        handle: 'testuser',
      },
    },
  } as UserEntity;

  beforeEach(async () => {
    // Create mock service
    const mockShadowAccountService = {
      findAllShadowAccounts: jest.fn(),
      findShadowAccountsByProvider: jest.fn(),
      findOrCreateShadowAccount: jest.fn(),
      claimShadowAccount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShadowAccountController],
      providers: [
        {
          provide: ShadowAccountService,
          useValue: mockShadowAccountService,
        },
      ],
    }).compile();

    controller = module.get<ShadowAccountController>(ShadowAccountController);
    service = module.get<ShadowAccountService>(ShadowAccountService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getShadowAccounts', () => {
    it('should return all shadow accounts when no provider is specified', async () => {
      // Arrange
      jest
        .spyOn(service, 'findAllShadowAccounts')
        .mockResolvedValue([mockUser]);

      // Act
      const result = await controller.getShadowAccounts('tenant1');

      // Assert
      expect(service.findAllShadowAccounts).toHaveBeenCalledWith('tenant1');
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('testuser');
    });

    it('should return shadow accounts filtered by provider', async () => {
      // Arrange
      jest
        .spyOn(service, 'findShadowAccountsByProvider')
        .mockResolvedValue([mockUser]);

      // Act
      const result = await controller.getShadowAccounts(
        'tenant1',
        AuthProvidersEnum.bluesky,
      );

      // Assert
      expect(service.findShadowAccountsByProvider).toHaveBeenCalledWith(
        AuthProvidersEnum.bluesky,
        'tenant1',
      );
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe(AuthProvidersEnum.bluesky);
    });
  });

  describe('createShadowAccount', () => {
    it('should create a new shadow account', async () => {
      // Arrange
      const createDto: CreateShadowAccountDto = {
        externalId: 'did:plc:1234',
        displayName: 'testuser',
        provider: AuthProvidersEnum.bluesky,
        preferences: {
          bluesky: {
            did: 'did:plc:1234',
            handle: 'testuser',
          },
        },
      };
      jest
        .spyOn(service, 'findOrCreateShadowAccount')
        .mockResolvedValue(mockUser);

      // Act
      const result = await controller.createShadowAccount('tenant1', createDto);

      // Assert
      expect(service.findOrCreateShadowAccount).toHaveBeenCalledWith(
        createDto.externalId,
        createDto.displayName,
        createDto.provider,
        'tenant1',
        createDto.preferences,
      );
      expect(result.displayName).toBe('testuser');
      expect(result.externalId).toBe('did:plc:1234');
    });
  });
});
