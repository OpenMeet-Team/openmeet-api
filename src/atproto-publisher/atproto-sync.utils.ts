import { Repository } from 'typeorm';

/**
 * Update an entity's ATProto sync metadata using database now() so that
 * atprotoSyncedAt uses the DB clock, avoiding JS Date ms-precision drift
 * that causes the sync scheduler to re-process records.
 */
export async function markAtprotoSynced<T extends object>(
  repo: Repository<T>,
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
    } as any)
    .where('id = :id', { id })
    .execute();
}
