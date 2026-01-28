import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, IsNotEmpty } from 'class-validator';

/**
 * DTO for PDS password reset request.
 *
 * Used to reset user's PDS password using a token received via email.
 */
export class ResetPdsPasswordDto {
  @ApiProperty({
    description: 'Password reset token received via email',
    example: 'abc123xyz789',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'New password (minimum 8 characters)',
    example: 'my-secure-new-password',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}
