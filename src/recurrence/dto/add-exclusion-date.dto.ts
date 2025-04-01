import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsISO8601 } from 'class-validator';

export class AddExclusionDateDto {
  @ApiProperty({
    description: 'The date to exclude from the recurrence pattern (ISO string)',
    example: '2023-08-15T14:00:00Z',
  })
  @IsString()
  @IsNotEmpty()
  @IsISO8601()
  exclusionDate: string;
}