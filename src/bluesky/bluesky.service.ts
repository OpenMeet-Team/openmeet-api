import { Injectable, Logger } from '@nestjs/common';
import { BskyAgent, RichText, AppBskyEmbedImages } from '@atproto/api';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class BlueskyService {
  private readonly logger = new Logger(BlueskyService.name);
  private agent: BskyAgent;

  constructor() {
    this.agent = new BskyAgent({
      service: 'https://bsky.social',
    });
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
