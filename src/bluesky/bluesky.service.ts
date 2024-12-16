import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BskyAgent, RichText, AppBskyEmbedImages } from '@atproto/api';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { EventIngestionService } from '../event-ingestion/event-ingestion.service';
import { CreateEventDto } from '../event/dto/create-event.dto';

@Injectable()
export class BlueskyService implements OnModuleInit {
  private readonly logger = new Logger(BlueskyService.name);
  private agent: BskyAgent;
  private pollInterval: NodeJS.Timeout;

  constructor(
    private configService: ConfigService,
    private eventIngestionService: EventIngestionService,
  ) {
    this.logger.debug('Initializing Bluesky service');
    this.agent = new BskyAgent({
      service: 'https://bsky.social',
    });
  }

  async onModuleInit() {
    this.logger.debug('onModuleInit Initializing Bluesky service');
    // login when the service starts
    await this.login({
      identifier: this.configService.get('BLUESKY_HANDLE', {
        infer: true,
      }) as string,
      password: this.configService.get('BLUESKY_PASSWORD', {
        infer: true,
      }) as string,
    });
    this.logger.debug('Login successful');

    // Start polling for mentions
    this.logger.log('Starting mention polling');
    await this.startMentionPolling();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async startMentionPolling() {
    let lastNotificationSeen = Date.now();

    this.pollInterval = setInterval(async () => {
      this.logger.debug('Polling for mentions');
      try {
        const notifications = await this.getNotifications(50);
        const newMentions = notifications.notifications.filter(
          (notif) =>
            notif.reason === 'mention' &&
            new Date(notif.indexedAt).getTime() > lastNotificationSeen,
        );

        for (const mention of newMentions) {
          await this.handleMention(mention);
        }

        if (notifications.notifications.length > 0) {
          lastNotificationSeen = new Date(
            notifications.notifications[0].indexedAt,
          ).getTime();
        }
      } catch (error) {
        this.logger.error('Error polling mentions:', error);
      }
    }, 30000); // Poll every 30 seconds
  }

  private async handleMention(mention: any) {
    try {
      const post = mention.record;
      const text = post.text.toLowerCase();

      if (text.includes('create event')) {
        try {
          // Use the event ingestion service to create the event
          // const event = await this.eventIngestionService.ingestFromText(text);
          const event = new CreateEventDto();
          if (event) {
            await this.createEventResponse(mention, event);
          } else {
            await this.createPost(
              `@${mention.author.handle} Sorry, I couldn't parse the event details. Please provide more details about the event including title, date, and location.`,
            );
          }
        } catch (error) {
          this.logger.error('Error creating event:', error);
          await this.createPost(
            `@${mention.author.handle} Sorry, there was an error creating the event. Please try again.`,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error handling mention:', error);
    }
  }

  private async createEventResponse(mention: any, event: CreateEventDto) {
    const response =
      `@${mention.author.handle} Event created!\n\n` +
      `${event.name}\n` +
      `📆 Date: ${event.startDate}\n` +
      (event.location ? `📍 Location: ${event.location}\n` : '') +
      (event.description ? `📝 ${event.description}` : '');

    await this.createPost(response);
  }

  /**
   * Login to Bluesky with credentials
   */
  async login(loginDto: LoginDto) {
    this.logger.debug('Login attempt');

    try {
      const response = await this.agent.login(loginDto);
      this.logger.debug('Login successful');
      return response;
    } catch (error) {
      this.logger.error('Login error:', error);
      throw new Error(`Bluesky login failed: ${error.message}`);
    }
  }

  /**
   * Create a post with optional images
   */
  async createPost(text: string, images?: { data: Buffer; alt: string }[]) {
    if (!this.agent.session) {
      throw new Error('Not logged in');
    }

    try {
      let embed: AppBskyEmbedImages.Main | undefined;

      if (images?.length) {
        const imageRefs = await Promise.all(
          images.map(async (img) => {
            const upload = await this.agent.uploadBlob(img.data, {
              encoding: 'image/jpeg',
            });
            return {
              image: upload.data.blob,
              alt: img.alt,
            };
          }),
        );

        embed = {
          $type: 'app.bsky.embed.images',
          images: imageRefs,
        };
      }

      const rt = new RichText({ text });
      await rt.detectFacets(this.agent);

      const response = await this.agent.post({
        text: rt.text,
        facets: rt.facets,
        embed: embed,
      });

      return response;
    } catch (error) {
      throw new Error(`Failed to create post: ${error.message}`);
    }
  }

  /**
   * Get the user's timeline
   */
  async getTimeline(limit = 50) {
    if (!this.agent.session) {
      throw new Error('Not logged in');
    }

    try {
      const response = await this.agent.getTimeline({ limit });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get timeline: ${error.message}`);
    }
  }

  /**
   * Follow a user
   */
  async followUser(handle: string) {
    if (!this.agent.session) {
      throw new Error('Not logged in');
    }

    try {
      const profile = await this.agent.getProfile({ actor: handle });
      const response = await this.agent.follow(profile.data.did);
      return response;
    } catch (error) {
      throw new Error(`Failed to follow user: ${error.message}`);
    }
  }

  /**
   * Like a post
   */
  async likePost(uri: string, cid: string) {
    if (!this.agent.session) {
      throw new Error('Not logged in');
    }

    try {
      const response = await this.agent.like(uri, cid);
      return response;
    } catch (error) {
      throw new Error(`Failed to like post: ${error.message}`);
    }
  }

  /**
   * Get notifications
   */
  async getNotifications(limit = 50) {
    if (!this.agent.session) {
      throw new Error('Not logged in');
    }

    try {
      const response = await this.agent.listNotifications({ limit });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get notifications: ${error.message}`);
    }
  }

  /**
   * Get a user's profile
   */
  async getProfile(handle: string) {
    try {
      const response = await this.agent.getProfile({
        actor: handle,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get profile: ${error.message}`);
    }
  }

  /**
   * Get recent posts from a user
   */
  async getUserFeed(handle: string) {
    try {
      const response = await this.agent.getAuthorFeed({
        actor: handle,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get user feed: ${error.message}`);
    }
  }
}
