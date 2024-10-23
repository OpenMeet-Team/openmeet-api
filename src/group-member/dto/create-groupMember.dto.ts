import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GroupRole } from '../../core/constants/constant';

export class CreateGroupMemberDto {
  @ApiPropertyOptional({
    description: 'Approval of the group member',
  })
  @IsOptional()
  @IsBoolean()
  requiredApproval: boolean;

  @ApiProperty({
    description: 'ID of the user associated with the group member',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  userId: number;

  // @ApiProperty({
  //   description: 'ID of the group role assigned to the member',
  // })
  // @IsNotEmpty()
  // @Type(() => Number)
  // @IsNumber()
  // @IsOptional()
  // groupRoleId: number = 1;

  @ApiProperty({
    description: 'ID of the group to which the member belongs',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  groupId: number;
}

export class UpdateGroupMemberRoleDto {
  @ApiProperty({
    description: 'ID of the user associated with the group member',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  userId: number;

  @ApiProperty({
    description: 'Role of the group member',
    enum: GroupRole,
  })
  @IsNotEmpty()
  @IsEnum(GroupRole)
  name: GroupRole;

  @ApiProperty({
    description: 'ID of the group to which the member belongs',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  groupId: number;
}
