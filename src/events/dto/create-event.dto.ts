import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({
    description: 'The name of the event',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'URL of the event image',
  })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty({
    description: 'The description of the event',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({
    description: 'The start date of the event in ISO format',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: Date;

  @ApiProperty({
    description: 'The end date of the event in ISO format',
  })
  @IsNotEmpty()
  @IsDateString()
  endDate: Date;

  @ApiProperty({
    description: 'The location of the event',
  })
  @IsNotEmpty()
  @IsString()
  location: string;

  @ApiProperty({
    description: 'The latitude of the event location',
  })
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  lat: number;

  @ApiProperty({
    description: 'The longitude of the event location',
  })
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  lon: number;

  @ApiProperty({
    description: 'Flag indicating if the event is public',
    example: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  is_public: boolean;

  @ApiProperty({
    description: 'The ID of the user organizing the event',
  })
  @IsNotEmpty()
  @Type(() => Number)
  group: number;
}
