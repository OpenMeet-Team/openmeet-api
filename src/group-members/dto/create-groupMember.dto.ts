import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGroupMemberDto {
  @ApiProperty({
    description: 'Name of the group member',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'ID of the user associated with the group member',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  userId: number;

  @ApiProperty({
    description: 'ID of the group role assigned to the member',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  groupRoleId: number;

  @ApiProperty({
    description: 'ID of the group to which the member belongs',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  groupId: number;
}
