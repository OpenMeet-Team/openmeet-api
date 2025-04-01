import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import { UpdateEventDto } from '../../event/dto/update-event.dto';

export class SplitSeriesDto {
  @ApiProperty({
    description: 'The date to split the series at (ISO string)',
    example: '2023-08-15T14:00:00Z',
  })
  @IsString()
  @IsNotEmpty()
  splitDate: string;

  @ApiProperty({
    description: 'Modifications to apply to the new series',
    type: UpdateEventDto,
  })
  @IsObject()
  @IsOptional()
  modifications: UpdateEventDto;
}
