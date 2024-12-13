import { Controller, Get, Query } from '@nestjs/common';
import { MailService } from './mail.service';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { getTenantConfig } from '../utils/tenant-config';

@ApiTags('Mail')
@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Get('preview')
  @TenantPublic()
  @ApiOperation({ summary: 'Preview email template' })
  @ApiQuery({ name: 'template', required: true, description: 'Template name' })
  @ApiQuery({
    name: 'data',
    required: false,
    description: 'Template data in JSON format',
  })
  async previewEmail(
    @Query('template') template: string,
    @Query('tenantId') tenantId?: string,
    @Query('data') data?: string,
  ) {
    const templateData = data ? JSON.parse(data) : {};
    templateData.preview = true;

    if (tenantId) {
      templateData.tenantConfig = getTenantConfig(tenantId);
    }

    // console.log(templateData);
    return this.mailService.renderTemplate(template, templateData);
  }
}
