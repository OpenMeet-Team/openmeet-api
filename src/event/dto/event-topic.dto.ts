import { ApiProperty } from '@nestjs/swagger';

export class EventTopicDto {
  @ApiProperty({
    description: 'The name of the event topic',
  })
  name: string;
}
