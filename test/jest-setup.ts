import {
  getPublicDataSource,
  destroyPublicDataSource,
  setupAtprotoSchema,
} from './utils/atproto-test-helper';
import { stopCleanupInterval } from '../src/database/data-source';

// Track whether the database was available so teardown can be skipped
let dbAvailable = false;

// Global setup: create ATProto tables before any tests run.
// If the database is not available (e.g., unit test runs without Docker),
// silently skip — unit tests that don't need a DB can still run.
beforeAll(async () => {
  try {
    const dataSource = await getPublicDataSource();
    await setupAtprotoSchema(dataSource);
    dbAvailable = true;
  } catch {
    // Database not available — unit tests that don't need DB can still run
  }
});

// Global teardown after all tests
afterAll(async () => {
  if (dbAvailable) {
    await destroyPublicDataSource();
  }
  stopCleanupInterval();
});
