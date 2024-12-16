import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventService } from '../../event/event.service';
import {
  EventVisibility,
  GroupVisibility,
} from '../../core/constants/constant';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { GroupService } from '../../group/group.service';
import { GroupMemberService } from '../../group-member/group-member.service';
@Injectable()
export class VisibilityGuard implements CanActivate {
  constructor(
    private readonly eventService: EventService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly groupService: GroupService,
    private readonly groupMemberService: GroupMemberService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const eventSlug = request.headers['x-event-slug'] as string;
    const groupSlug = request.headers['x-group-slug'] as string;

    const user = request.user;

    if (eventSlug) {
      const event = await this.eventService.findEventBySlug(eventSlug);
      if (!event) {
        throw new NotFoundException('VisibilityGuard: Event not found');
      }

      switch (event.visibility) {
        case EventVisibility.Public:
          return true;
        case EventVisibility.Authenticated:
          if (!user) {
            throw new ForbiddenException(
              'VisibilityGuard: This event is not public',
            );
          }
          break;
        case EventVisibility.Private:
          if (!user) {
            throw new ForbiddenException(
              'VisibilityGuard: This event is not public',
            );
          }
          // Check if user is an attendee of the private event
          const eventAttendee =
            await this.eventAttendeeService.findEventAttendeeByUserId(
              event.id,
              user.id,
            );
          if (!eventAttendee) {
            throw new ForbiddenException(
              'VisibilityGuard: You do not have permission to view this private event',
            );
          }
          break;
        default:
          throw new ForbiddenException(
            'VisibilityGuard: Invalid event visibility',
          );
      }
    }

    if (groupSlug) {
      const group = await this.groupService.findGroupBySlug(groupSlug);
      if (!group) {
        throw new NotFoundException('VisibilityGuard: Group not found');
      }

      switch (group.visibility) {
        case GroupVisibility.Public:
          return true;
        case GroupVisibility.Authenticated:
        case GroupVisibility.Private:
          if (!user) {
            throw new ForbiddenException(
              'VisibilityGuard: This group is not public',
            );
          }
          break;
        default:
          throw new ForbiddenException(
            'VisibilityGuard: Invalid group visibility',
          );
      }
    }
    return true;
  }
}
