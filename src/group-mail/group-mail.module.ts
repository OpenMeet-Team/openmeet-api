import { Module } from '@nestjs/common';
import { GroupMailService } from './group-mail.service';
import { UserModule } from 'src/user/user.module';
import { MailModule } from 'src/mail/mail.module';
import { GroupMemberModule } from 'src/group-member/group-member.module';

@Module({
  providers: [GroupMailService],
  exports: [GroupMailService],
  imports: [UserModule, MailModule, GroupMemberModule],
})
export class GroupMailModule {}
