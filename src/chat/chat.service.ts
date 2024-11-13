import { REQUEST } from '@nestjs/core';
import { CommentDto } from '../event/dto/create-event.dto';
import { ZulipService } from '../zulip/zulip.service';
import { UserService } from './../user/user.service';
import { Inject, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class ChatService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly userService: UserService,
    private readonly zulipService: ZulipService,
  ) {}

  async postMessage(userId: number, body: CommentDto) {
    const user = await this.userService.findOne(userId);

    const request = {
      type: 'private',
      to: [user?.zulipId],
      content: body.message,
    };

    try {
      const response = await this.zulipService.PostZulipComment(request);
      console.log('Message sent successfully:', response);
      return response;
    } catch (error) {
      console.error('Error sending message to Zulip:', error);
      throw new Error('Failed to create Zulip topic');
    }
  }

  async userMesages(userId: number) {
    const tenantId = this.request.tenantId;
    const user = await this.userService.findOne(userId);
    const tenantSpecificEmail = `${tenantId}_${user?.email}`;
    const params = {
      narrow: [
        // { operator: "type", operand: "private" },
        { operator: 'pm-with', operand: `${tenantSpecificEmail}` },
      ],
      anchor: 'newest',
      num_before: 100,
      num_after: 0,
    };

    try {
      const response = await this.zulipService.FetchMessages(params);
      console.log('Message sent successfully:', response);
      return response;
    } catch (error) {
      console.error('Error sending message to Zulip:', error);
      throw new Error('Failed to create Zulip topic');
    }
  }

  // async usersConversation(userId1, userId2) {
  //   const user1 = await this.userService.findOne(userId1);
  //   const user2 = await this.userService.findOne(userId2);

  //   const params = {
  //     narrow: [
  //       // { operator: "type", operand: "private" },
  //       {
  //         operator: 'pm-with',
  //         operand: `${'tanzeelsaleemwork@gmail.com'},${'test114@example.com'}`,
  //       },
  //     ],
  //     anchor: 'newest',
  //     num_before: 100,
  //     num_after: 0,
  //   };

  //   try {
  //     const response = await this.zulipService.FetchMessages(params);
  //     console.log('Message sent successfully:', response);
  //     return response;
  //   } catch (error) {
  //     console.error('Error sending message to Zulip:', error);
  //     throw new Error('Failed to create Zulip topic');
  //   }
  // }
}
