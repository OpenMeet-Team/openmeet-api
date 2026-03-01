import { Test, TestingModule } from '@nestjs/testing';
import { UserListener } from './user.listener';
import { ModuleRef } from '@nestjs/core';
import { UserEntity } from './infrastructure/persistence/relational/entities/user.entity';

describe('UserListener', () => {
  let listener: UserListener;
  let mockModuleRef: {
    registerRequestByContextId: jest.Mock;
    resolve: jest.Mock;
  };

  beforeEach(async () => {
    mockModuleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserListener,
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
      ],
    }).compile();

    listener = module.get<UserListener>(UserListener);
  });

  describe('handleUserCreatedEvent', () => {
    it('should log user.created event', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const user = { id: 42 } as UserEntity;
      listener.handleUserCreatedEvent(user);

      expect(consoleSpy).toHaveBeenCalledWith('user.created', 42);

      consoleSpy.mockRestore();
    });
  });

  describe('handleUserUpdatedEvent', () => {
    it('should log user.updated event', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const user = { id: 99 } as UserEntity;
      listener.handleUserUpdatedEvent(user);

      expect(consoleSpy).toHaveBeenCalledWith('user.updated', 99);

      consoleSpy.mockRestore();
    });
  });

  describe('Singleton safety', () => {
    it('should not have REQUEST injected in constructor', () => {
      // If we got here, the module compiled without REQUEST provider,
      // proving the listener does not require @Inject(REQUEST)
      expect(listener).toBeDefined();
    });
  });
});
