import { Test, TestingModule } from '@nestjs/testing';
import { MatrixMessageService } from './matrix-message.service';
import { Logger } from '@nestjs/common';

describe('MatrixMessageService', () => {
  let service: MatrixMessageService;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Mock the Logger.warn method
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const module: TestingModule = await Test.createTestingModule({
      providers: [MatrixMessageService],
    }).compile();

    service = module.get<MatrixMessageService>(MatrixMessageService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should log deprecation warning when instantiated', () => {
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'MatrixMessageService is deprecated. All messaging is now handled client-side via Matrix JS SDK.',
      );
    });
  });

  describe('deprecated functionality', () => {
    it('should be a minimal stub service', () => {
      // Verify that the service exists but has no messaging methods
      expect(typeof service).toBe('object');
      expect(service.constructor.name).toBe('MatrixMessageService');

      // Verify deprecated methods are not available
      expect((service as any).sendMessage).toBeUndefined();
      expect((service as any).sendTypingNotification).toBeUndefined();
      expect((service as any).getRoomMessages).toBeUndefined();
    });
  });
});
