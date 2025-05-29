import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  EventVisibility,
  GroupVisibility,
} from '../../core/constants/constant';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { GroupService } from '../../group/group.service';
import { EventQueryService } from '../../event/services/event-query.service';

@Injectable()
export class VisibilityGuard implements CanActivate {
  private readonly logger = new Logger(VisibilityGuard.name);
  constructor(
    private readonly eventQueryService: EventQueryService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly groupService: GroupService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const eventSlug = request.headers['x-event-slug'] as string;
    const groupSlug = request.headers['x-group-slug'] as string;

    const user = request.user;

    if (eventSlug) {
      const event = await this.eventQueryService.findEventBySlug(eventSlug);
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
          if (!user) {
            throw new ForbiddenException(
              'This group requires authentication. Please log in to view the group details.',
            );
          }
          break;
        case GroupVisibility.Private:
          if (!user) {
            throw new ForbiddenException(
              'This is a private group. Please log in and request to join to view the group details.',
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
