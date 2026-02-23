import { getMetadataArgsStorage } from 'typeorm';
import { SessionEntity } from './session.entity';

describe('SessionEntity', () => {
  describe('index decorators', () => {
    it('should NOT have a standalone @Index() on the secureId property', () => {
      // The secureId column has unique: true on @Column, which creates a UNIQUE constraint.
      // A separate @Index() would create a redundant non-unique index.
      const indexMetadata = getMetadataArgsStorage().indices.filter(
        (idx) =>
          idx.target === SessionEntity &&
          idx.columns &&
          (idx.columns as string[]).includes('secureId'),
      );

      // There should be no standalone index targeting the secureId column
      expect(indexMetadata).toHaveLength(0);
    });

    it('should still have @Index() on the user relation', () => {
      // The user ManyToOne relation should still have an @Index()
      const allEntityIndices = getMetadataArgsStorage().indices.filter(
        (idx) => idx.target === SessionEntity,
      );

      expect(allEntityIndices.length).toBeGreaterThan(0);
    });
  });
});
