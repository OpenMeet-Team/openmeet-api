// Try static import at top level
import { createClient } from 'matrix-js-sdk';

describe('Matrix SDK Simple Test (e2e)', () => {
  // Test 1: Try requiring matrix-js-sdk dynamically
  it('should import matrix-js-sdk dynamically', () => {
    try {
      const matrixSdk = require('matrix-js-sdk'); // eslint-disable-line @typescript-eslint/no-require-imports
      console.log('✅ CommonJS require worked:', typeof matrixSdk.createClient);
      expect(typeof matrixSdk.createClient).toBe('function');
    } catch (error) {
      console.log('❌ CommonJS require failed:', error.message);
      throw error;
    }
  });

  // Test 2: Try dynamic ES import
  it('should import matrix-js-sdk with dynamic import', async () => {
    try {
      const matrixSdk = await import('matrix-js-sdk');
      console.log('✅ Dynamic import worked:', typeof matrixSdk.createClient);
      expect(typeof matrixSdk.createClient).toBe('function');
    } catch (error) {
      console.log('❌ Dynamic import failed:', error.message);
      throw error;
    }
  });

  // Test 3: Try top-level static import
  it('should use top-level static import', () => {
    try {
      console.log('✅ Top-level static import worked:', typeof createClient);
      expect(typeof createClient).toBe('function');
    } catch (error) {
      console.log('❌ Top-level static import failed:', error.message);
      throw error;
    }
  });

  // Test 4: Try creating a client with top-level import
  it('should create a Matrix client instance with top-level import', () => {
    try {
      const client = createClient({
        baseUrl: 'http://localhost:8448',
        accessToken: 'fake-token-for-testing',
        userId: '@test:matrix.openmeet.net',
      });

      console.log('✅ Client created:', typeof client);
      console.log(
        'Client methods:',
        Object.getOwnPropertyNames(client).slice(0, 10),
      );

      expect(client).toBeDefined();
      expect(typeof client.createRoom).toBe('function');
    } catch (error) {
      console.log('❌ Client creation failed:', error.message);
      throw error;
    }
  });
});
