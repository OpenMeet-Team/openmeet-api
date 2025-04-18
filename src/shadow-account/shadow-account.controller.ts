import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ShadowAccountService } from './shadow-account.service';
import { JWTAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../role/role.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import {
  ShadowAccountDto,
  CreateShadowAccountDto,
} from './dto/shadow-account.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '../role/role.enum';

@ApiTags('shadow-accounts')
@Controller('shadow-accounts')
@UseGuards(JWTAuthGuard, RolesGuard)
@Roles(RoleEnum.Admin)
export class ShadowAccountController {
  private readonly logger = new Logger(ShadowAccountController.name);

  constructor(private readonly shadowAccountService: ShadowAccountService) {}

  @Get()
  @ApiOperation({ summary: 'Get all shadow accounts for a tenant' })
  @ApiResponse({
    status: 200,
    description: 'Returns all shadow accounts for the specified tenant',
    type: [ShadowAccountDto],
  })
  @ApiQuery({
    name: 'provider',
    required: false,
    description: 'Filter by authentication provider',
    enum: AuthProvidersEnum,
  })
  @ApiHeader({
    name: 'x-tenant-id',
    description: 'Tenant ID',
    required: true,
  })
  async getShadowAccounts(
    @Headers('x-tenant-id') tenantId: string,
    @Query('provider') provider?: AuthProvidersEnum,
  ): Promise<ShadowAccountDto[]> {
    this.logger.log(
      `Fetching shadow accounts for tenant ${tenantId}${
        provider ? ` with provider ${provider}` : ''
      }`,
    );

    let accounts;
    if (provider) {
      accounts = await this.shadowAccountService.findShadowAccountsByProvider(
        provider,
        tenantId,
      );
    } else {
      accounts =
        await this.shadowAccountService.findAllShadowAccounts(tenantId);
    }

    // Transform to DTO before returning
    return accounts.map((account) => ({
      id: account.id,
      ulid: account.ulid,
      displayName: account.firstName || '',
      externalId: account.socialId || '',
      provider: account.provider as AuthProvidersEnum,
      createdAt: account.createdAt,
      preferences: account.preferences || {},
    }));
  }

  @Post()
  @ApiOperation({ summary: 'Create a shadow account (admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Shadow account created successfully',
    type: ShadowAccountDto,
  })
  @ApiHeader({
    name: 'x-tenant-id',
    description: 'Tenant ID',
    required: true,
  })
  async createShadowAccount(
    @Headers('x-tenant-id') tenantId: string,
    @Body() createDto: CreateShadowAccountDto,
  ): Promise<ShadowAccountDto> {
    this.logger.log(
      `Creating shadow account for ${createDto.provider} user ${createDto.displayName || 'unnamed'} in tenant ${tenantId}`,
    );

    const account = await this.shadowAccountService.findOrCreateShadowAccount(
      createDto.externalId,
      createDto.displayName,
      createDto.provider,
      tenantId,
      createDto.preferences,
    );

    return {
      id: account.id,
      ulid: account.ulid,
      displayName: account.firstName || '',
      externalId: account.socialId || '',
      provider: account.provider as AuthProvidersEnum,
      createdAt: account.createdAt,
      preferences: account.preferences || {},
    };
  }
}
