import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class FileDto {
  @ApiProperty()
  @IsNumber()
  id: number;

  path: string;
}
