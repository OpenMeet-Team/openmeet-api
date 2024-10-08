import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../tenant/tenant.guard';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
