import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

export class QuickRsvpDto {
  @ApiProperty({ example: 'John Doe', type: String })
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'john@example.com', type: String })
  @Transform(lowerCaseTransformer)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'summer-party-2024', type: String })
  @IsNotEmpty()
  eventSlug: string;
}
