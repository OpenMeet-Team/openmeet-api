import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsString,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Status } from '../../core/constants/constant';


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
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @ApiProperty({
    description: 'The type of the event',
  })
  @IsNotEmpty()
  @IsString()
  type: string;

  @ApiProperty({
    description: 'The location of the event',
  })
  @IsOptional()
  @IsString()
  location: string;

  @ApiProperty({
    description: 'The online link of the event',
  })
  @IsString()
  @IsOptional()
  locationOnline: string;

  @ApiProperty({
    description: 'Max number of attendees to the event',
  })
  @IsNumber()
  maxAttendees: number;

  @ApiProperty({
    description: 'Categories of the event',
    type: [Number],
  })
  @IsArray({})
  @Type(() => Number)
  categories: number[]; // Array of category IDs

  @ApiProperty({
    description: 'The latitude of the event location',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lat: number;

  @ApiProperty({
    description: 'The longitude of the event location',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lon: number;

  @ApiPropertyOptional({
    description: 'The status of the group',
    enum: Status,
  })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @ApiProperty({
    description: 'Flag indicating if the event is public',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_public: boolean;

  @ApiProperty({
    description: 'The ID of the user organizing the event',
  })
  @IsOptional()
  @Type(() => Number)
  group: number;
}