import { forwardRef, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AnonymousStrategy } from './strategies/anonymous.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { MailModule } from '../mail/mail.module';
import { SessionModule } from '../session/session.module';
import { UserModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';
import { RoleModule } from '../role/role.module';
import { EventModule } from '../event/event.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { CategoryModule } from '../category/category.module';

@Module({
  imports: [
    UserModule,
    forwardRef(() => GroupModule),
    forwardRef(() => EventModule),
    forwardRef(() => CategoryModule),
    EventAttendeeModule,
    SessionModule,
    PassportModule,
    MailModule,
    RoleModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy, AnonymousStrategy],
  exports: [AuthService],
})
export class AuthModule {}
