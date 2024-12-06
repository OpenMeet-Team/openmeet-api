import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, MinLength } from 'class-validator';
import { FileDto } from '../../file/dto/file.dto';
import { Transform } from 'class-transformer';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

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
  @IsNotEmpty({ message: 'Please enter your last name' })
  lastName?: string;

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
}
