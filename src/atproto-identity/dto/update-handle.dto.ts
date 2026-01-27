import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateHandleDto {
  @ApiProperty({
    description: 'New AT Protocol handle',
    example: 'alice.opnmt.me',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(253) // DNS max length
  @Matches(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/,
    {
      message:
        'Handle must be a valid domain name format (e.g., alice.opnmt.me)',
    },
  )
  handle: string;
}
