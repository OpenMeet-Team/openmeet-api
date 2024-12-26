import { Module } from '@nestjs/common';
import { GroupMailService } from './group-mail.service';
import { UserModule } from '../user/user.module';
import { MailModule } from '../mail/mail.module';
import { GroupMemberModule } from '../group-member/group-member.module';

@Module({
  providers: [GroupMailService],
  exports: [GroupMailService],
  imports: [UserModule, MailModule, GroupMemberModule],
})
export class GroupMailModule {}
