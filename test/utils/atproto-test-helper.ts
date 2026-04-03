// test/utils/atproto-test-helper.ts
import { DataSource } from 'typeorm';
import { AppDataSource } from '../../src/database/data-source';

// ---------------------------------------------------------------------------
// Public schema DataSource (reuses AppDataSource with empty tenant)
// ---------------------------------------------------------------------------

export async function getPublicDataSource(): Promise<DataSource> {
  const ds = AppDataSource('');
  if (!ds.isInitialized) await ds.initialize();
  return ds;
}

export async function destroyPublicDataSource(): Promise<void> {
  const ds = AppDataSource('');
  if (ds.isInitialized) {
    await ds.destroy();
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AtprotoTestScenario {
  events: AtprotoEventSeed[];
  rsvps: AtprotoRsvpSeed[];
  identities: AtprotoIdentitySeed[];
  geoEntries: AtprotoGeoSeed[];
}

export interface AtprotoEventSeed {
  uri: string;
  did: string;
  rkey: string;
  cid: string;
  record: Record<string, unknown>;
}

export interface AtprotoRsvpSeed {
  uri: string;
  did: string;
  rkey: string;
  cid: string;
  record: Record<string, unknown>;
}

export interface AtprotoIdentitySeed {
  did: string;
  handle: string;
  pds: string;
}

export interface AtprotoGeoSeed {
  uri: string;
  locationIdx: number;
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Schema lifecycle
// ---------------------------------------------------------------------------

/**
 * Create ATProto tables in the public schema.
 * Safe to call repeatedly (uses IF NOT EXISTS).
 *
 * NOTE: These mirror Contrail's production schema. If Contrail changes its
 * table definitions, update here. Source: Contrail src/core/types.ts
 */
export async function setupAtprotoSchema(ds: DataSource): Promise<void> {
  await ds.query(`
    CREATE TABLE IF NOT EXISTS records_community_lexicon_calendar_event (
      uri TEXT PRIMARY KEY,
      did TEXT NOT NULL,
      rkey TEXT NOT NULL,
      cid TEXT,
      record JSONB,
      time_us BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000000)::BIGINT,
      indexed_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000000)::BIGINT,
      search_vector TSVECTOR
    )
  `);

  await ds.query(`
    CREATE INDEX IF NOT EXISTS idx_atproto_event_search
    ON records_community_lexicon_calendar_event USING GIN (search_vector)
  `);

  await ds.query(`
    CREATE TABLE IF NOT EXISTS records_community_lexicon_calendar_rsvp (
      uri TEXT PRIMARY KEY,
      did TEXT NOT NULL,
      rkey TEXT NOT NULL,
      cid TEXT,
      record JSONB,
      time_us BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000000)::BIGINT,
      indexed_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000000)::BIGINT
    )
  `);

  await ds.query(`
    CREATE TABLE IF NOT EXISTS identities (
      did TEXT PRIMARY KEY,
      handle TEXT,
      pds TEXT,
      resolved_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000000)::BIGINT
    )
  `);

  // atproto_geo_index already exists via migration 1774622839659
}

export async function teardownAtprotoSchema(ds: DataSource): Promise<void> {
  await ds.query(
    `DROP TABLE IF EXISTS records_community_lexicon_calendar_rsvp`,
  );
  await ds.query(
    `DROP TABLE IF EXISTS records_community_lexicon_calendar_event`,
  );
  await ds.query(`DROP TABLE IF EXISTS identities`);
  // Leave atproto_geo_index — it's migration-managed
}

// ---------------------------------------------------------------------------
// Data lifecycle
// ---------------------------------------------------------------------------

export async function seedAtprotoData(
  ds: DataSource,
  scenario: AtprotoTestScenario,
): Promise<void> {
  // Seed identities
  for (const id of scenario.identities) {
    await ds.query(
      `INSERT INTO identities (did, handle, pds, resolved_at)
       VALUES ($1, $2, $3, (EXTRACT(EPOCH FROM NOW()) * 1000000)::BIGINT)
       ON CONFLICT (did) DO UPDATE SET handle = $2, pds = $3,
       resolved_at = (EXTRACT(EPOCH FROM NOW()) * 1000000)::BIGINT`,
      [id.did, id.handle, id.pds],
    );
  }

  // Seed events (include time_us and indexed_at — Contrail tables have NOT NULL without defaults)
  const nowUs = BigInt(Date.now()) * 1000n;
  for (const evt of scenario.events) {
    await ds.query(
      `INSERT INTO records_community_lexicon_calendar_event (uri, did, rkey, cid, record, time_us, indexed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (uri) DO UPDATE SET record = $5`,
      [
        evt.uri,
        evt.did,
        evt.rkey,
        evt.cid,
        JSON.stringify(evt.record),
        nowUs.toString(),
      ],
    );
  }

  // search_vector is a generated column in the real Contrail table — auto-maintained by PostgreSQL

  // Seed RSVPs (include time_us and indexed_at — Contrail tables have NOT NULL without defaults)
  for (const rsvp of scenario.rsvps) {
    await ds.query(
      `INSERT INTO records_community_lexicon_calendar_rsvp (uri, did, rkey, cid, record, time_us, indexed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (uri) DO UPDATE SET record = $5`,
      [
        rsvp.uri,
        rsvp.did,
        rsvp.rkey,
        rsvp.cid,
        JSON.stringify(rsvp.record),
        nowUs.toString(),
      ],
    );
  }

  // Seed geo entries
  for (const geo of scenario.geoEntries) {
    await ds.query(
      `INSERT INTO atproto_geo_index (uri, location_idx, location)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)
       ON CONFLICT (uri, location_idx) DO UPDATE SET location = ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography`,
      [geo.uri, geo.locationIdx, geo.lon, geo.lat],
    );
  }
}

export async function clearAtprotoData(ds: DataSource): Promise<void> {
  await ds.query(`DELETE FROM atproto_geo_index`);
  await ds.query(`DELETE FROM records_community_lexicon_calendar_rsvp`);
  await ds.query(`DELETE FROM records_community_lexicon_calendar_event`);
  await ds.query(`DELETE FROM identities`);
}

// ---------------------------------------------------------------------------
// Convenience builders
// ---------------------------------------------------------------------------

export function buildEventRecord(
  overrides: Partial<{
    name: string;
    description: string;
    startsAt: string;
    endsAt: string;
    mode: string;
    locations: Array<Record<string, unknown>>;
  }> = {},
): Record<string, unknown> {
  const startsAt =
    overrides.startsAt ?? new Date(Date.now() + 7 * 86400000).toISOString();
  const endsAt =
    overrides.endsAt ??
    new Date(new Date(startsAt).getTime() + 3600000).toISOString();
  return {
    $type: 'community.lexicon.calendar.event',
    name: overrides.name ?? 'Test ATProto Event',
    description: overrides.description ?? 'A test event from ATProto',
    startsAt,
    endsAt,
    mode: overrides.mode ?? 'community.lexicon.calendar.event#inperson',
    locations: overrides.locations ?? [],
    ...overrides,
  };
}

export function buildRsvpRecord(
  eventUri: string,
  status: 'going' | 'interested' | 'notgoing' = 'going',
): Record<string, unknown> {
  return {
    $type: 'community.lexicon.calendar.rsvp',
    subject: eventUri,
    status,
  };
}

/**
 * Build the full 7-event test scenario described in the spec.
 *
 * Events #1 (pure ATProto) and #2/#5/#6 (OpenMeet public/cancelled/group)
 * get ATProto table entries. Events #3/#4/#7 are tenant-only.
 *
 * @param tenantEventUris - Map of event number (2,5,6) to their atprotoUri
 *   after being created in the tenant DB. These are needed so the ATProto
 *   table URIs match what the tenant DB has, enabling deduplication.
 */
export function buildTestScenario(tenantEventUris: {
  event2Uri: string;
  event5Uri: string;
  event6Uri: string;
}): AtprotoTestScenario {
  const externalDid = 'did:plc:external1test';
  const omUserDid = 'did:plc:omuser1test';

  const futureDate = new Date(Date.now() + 7 * 86400000).toISOString();
  const futureEndDate = new Date(
    new Date(futureDate).getTime() + 3600000,
  ).toISOString();

  // Event #1: Pure ATProto (external origin)
  const event1Uri = `at://${externalDid}/community.lexicon.calendar.event/event1test`;
  const event1: AtprotoEventSeed = {
    uri: event1Uri,
    did: externalDid,
    rkey: 'event1test',
    cid: 'bafyevent1cid',
    record: buildEventRecord({
      name: 'External ATProto Meetup',
      description: 'A community event from an external ATProto user',
      startsAt: futureDate,
      endsAt: futureEndDate,
      locations: [
        {
          name: 'Louisville Community Center',
          latitude: '38.25',
          longitude: '-85.76',
        },
      ],
    }),
  };

  // Event #2: OpenMeet public (published to PDS) — URI from tenant
  const event2: AtprotoEventSeed = {
    uri: tenantEventUris.event2Uri,
    did: omUserDid,
    rkey: 'event2test',
    cid: 'bafyevent2cid',
    record: buildEventRecord({
      name: 'OpenMeet Public Gathering',
      description: 'A public OpenMeet event also on ATProto',
      startsAt: futureDate,
      endsAt: futureEndDate,
      locations: [
        {
          name: 'Louisville Tech Hub',
          latitude: '38.26',
          longitude: '-85.75',
        },
      ],
    }),
  };

  // Event #5: Cancelled (was public) — URI from tenant
  const event5: AtprotoEventSeed = {
    uri: tenantEventUris.event5Uri,
    did: omUserDid,
    rkey: 'event5test',
    cid: 'bafyevent5cid',
    record: buildEventRecord({
      name: 'Cancelled Workshop',
      description: 'This event was cancelled after being published',
      startsAt: futureDate,
      endsAt: futureEndDate,
    }),
  };

  // Event #6: Group public event — URI from tenant
  const event6: AtprotoEventSeed = {
    uri: tenantEventUris.event6Uri,
    did: omUserDid,
    rkey: 'event6test',
    cid: 'bafyevent6cid',
    record: buildEventRecord({
      name: 'Group Tech Meetup',
      description: 'A public group event in Lexington',
      startsAt: futureDate,
      endsAt: futureEndDate,
      locations: [
        {
          name: 'Lexington Convention Center',
          latitude: '38.04',
          longitude: '-84.50',
        },
      ],
    }),
  };

  // RSVPs for event #1 (3 RSVPs: 2 going, 1 interested)
  const rsvp1a: AtprotoRsvpSeed = {
    uri: `at://did:plc:rsvper1/community.lexicon.calendar.rsvp/rsvp1a`,
    did: 'did:plc:rsvper1',
    rkey: 'rsvp1a',
    cid: 'bafyrsvp1acid',
    record: buildRsvpRecord(event1Uri, 'going'),
  };
  const rsvp1b: AtprotoRsvpSeed = {
    uri: `at://did:plc:rsvper2/community.lexicon.calendar.rsvp/rsvp1b`,
    did: 'did:plc:rsvper2',
    rkey: 'rsvp1b',
    cid: 'bafyrsvp1bcid',
    record: buildRsvpRecord(event1Uri, 'going'),
  };
  const rsvp1c: AtprotoRsvpSeed = {
    uri: `at://did:plc:rsvper3/community.lexicon.calendar.rsvp/rsvp1c`,
    did: 'did:plc:rsvper3',
    rkey: 'rsvp1c',
    cid: 'bafyrsvp1ccid',
    record: buildRsvpRecord(event1Uri, 'interested'),
  };

  // RSVPs for event #2 (2 going)
  const rsvp2a: AtprotoRsvpSeed = {
    uri: `at://did:plc:rsvper1/community.lexicon.calendar.rsvp/rsvp2a`,
    did: 'did:plc:rsvper1',
    rkey: 'rsvp2a',
    cid: 'bafyrsvp2acid',
    record: buildRsvpRecord(tenantEventUris.event2Uri, 'going'),
  };
  const rsvp2b: AtprotoRsvpSeed = {
    uri: `at://did:plc:rsvper2/community.lexicon.calendar.rsvp/rsvp2b`,
    did: 'did:plc:rsvper2',
    rkey: 'rsvp2b',
    cid: 'bafyrsvp2bcid',
    record: buildRsvpRecord(tenantEventUris.event2Uri, 'going'),
  };

  return {
    events: [event1, event2, event5, event6],
    rsvps: [rsvp1a, rsvp1b, rsvp1c, rsvp2a, rsvp2b],
    identities: [
      {
        did: externalDid,
        handle: 'external-user.test',
        pds: 'https://pds.external.test',
      },
      {
        did: omUserDid,
        handle: 'omuser.test',
        pds: 'https://pds.openmeet.test',
      },
    ],
    geoEntries: [
      // Event #1: Louisville, KY
      { uri: event1Uri, locationIdx: 0, lat: 38.25, lon: -85.76 },
      // Event #2: Louisville, KY
      {
        uri: tenantEventUris.event2Uri,
        locationIdx: 0,
        lat: 38.26,
        lon: -85.75,
      },
      // Event #6: Lexington, KY
      {
        uri: tenantEventUris.event6Uri,
        locationIdx: 0,
        lat: 38.04,
        lon: -84.5,
      },
    ],
  };
}
