import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../role/role.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import {
  EmailSimulationDto,
  EmailSimulationType,
} from './dto/email-simulation.dto';
import { RoleEnum } from '../role/role.enum';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('simulate-email')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleEnum.Admin, 2)
  @ApiOperation({
    summary: 'Simulate sending transaction emails',
    description:
      'Send test versions of transaction emails (signup, password reset, etc.) to a specified email address',
  })
  @ApiResponse({
    status: 200,
    description: 'Email simulation sent successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  async simulateEmail(
    @Body() dto: EmailSimulationDto,
  ): Promise<{ message: string }> {
    console.log('[DEBUG] AdminController.simulateEmail called with:', dto);
    switch (dto.emailType) {
      case EmailSimulationType.SIGNUP:
        await this.adminService.simulateSignupEmail(dto.email);
        break;
      case EmailSimulationType.PASSWORD_RESET:
        await this.adminService.simulatePasswordResetEmail(dto.email);
        break;
      case EmailSimulationType.EMAIL_CHANGE:
        await this.adminService.simulateEmailChangeEmail(dto.email);
        break;
      case EmailSimulationType.CHAT_NEW_MESSAGE:
        await this.adminService.simulateChatNewMessageEmail(dto.email);
        break;
      case EmailSimulationType.GROUP_MEMBER_ROLE_UPDATED:
        await this.adminService.simulateGroupMemberRoleUpdatedEmail(dto.email);
        break;
      case EmailSimulationType.GROUP_GUEST_JOINED:
        await this.adminService.simulateGroupGuestJoinedEmail(dto.email);
        break;
      case EmailSimulationType.EVENT_ATTENDEE_GUEST_JOINED:
        await this.adminService.simulateEventAttendeeGuestJoinedEmail(dto.email);
        break;
      case EmailSimulationType.EVENT_ATTENDEE_STATUS_CHANGED:
        await this.adminService.simulateEventAttendeeStatusChangedEmail(dto.email);
        break;
      default:
        throw new Error('Unsupported email type');
    }

    return {
      message: `${dto.emailType} email simulation sent successfully to ${dto.email}`,
    };
  }
}
