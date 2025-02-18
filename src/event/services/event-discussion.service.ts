import { Injectable, Scope, Inject, Logger } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ZulipService } from '../../zulip/zulip.service';
import { UserService } from '../../user/user.service';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';

@Injectable({ scope: Scope.REQUEST })
export class EventDiscussionService {
  private readonly logger = new Logger(EventDiscussionService.name);
  private readonly tracer = trace.getTracer('event-discussion-service');
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly zulipService: ZulipService,
    private readonly userService: UserService,
  ) {
    void this.initializeRepository();
  }

  @Trace('event-discussion.initializeRepository')
  private async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  @Trace('event-discussion.sendEventDiscussionMessage')
  async sendEventDiscussionMessage(
    slug: string,
    userId: number,
    body: { message: string; topicName: string },
  ): Promise<{ id: number }> {
    await this.initializeRepository();

    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new Error(`Event with slug ${slug} not found`);
    }

    const user = await this.userService.getUserById(userId);

    const eventChannelName = `tenant_${this.request.tenantId}__event_${event.ulid}`;

    if (!event.zulipChannelId) {
      // create channel
      await this.zulipService.subscribeAdminToChannel({
        subscriptions: [
          {
            name: eventChannelName,
          },
        ],
      });
      const stream = await this.zulipService.getAdminStreamId(eventChannelName);

      event.zulipChannelId = stream.id;
      await this.eventRepository.save(event);
    }

    await this.zulipService.getInitialisedClient(user);
    await user.reload();

    const params = {
      to: event.zulipChannelId,
      type: 'channel' as const,
      topic: body.topicName,
      content: body.message,
    };

    return await this.zulipService.sendUserMessage(user, params);
  }

  @Trace('event-discussion.updateEventDiscussionMessage')
  async updateEventDiscussionMessage(
    messageId: number,
    message: string,
    userId: number,
  ): Promise<{ id: number }> {
    const user = await this.userService.getUserById(userId);
    return await this.zulipService.updateUserMessage(user, messageId, message);
  }

  @Trace('event-discussion.deleteEventDiscussionMessage')
  async deleteEventDiscussionMessage(
    messageId: number,
  ): Promise<{ id: number }> {
    return await this.zulipService.deleteAdminMessage(messageId);
  }
}
