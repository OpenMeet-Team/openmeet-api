import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  // decorators here
  IsEmail,
  IsNotEmpty,
  IsOptional,
  MinLength,
} from 'class-validator';
import { FileDto } from '../../file/dto/file.dto';
import { StatusDto } from '../../status/dto/status.dto';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

export class CreateUserDto {
  @ApiProperty({ example: 'test1@openmeet.net', type: String })
  @Transform(lowerCaseTransformer)
  @IsNotEmpty()
  @IsEmail()
  email: string | null;

  @ApiProperty()
  @MinLength(6)
  password?: string;

  provider?: string;

  // role?: number;

  socialId?: string | null;

  @ApiProperty({ example: 'John', type: String })
  @IsNotEmpty()
  firstName: string | null;

  @ApiProperty({ example: 'Doe', type: String })
  @IsNotEmpty()
  lastName: string | null;

  @ApiPropertyOptional({ type: () => FileDto })
  @IsOptional()
  photo?: FileDto | null;

  // @ApiPropertyOptional({ type: RoleDto })
  // @IsOptional()
  // @Type(() => RoleDto)
  // role?: RoleDto | null;

  @ApiPropertyOptional({ type: StatusDto })
  @IsOptional()
  @Type(() => StatusDto)
  status?: StatusDto;

  hash?: string | null;

  @ApiPropertyOptional({
    description: 'The list of sub categories associated with this user',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  subCategories?: number[];

  @ApiProperty({
    description: 'The role associated with this user, represented by its ID',
    type: Number,
  })
  @IsNotEmpty()
  role: number;
}
