import { TestOnlyGuard } from './test-only.guard';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';

describe('TestOnlyGuard', () => {
  let guard: TestOnlyGuard;
  let mockConfigService: { get: jest.Mock };
  let mockExecutionContext: ExecutionContext;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn(),
    };
    mockExecutionContext = {} as ExecutionContext;
    guard = new TestOnlyGuard(mockConfigService as any);
  });

  it('should throw ForbiddenException in production environment', () => {
    mockConfigService.get.mockReturnValue('production');

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      'Test endpoints are not available in production',
    );
  });

  it('should allow access in test environment', () => {
    mockConfigService.get.mockReturnValue('test');

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
  });

  it('should allow access in development environment', () => {
    mockConfigService.get.mockReturnValue('development');

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
  });

  it('should allow access when nodeEnv is undefined', () => {
    mockConfigService.get.mockReturnValue(undefined);

    const result = guard.canActivate(mockExecutionContext);
    expect(result).toBe(true);
  });

  it('should check app.nodeEnv config key', () => {
    mockConfigService.get.mockReturnValue('test');

    guard.canActivate(mockExecutionContext);

    expect(mockConfigService.get).toHaveBeenCalledWith('app.nodeEnv', {
      infer: true,
    });
  });
});
