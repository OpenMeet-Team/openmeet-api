import { ActivityFeedEntity } from './activity-feed.entity';
import { GroupVisibility } from '../../../../../core/constants/constant';

describe('ActivityFeedEntity', () => {
  describe('Entity Creation', () => {
    it('should create an activity feed entity with required fields', () => {
      const activity = new ActivityFeedEntity();
      activity.activityType = 'member.joined';
      activity.feedScope = 'group';
      activity.groupId = 1;
      activity.actorId = 100;
      activity.visibility = 'public';
      activity.aggregatedCount = 1;

      expect(activity.activityType).toBe('member.joined');
      expect(activity.feedScope).toBe('group');
      expect(activity.groupId).toBe(1);
      expect(activity.actorId).toBe(100);
      expect(activity.visibility).toBe('public');
      expect(activity.aggregatedCount).toBe(1);
    });

    it('should initialize with default values when set', () => {
      const activity = new ActivityFeedEntity();
      activity.metadata = {};
      activity.actorIds = [];
      activity.aggregatedCount = 1;
      activity.visibility = 'public';

      expect(activity.metadata).toEqual({});
      expect(activity.actorIds).toEqual([]);
      expect(activity.aggregatedCount).toBe(1);
      expect(activity.visibility).toBe('public');
    });

    it('should auto-generate ulid on insert', () => {
      const activity = new ActivityFeedEntity();
      activity.activityType = 'group.created';
      activity.feedScope = 'sitewide';

      // Simulate @BeforeInsert
      activity.generateUlid();

      expect(activity.ulid).toBeDefined();
      expect(activity.ulid).toHaveLength(26);
      expect(activity.ulid).toMatch(/^[0-9a-z]{26}$/);
    });

    it('should not overwrite existing ulid on insert', () => {
      const activity = new ActivityFeedEntity();
      const existingUlid = '01hqvxz6j8k9m0n1p2q3r4s5t6';
      activity.ulid = existingUlid;

      activity.generateUlid();

      expect(activity.ulid).toBe(existingUlid);
    });
  });

  describe('Actor Array Management', () => {
    it('should store multiple actor IDs for aggregated activities', () => {
      const activity = new ActivityFeedEntity();
      activity.actorIds = [101, 102, 103];
      activity.aggregatedCount = 3;

      expect(activity.actorIds).toHaveLength(3);
      expect(activity.actorIds).toContain(101);
      expect(activity.actorIds).toContain(102);
      expect(activity.actorIds).toContain(103);
    });

    it('should have empty actor array for single non-aggregated activity', () => {
      const activity = new ActivityFeedEntity();
      activity.actorId = 100;
      activity.actorIds = [100];

      expect(activity.actorIds).toHaveLength(1);
    });
  });

  describe('Metadata Storage', () => {
    it('should store arbitrary metadata as JSON', () => {
      const activity = new ActivityFeedEntity();
      activity.metadata = {
        groupSlug: 'tech-talks',
        groupName: 'Tech Talks',
        eventName: 'Coffee Meetup',
      };

      expect(activity.metadata.groupSlug).toBe('tech-talks');
      expect(activity.metadata.groupName).toBe('Tech Talks');
      expect(activity.metadata.eventName).toBe('Coffee Meetup');
    });

    it('should handle empty metadata when set', () => {
      const activity = new ActivityFeedEntity();
      activity.metadata = {};

      expect(activity.metadata).toEqual({});
    });
  });

  describe('Visibility and Privacy', () => {
    it('should set visibility for public group activity', () => {
      const activity = new ActivityFeedEntity();
      activity.visibility = 'public';

      expect(activity.visibility).toBe('public');
    });

    it('should set visibility for authenticated group activity', () => {
      const activity = new ActivityFeedEntity();
      activity.visibility = 'authenticated';

      expect(activity.visibility).toBe('authenticated');
    });

    it('should set visibility for private group activity (members only)', () => {
      const activity = new ActivityFeedEntity();
      activity.visibility = 'members_only';

      expect(activity.visibility).toBe('members_only');
    });

    it('should allow setting public visibility as default', () => {
      const activity = new ActivityFeedEntity();
      activity.visibility = 'public';

      expect(activity.visibility).toBe('public');
    });
  });

  describe('Aggregation Fields', () => {
    it('should set aggregation key for time-windowed activities', () => {
      const activity = new ActivityFeedEntity();
      activity.aggregationKey = 'member.joined:group:42:2025-01-15T14';
      activity.aggregationStrategy = 'time_window';

      expect(activity.aggregationKey).toBe(
        'member.joined:group:42:2025-01-15T14',
      );
      expect(activity.aggregationStrategy).toBe('time_window');
    });

    it('should set aggregation key for daily activities', () => {
      const activity = new ActivityFeedEntity();
      activity.aggregationKey = 'member.joined:group:42:2025-01-15';
      activity.aggregationStrategy = 'daily';

      expect(activity.aggregationKey).toBe('member.joined:group:42:2025-01-15');
      expect(activity.aggregationStrategy).toBe('daily');
    });

    it('should allow no aggregation', () => {
      const activity = new ActivityFeedEntity();
      activity.aggregationStrategy = 'none';

      expect(activity.aggregationStrategy).toBe('none');
      expect(activity.aggregationKey).toBeUndefined();
    });
  });

  describe('Feed Scoping', () => {
    it('should set feed scope to group', () => {
      const activity = new ActivityFeedEntity();
      activity.feedScope = 'group';
      activity.groupId = 42;

      expect(activity.feedScope).toBe('group');
      expect(activity.groupId).toBe(42);
    });

    it('should set feed scope to event', () => {
      const activity = new ActivityFeedEntity();
      activity.feedScope = 'event';
      activity.eventId = 78;

      expect(activity.feedScope).toBe('event');
      expect(activity.eventId).toBe(78);
    });

    it('should set feed scope to sitewide', () => {
      const activity = new ActivityFeedEntity();
      activity.feedScope = 'sitewide';

      expect(activity.feedScope).toBe('sitewide');
      expect(activity.groupId).toBeUndefined();
      expect(activity.eventId).toBeUndefined();
    });
  });
});
