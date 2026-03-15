import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CreateGroupDIDFollowDto {
  @ApiProperty({
    description: 'AT Protocol DID to follow',
    example: 'did:plc:abc123',
  })
  @IsString()
  @Matches(/^did:(plc|web):/, {
    message: 'DID must start with did:plc: or did:web:',
  })
  did: string;
}
