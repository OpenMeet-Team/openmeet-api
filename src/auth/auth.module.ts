import { forwardRef, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AnonymousStrategy } from './strategies/anonymous.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { MessagingModule } from '../messaging/messaging.module';
import { SessionModule } from '../session/session.module';
import { UserModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';
import { GroupMemberModule } from '../group-member/group-member.module';
import { RoleModule } from '../role/role.module';
import { EventModule } from '../event/event.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { CategoryModule } from '../category/category.module';
import { AuthBlueskyModule } from '../auth-bluesky/auth-bluesky.module';
import { ShadowAccountModule } from '../shadow-account/shadow-account.module';

@Module({
  imports: [
    UserModule,
    forwardRef(() => GroupModule),
    forwardRef(() => GroupMemberModule),
    forwardRef(() => EventModule),
    forwardRef(() => CategoryModule),
    forwardRef(() => EventAttendeeModule),
    SessionModule,
    PassportModule,
    forwardRef(() => MessagingModule),
    RoleModule,
    JwtModule.register({}),
    forwardRef(() => AuthBlueskyModule),
    forwardRef(() => ShadowAccountModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy, AnonymousStrategy],
  exports: [AuthService],
})
export class AuthModule {}
