/**
 * Contrail collection configuration for OpenMeet.
 *
 * Defines which ATProto collections to index and how to query them.
 * Mounted into the Contrail container at runtime.
 *
 * Collections:
 *   - community.lexicon.calendar.event — events with full-text search and RSVP relations
 *   - community.lexicon.calendar.rsvp — RSVPs referencing events
 */
import type { ContrailConfig } from "contrail";

export const config: ContrailConfig = {
  namespace: "rsvp.atmo",
  collections: {
    "community.lexicon.calendar.event": {
      queryable: {
        mode: {},
        name: {},
        status: {},
        startsAt: { type: "range" },
        endsAt: { type: "range" },
        createdAt: { type: "range" },
      },
      searchable: ["name", "description"],
      relations: {
        rsvps: {
          collection: "community.lexicon.calendar.rsvp",
          groupBy: "status",
          count: true,
          countDistinct: "did",
          groups: {
            interested: "community.lexicon.calendar.rsvp#interested",
            going: "community.lexicon.calendar.rsvp#going",
            notgoing: "community.lexicon.calendar.rsvp#notgoing",
          },
        },
      },
    },
    "community.lexicon.calendar.rsvp": {
      queryable: {
        status: {},
        "subject.uri": {},
      },
      references: {
        event: {
          collection: "community.lexicon.calendar.event",
          field: "subject.uri",
        },
      },
    },
  },
};
