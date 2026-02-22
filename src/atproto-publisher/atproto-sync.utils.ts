import { Repository } from 'typeorm';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';

/**
 * Update an event's ATProto sync metadata using database now() so that
 * atprotoSyncedAt and @UpdateDateColumn's updatedAt get the same timestamp.
 * Using new Date() from JS creates a 1-7ms gap where updatedAt (set by the DB)
 * is always slightly ahead, causing the sync scheduler to re-process the event.
 */
export async function markAtprotoSynced(
  repo: Repository<EventEntity>,
  id: number,
  fields?: {
    atprotoUri?: string;
    atprotoRkey?: string;
    atprotoCid?: string;
  },
): Promise<void> {
  await repo
    .createQueryBuilder()
    .update(repo.target)
    .set({
      ...fields,
      atprotoSyncedAt: () => 'now()',
    })
    .where('id = :id', { id })
    .execute();
}
