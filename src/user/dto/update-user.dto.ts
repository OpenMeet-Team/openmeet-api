import { PartialType, ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

import { Transform, Type } from 'class-transformer';
import { IsEmail, IsOptional, MinLength } from 'class-validator';
import { FileDto } from '../../file/dto/file.dto';
import { StatusDto } from '../../status/dto/status.dto';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';
import { SubCategoryEntity } from 'src/sub-category/infrastructure/persistence/relational/entities/sub-category.entity';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ example: 'test1@openmeet.net', type: String })
  @Transform(lowerCaseTransformer)
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @MinLength(6)
  password?: string;

  provider?: string;

  socialId?: string | null;

  @ApiPropertyOptional({ example: 'John', type: String })
  @IsOptional()
  firstName?: string | null;

  @ApiPropertyOptional({ example: 'Doe', type: String })
  @IsOptional()
  lastName?: string | null;

  @ApiPropertyOptional({ type: () => FileDto })
  @IsOptional()
  photo?: FileDto | null;

  // @ApiPropertyOptional({ type: () => RoleDto })
  // @IsOptional()
  // @Type(() => RoleDto)
  // role?: RoleDto | null;

  @ApiProperty({
    description: 'The role associated with this user, represented by its ID',
    type: Number,
  })
  @IsOptional()
  role: number;

  @ApiPropertyOptional({ type: () => StatusDto })
  @IsOptional()
  @Type(() => StatusDto)
  status?: StatusDto;

  hash?: string | null;

  interests?: SubCategoryEntity[];
}
