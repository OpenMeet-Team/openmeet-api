import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class AuthBlueskyLoginDto {
  @ApiProperty({ example: 'abc' })
  @IsNotEmpty()
  code: string;
} 