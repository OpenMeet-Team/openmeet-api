import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateLoginLinkDto {
  @ApiProperty({
    example: '/events/my-event-slug',
    type: String,
    description:
      'Relative path to redirect to after login. Must start with / and must not contain ://',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\/(?!\/)/, {
    message: 'redirectPath must be a relative path starting with /',
  })
  @Matches(/^(?!.*:\/\/)/, { message: 'redirectPath must not contain ://' })
  redirectPath: string;
}
