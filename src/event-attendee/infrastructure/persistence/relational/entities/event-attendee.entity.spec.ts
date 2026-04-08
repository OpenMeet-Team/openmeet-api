import 'reflect-metadata';
import { EventAttendeesEntity } from './event-attendee.entity';
import { getMetadataArgsStorage } from 'typeorm';

describe('EventAttendeesEntity', () => {
  describe('eventUri column', () => {
    it('should have an eventUri column defined with type text and nullable', () => {
      const columns = getMetadataArgsStorage().columns.filter(
        (col) => col.target === EventAttendeesEntity,
      );
      const eventUriCol = columns.find(
        (col) => col.propertyName === 'eventUri',
      );

      expect(eventUriCol).toBeDefined();
      expect(eventUriCol!.options.type).toBe('text');
      expect(eventUriCol!.options.nullable).toBe(true);
    });
  });

  describe('event relation', () => {
    it('should have the event relation marked as nullable', () => {
      const relations = getMetadataArgsStorage().relations.filter(
        (rel) =>
          rel.target === EventAttendeesEntity && rel.propertyName === 'event',
      );

      expect(relations).toHaveLength(1);
      const eventRelation = relations[0];

      // Check that the relation options include nullable: true
      const relationOptions =
        typeof eventRelation.options === 'object' ? eventRelation.options : {};
      expect(relationOptions).toHaveProperty('nullable', true);
    });
  });
});
