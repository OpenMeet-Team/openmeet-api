import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../user/domain/user';
import { AtprotoIdentityDto } from '../../atproto-identity/dto/atproto-identity.dto';

/**
 * Response DTO for GET /auth/me endpoint.
 *
 * Extends User with additional computed fields like atprotoIdentity.
 */
export class MeResponseDto extends User {
  @ApiPropertyOptional({
    type: () => AtprotoIdentityDto,
    description: "User's AT Protocol identity, or null if none exists",
    nullable: true,
  })
  atprotoIdentity: AtprotoIdentityDto | null;
}

/**
 * Interface for the me() method return type.
 * Used internally - not for API documentation.
 */
export interface MeResponse extends User {
  atprotoIdentity: AtprotoIdentityDto | null;
}
