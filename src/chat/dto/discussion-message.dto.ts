import { ApiProperty } from '@nestjs/swagger';
import { Message } from '../../matrix/types/matrix.types';

/**
 * DTO for discussion message responses
 * Standardizes the shape of responses from discussion-related endpoints
 */
export class DiscussionMessagesResponseDto {
  @ApiProperty({
    description: 'List of messages in the discussion',
    type: 'array',
    isArray: true,
  })
  messages: Message[];

  @ApiProperty({
    description: 'Token used for pagination',
  })
  end: string;

  @ApiProperty({
    description: 'Matrix room ID associated with this discussion',
    required: false,
  })
  roomId?: string;
}
