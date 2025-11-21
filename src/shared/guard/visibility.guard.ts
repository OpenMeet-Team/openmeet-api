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
  EventStatus,
} from '../../core/constants/constant';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { GroupService } from '../../group/group.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventQueryService } from '../../event/services/event-query.service';

@Injectable()
export class VisibilityGuard implements CanActivate {
  private readonly logger = new Logger(VisibilityGuard.name);
  constructor(
    private readonly eventQueryService: EventQueryService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly groupService: GroupService,
    private readonly groupMemberService: GroupMemberService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Determine entity type from route path
    // Check group routes first as they may contain '/events' in the path (e.g., /groups/:slug/events)
    const path = request.route?.path || request.url;
    const isGroupRoute = path.includes('/groups');
    const isEventRoute = !isGroupRoute && path.includes('/events');

    // Read from params first (standard REST pattern), fallback to headers for backwards compatibility
    const eventSlug = isEventRoute
      ? ((request.params?.slug || request.headers['x-event-slug']) as string)
      : (request.headers['x-event-slug'] as string);
    const groupSlug = isGroupRoute
      ? ((request.params?.slug || request.headers['x-group-slug']) as string)
      : (request.headers['x-group-slug'] as string);

    const user = request.user;

    if (eventSlug) {
      const event = await this.eventQueryService.findEventBySlug(eventSlug);
      if (!event) {
        throw new NotFoundException('VisibilityGuard: Event not found');
      }

      // Only allow access to published and cancelled events
      // Draft and pending events should only be accessible via dashboard/edit routes
      if (
        event.status !== EventStatus.Published &&
        event.status !== EventStatus.Cancelled
      ) {
        throw new NotFoundException('VisibilityGuard: Event not found');
      }

      switch (event.visibility) {
        case EventVisibility.Public:
        case EventVisibility.Unlisted:
          // Public and Unlisted events are accessible without authentication
          // Unlisted means hidden from listings but accessible via direct link
          return true;
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

          if (eventAttendee) {
            // User is an attendee, allow access
            break;
          }

          // User is not an attendee, check if they're a member of the event's group
          if (event.group?.id) {
            const groupMember =
              await this.groupMemberService.findGroupMemberByUserId(
                event.group.id,
                user.id,
              );

            if (groupMember) {
              // User is a group member, allow access
              break;
            }
          }

          // User is neither an attendee nor a group member
          throw new ForbiddenException(
            'VisibilityGuard: You do not have permission to view this private event',
          );
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
        case GroupVisibility.Unlisted:
          // Public and Unlisted groups are accessible without authentication
          // Unlisted means hidden from listings but accessible via direct link
          return true;
        case GroupVisibility.Private:
          if (!user) {
            throw new ForbiddenException(
              'This is a private group. Please log in and request to join to view the group details.',
            );
          }
          // Check if user is a member of the private group
          const groupMember =
            await this.groupMemberService.findGroupMemberByUserId(
              group.id,
              user.id,
            );
          if (!groupMember) {
            throw new ForbiddenException(
              'You must be a member of this private group to access it.',
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
