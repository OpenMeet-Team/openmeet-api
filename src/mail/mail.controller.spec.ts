import { Test, TestingModule } from '@nestjs/testing';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { mockMailService } from '../test/mocks/mocks';
import { ConfigService } from '@nestjs/config';
import { TestOnlyGuard } from '../shared/guard/test-only.guard';

describe('MailController', () => {
  let controller: MailController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MailController],
      providers: [
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test') },
        },
      ],
    }).compile();

    controller = module.get<MailController>(MailController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('security guards', () => {
    it('should have TestOnlyGuard applied to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', MailController);
      expect(guards).toBeDefined();
      expect(guards).toContain(TestOnlyGuard);
    });

    it('should have ApiExcludeController applied', () => {
      const excluded = Reflect.getMetadata(
        'swagger/apiExcludeController',
        MailController,
      );
      expect(excluded).toBeTruthy();
    });
  });

  it('should preview a group guest joined email', async () => {
    const result = await controller.previewEmail('group-guest-joined');
    expect(result).toBeDefined();
  });

  it('should preview a group member role updated email', async () => {
    const result = await controller.previewEmail('group-member-role-updated');
    expect(result).toBeDefined();
  });
});
