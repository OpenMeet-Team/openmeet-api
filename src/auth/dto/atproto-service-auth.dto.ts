import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AtprotoServiceAuthDto {
  @ApiProperty({
    description: 'PDS-signed JWT from com.atproto.server.getServiceAuth',
    example:
      'eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJkaWQ6cGxjOi4uLiJ9.signature',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
