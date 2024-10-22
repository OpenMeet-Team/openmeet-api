import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigModule, ConfigService } from '@nestjs/config';

// skipping so we don't send mail frequently
describe.skip('SMTP (e2e)', () => {
  let app: INestApplication;
  let configService: ConfigService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    configService = moduleFixture.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should connect to SMTP server and authenticate', async () => {
    const smtpConfig = {
      host: configService.get<string>('MAIL_HOST', { infer: true }),
      port: configService.get<number>('MAIL_PORT', { infer: true }),
      auth: {
        user: configService.get<string>('MAIL_USER', { infer: true }),
        pass: configService.get<string>('MAIL_PASSWORD', { infer: true }),
      },
      tls: {
        rejectUnauthorized: false,
        secure: configService.get<boolean>('MAIL_SECURE', { infer: true }),
      },
    };

    const transporter = nodemailer.createTransport(smtpConfig);

    await expect(transporter.verify()).resolves.toBe(true);
  });

  it('should send an email', async () => {
    const smtpConfig = {
      host: configService.get<string>('MAIL_HOST', { infer: true }),
      port: configService.get<number>('MAIL_PORT', { infer: true }),
      auth: {
        user: configService.get<string>('MAIL_USER', { infer: true }),
        pass: configService.get<string>('MAIL_PASSWORD', { infer: true }),
      },
      tls: {
        rejectUnauthorized: false,
        secure: configService.get<boolean>('MAIL_SECURE', { infer: true }),
      },
    };
    const mailOptions = {
      from: configService.get<string>('MAIL_DEFAULT_EMAIL', { infer: true }),
      to: 'tom@openmeet.net',
      subject: 'Test Email',
      text: 'This is a test email',
    };
    console.log(mailOptions);
    const transporter = nodemailer.createTransport(smtpConfig);

    await expect(transporter.sendMail(mailOptions)).resolves.toEqual(
      expect.objectContaining({
        accepted: expect.arrayContaining([expect.any(String)]),
      }),
    );
  });
});
