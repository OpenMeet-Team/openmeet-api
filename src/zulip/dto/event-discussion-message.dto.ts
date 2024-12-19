import { IsString } from 'class-validator';
import { IsNotEmpty } from 'class-validator';

export class EventDiscussionMessageDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsNotEmpty()
  topicName: string;
}
