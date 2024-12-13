import { Test, TestingModule } from '@nestjs/testing';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { mockMailService } from '../test/mocks/mocks';

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
      ],
    }).compile();

    controller = module.get<MailController>(MailController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
