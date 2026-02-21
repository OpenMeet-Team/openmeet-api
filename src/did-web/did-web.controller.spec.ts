import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DidWebController } from './did-web.controller';

describe('DidWebController', () => {
  let controller: DidWebController;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          SERVICE_DID: 'did:web:api.openmeet.net',
          BACKEND_DOMAIN: 'https://api.openmeet.net',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DidWebController],
      providers: [
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get<DidWebController>(DidWebController);
  });

  describe('GET /.well-known/did.json', () => {
    it('should return a valid DID document with configured SERVICE_DID', () => {
      const result = controller.getDidDocument();

      expect(result).toEqual({
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: 'did:web:api.openmeet.net',
        service: [
          {
            id: '#openmeet',
            type: 'OpenMeetService',
            serviceEndpoint: 'https://api.openmeet.net',
          },
        ],
      });
    });

    it('should use default SERVICE_DID when env var is not set', () => {
      configService.get.mockReturnValue(undefined);

      const result = controller.getDidDocument();

      expect(result.id).toBe('did:web:api.openmeet.net');
    });

    it('should use BACKEND_DOMAIN for serviceEndpoint', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'SERVICE_DID') return 'did:web:custom.example.com';
        if (key === 'BACKEND_DOMAIN') return 'https://custom.example.com';
        return undefined;
      });

      const result = controller.getDidDocument();

      expect(result.id).toBe('did:web:custom.example.com');
      expect(result.service[0].serviceEndpoint).toBe(
        'https://custom.example.com',
      );
    });
  });
});
