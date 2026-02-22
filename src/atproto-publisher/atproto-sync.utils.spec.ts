import { markAtprotoSynced } from './atproto-sync.utils';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';

describe('markAtprotoSynced', () => {
  let mockQueryBuilder: Record<string, jest.Mock>;
  let mockRepo: {
    createQueryBuilder: jest.Mock;
    target: typeof EventEntity;
  };

  beforeEach(() => {
    mockQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    mockRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      target: EventEntity,
    };
  });

  it('should use QueryBuilder with raw SQL now() for atprotoSyncedAt', async () => {
    await markAtprotoSynced(mockRepo as any, 42);

    expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith();
    expect(mockQueryBuilder.update).toHaveBeenCalledWith(EventEntity);

    const setArg = mockQueryBuilder.set.mock.calls[0][0];
    expect(typeof setArg.atprotoSyncedAt).toBe('function');
    expect(setArg.atprotoSyncedAt()).toBe('now()');

    expect(mockQueryBuilder.where).toHaveBeenCalledWith('id = :id', { id: 42 });
    expect(mockQueryBuilder.execute).toHaveBeenCalled();
  });

  it('should include optional fields when provided', async () => {
    await markAtprotoSynced(mockRepo as any, 7, {
      atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey1',
      atprotoRkey: 'rkey1',
      atprotoCid: 'cid-123',
    });

    const setArg = mockQueryBuilder.set.mock.calls[0][0];
    expect(setArg.atprotoUri).toBe(
      'at://did:plc:abc/community.lexicon.calendar.event/rkey1',
    );
    expect(setArg.atprotoRkey).toBe('rkey1');
    expect(setArg.atprotoCid).toBe('cid-123');
    expect(typeof setArg.atprotoSyncedAt).toBe('function');
    expect(setArg.atprotoSyncedAt()).toBe('now()');
  });

  it('should only set atprotoSyncedAt when no fields provided', async () => {
    await markAtprotoSynced(mockRepo as any, 99);

    const setArg = mockQueryBuilder.set.mock.calls[0][0];
    // Should only have atprotoSyncedAt, no uri/rkey/cid
    expect(Object.keys(setArg)).toEqual(['atprotoSyncedAt']);
    expect(typeof setArg.atprotoSyncedAt).toBe('function');
    expect(setArg.atprotoSyncedAt()).toBe('now()');
  });

  it('should support partial fields (e.g., only uri and rkey, no cid)', async () => {
    await markAtprotoSynced(mockRepo as any, 5, {
      atprotoUri: 'at://did:plc:xyz/community.lexicon.calendar.event/rkey2',
      atprotoRkey: 'rkey2',
    });

    const setArg = mockQueryBuilder.set.mock.calls[0][0];
    expect(setArg.atprotoUri).toBe(
      'at://did:plc:xyz/community.lexicon.calendar.event/rkey2',
    );
    expect(setArg.atprotoRkey).toBe('rkey2');
    expect(setArg.atprotoCid).toBeUndefined();
    expect(typeof setArg.atprotoSyncedAt).toBe('function');
  });
});
