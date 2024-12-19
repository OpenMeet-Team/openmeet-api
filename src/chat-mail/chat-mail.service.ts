import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class ChatMailService {
  constructor(private readonly mailService: MailService) {}

  async sendMailNewMessage(participant: UserEntity) {
    if (!participant.email) {
      throw new Error('Participant email is required');
    }
    await this.mailService.sendMailChatNewMessage({
      to: participant.email,
      data: {
        participant,
      },
    });
  }
}
