import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class AuthGithubLoginDto {
  @ApiProperty({ example: 'abc' })
  @IsNotEmpty()
  code: string;
}
