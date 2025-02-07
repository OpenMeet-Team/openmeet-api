import { stopCleanupInterval } from '../src/database/data-source';

// Global teardown after all tests
afterAll(() => {
  stopCleanupInterval();
}); 