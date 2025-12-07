import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class DashboardGroupsQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter by user role: "leader" (owner/admin/moderator) or "member"',
    enum: ['leader', 'member'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['leader', 'member'])
  role?: 'leader' | 'member';
}
