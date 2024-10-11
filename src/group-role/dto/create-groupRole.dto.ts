import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { GroupRole } from '../../core/constants/constant';

export class CreateGroupRoleDto {
    @ApiProperty({
        description: 'Role of the group member',
        enum: GroupRole,  
      })
      @IsNotEmpty()
      @IsEnum(GroupRole)  
      name: GroupRole;
}
