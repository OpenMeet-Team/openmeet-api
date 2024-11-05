import { Test, TestingModule } from '@nestjs/testing';
import { UsageController } from './usage.controller';

describe('UsageController', () => {
  let controller: UsageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsageController],
    }).compile();

    controller = module.get<UsageController>(UsageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
