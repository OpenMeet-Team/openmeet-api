import { SetMetadata } from '@nestjs/common';
import { IS_TENANT_PUBLIC_KEY } from '../core/constants/constant';

export const TenantPublic = () => SetMetadata(IS_TENANT_PUBLIC_KEY, true);
