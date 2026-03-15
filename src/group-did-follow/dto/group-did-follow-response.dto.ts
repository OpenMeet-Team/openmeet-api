import { ApiProperty } from '@nestjs/swagger';

export class GroupDIDFollowResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  did: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  createdById: number;

  constructor(entity: any) {
    this.id = entity.id;
    this.did = entity.did;
    this.createdAt = entity.createdAt;
    this.createdById = entity.createdBy?.id ?? entity.createdById;
  }
}
