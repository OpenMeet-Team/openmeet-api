import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsOptional } from 'class-validator';

export class EventTopicMessageDto {
  @ApiProperty({
    description: 'The message of the event topic',
  })
  @IsOptional()
  @IsString()
  message?: string;
}
