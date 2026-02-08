import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FileDto } from '../../file/dto/file.dto';
import { Transform, Type } from 'class-transformer';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';
import { UserPreferencesDto } from './user-preferences.dto';

export class AuthUpdateDto {
  @ApiPropertyOptional({ type: () => FileDto })
  @IsOptional()
  photo?: FileDto | null;

  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsNotEmpty({ message: 'Please enter your first name' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  lastName?: string | null;

  @ApiPropertyOptional({ example: 'new.email@openmeet.net' })
  @IsOptional()
  @IsNotEmpty({ message: 'Please enter your email' })
  @IsEmail()
  @Transform(lowerCaseTransformer)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNotEmpty({ message: 'Please enter your password' })
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNotEmpty({ message: 'Please enter your current password' })
  oldPassword?: string;

  @ApiPropertyOptional({ type: () => [Number] })
  @IsOptional()
  interests?: number[];

  @ApiPropertyOptional({ type: () => UserPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UserPreferencesDto)
  preferences?: UserPreferencesDto;
}
