import { IsOptional, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../utils/dto/pagination.dto';

export enum DashboardEventsTab {
  Hosting = 'hosting',
  Attending = 'attending',
  Past = 'past',
}

export class DashboardEventsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter events by tab (hosting, attending, past)',
    enum: DashboardEventsTab,
    example: DashboardEventsTab.Hosting,
  })
  @IsOptional()
  @IsEnum(DashboardEventsTab)
  @Type(() => String)
  tab?: DashboardEventsTab;
}
