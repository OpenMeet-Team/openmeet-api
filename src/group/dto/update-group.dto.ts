import { PartialType } from '@nestjs/swagger';
import { CreateGroupDto } from './create-group.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import {
  SLUG_REGEX,
  SLUG_VALIDATION_MESSAGE,
} from '../../core/constants/constant';

export class UpdateGroupDto extends PartialType(CreateGroupDto) {
  @ApiPropertyOptional({
    description:
      'The URL slug for the group. Must be 3-100 characters, lowercase alphanumeric with hyphens, cannot start or end with hyphen.',
    example: 'my-awesome-group',
  })
  @IsOptional()
  @IsString()
  @Matches(SLUG_REGEX, {
    message: SLUG_VALIDATION_MESSAGE,
  })
  slug?: string;
}
