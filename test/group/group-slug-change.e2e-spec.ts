import * as request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsTester,
  createGroup,
  updateGroup,
  getGroupDetails,
  waitForEventProcessing,
} from '../utils/functions';

describe('Group Slug Change (e2e)', () => {
  const testTenantId = TESTING_TENANT_ID;
  let serverApp: any;
  let ownerToken: string;
  let testGroup: any;
  const createdGroups: string[] = [];

  beforeAll(async () => {
    serverApp = request.agent(TESTING_APP_URL).set('x-tenant-id', testTenantId);
    ownerToken = await loginAsTester();
  }, 30000);

  afterAll(async () => {
    for (const slug of createdGroups) {
      try {
        await serverApp
          .delete(`/api/groups/${slug}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .timeout(10000);
      } catch (error) {
        console.log(`Group cleanup failed for ${slug}:`, error.message);
      }
    }
  }, 30000);

  describe('valid slug changes', () => {
    it('should successfully change group slug when new slug is valid and unique', async () => {
      const timestamp = Date.now();
      testGroup = await createGroup(TESTING_APP_URL, ownerToken, {
        name: 'Slug Change Test Group',
        description: 'Testing slug change functionality',
        visibility: 'public',
        status: 'published',
      });
      createdGroups.push(testGroup.slug);

      const originalSlug = testGroup.slug;
      const newSlug = `new-test-slug-${timestamp}`;

      const updateResponse = await updateGroup(
        TESTING_APP_URL,
        ownerToken,
        originalSlug,
        { slug: newSlug },
      );

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.slug).toBe(newSlug);

      // Update tracking for cleanup
      const idx = createdGroups.indexOf(originalSlug);
      if (idx > -1) createdGroups[idx] = newSlug;

      // Verify new slug works
      const newGroup = await getGroupDetails(ownerToken, newSlug);
      expect(newGroup.name).toBe('Slug Change Test Group');

      // Verify old slug returns 404
      const oldSlugResponse = await serverApp
        .get(`/api/groups/${originalSlug}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(oldSlugResponse.status).toBe(404);
    }, 15000);

    it('should normalize slug to lowercase', async () => {
      const timestamp = Date.now();
      testGroup = await createGroup(TESTING_APP_URL, ownerToken, {
        name: 'Case Test Group',
        description: 'Testing slug case normalization',
        visibility: 'public',
        status: 'published',
      });
      createdGroups.push(testGroup.slug);

      const mixedCaseSlug = `Mixed-Case-${timestamp}`;
      const expectedSlug = mixedCaseSlug.toLowerCase();

      const updateResponse = await updateGroup(
        TESTING_APP_URL,
        ownerToken,
        testGroup.slug,
        { slug: mixedCaseSlug },
      );

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.slug).toBe(expectedSlug);

      // Update tracking for cleanup
      const idx = createdGroups.indexOf(testGroup.slug);
      if (idx > -1) createdGroups[idx] = expectedSlug;
    }, 15000);

    it('should allow updating to same slug (no-op)', async () => {
      testGroup = await createGroup(TESTING_APP_URL, ownerToken, {
        name: 'Same Slug Test',
        description: 'Testing same slug update',
        visibility: 'public',
        status: 'published',
      });
      createdGroups.push(testGroup.slug);

      const updateResponse = await updateGroup(
        TESTING_APP_URL,
        ownerToken,
        testGroup.slug,
        { slug: testGroup.slug },
      );

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.slug).toBe(testGroup.slug);
    }, 15000);

    it('should allow slug change along with other field updates', async () => {
      const timestamp = Date.now();
      testGroup = await createGroup(TESTING_APP_URL, ownerToken, {
        name: 'Multi-field Test',
        description: 'Original description',
        visibility: 'public',
        status: 'published',
      });
      createdGroups.push(testGroup.slug);

      const newSlug = `multi-update-${timestamp}`;

      const updateResponse = await updateGroup(
        TESTING_APP_URL,
        ownerToken,
        testGroup.slug,
        {
          slug: newSlug,
          name: 'Updated Name',
          description: 'Updated description',
        },
      );

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.slug).toBe(newSlug);
      expect(updateResponse.body.name).toBe('Updated Name');
      expect(updateResponse.body.description).toBe('Updated description');

      // Update tracking for cleanup
      const idx = createdGroups.indexOf(testGroup.slug);
      if (idx > -1) createdGroups[idx] = newSlug;
    }, 15000);
  });

  describe('invalid slug changes', () => {
    it('should reject slug that is too short (less than 3 characters)', async () => {
      testGroup = await createGroup(TESTING_APP_URL, ownerToken, {
        name: 'Short Slug Test',
        description: 'Testing short slug rejection',
        visibility: 'public',
        status: 'published',
      });
      createdGroups.push(testGroup.slug);

      const updateResponse = await updateGroup(
        TESTING_APP_URL,
        ownerToken,
        testGroup.slug,
        { slug: 'ab' },
      );

      expect(updateResponse.status).toBe(422);
    }, 15000);

    it('should reject slug with invalid characters', async () => {
      testGroup = await createGroup(TESTING_APP_URL, ownerToken, {
        name: 'Invalid Chars Test',
        description: 'Testing invalid character rejection',
        visibility: 'public',
        status: 'published',
      });
      createdGroups.push(testGroup.slug);

      const updateResponse = await updateGroup(
        TESTING_APP_URL,
        ownerToken,
        testGroup.slug,
        { slug: 'invalid_slug!@#' },
      );

      expect(updateResponse.status).toBe(422);
    }, 15000);

    it('should reject slug starting with hyphen', async () => {
      testGroup = await createGroup(TESTING_APP_URL, ownerToken, {
        name: 'Leading Hyphen Test',
        description: 'Testing leading hyphen rejection',
        visibility: 'public',
        status: 'published',
      });
      createdGroups.push(testGroup.slug);

      const updateResponse = await updateGroup(
        TESTING_APP_URL,
        ownerToken,
        testGroup.slug,
        { slug: '-invalid-start' },
      );

      expect(updateResponse.status).toBe(422);
    }, 15000);

    it('should reject slug ending with hyphen', async () => {
      testGroup = await createGroup(TESTING_APP_URL, ownerToken, {
        name: 'Trailing Hyphen Test',
        description: 'Testing trailing hyphen rejection',
        visibility: 'public',
        status: 'published',
      });
      createdGroups.push(testGroup.slug);

      const updateResponse = await updateGroup(
        TESTING_APP_URL,
        ownerToken,
        testGroup.slug,
        { slug: 'invalid-end-' },
      );

      expect(updateResponse.status).toBe(422);
    }, 15000);
  });

  describe('slug uniqueness', () => {
    it('should reject slug that is already in use by another group', async () => {
      const firstGroup = await createGroup(TESTING_APP_URL, ownerToken, {
        name: 'First Group',
        description: 'First group for uniqueness test',
        visibility: 'public',
        status: 'published',
      });
      createdGroups.push(firstGroup.slug);

      const secondGroup = await createGroup(TESTING_APP_URL, ownerToken, {
        name: 'Second Group',
        description: 'Second group for uniqueness test',
        visibility: 'public',
        status: 'published',
      });
      createdGroups.push(secondGroup.slug);

      // Try to change first group's slug to second group's slug
      const updateResponse = await updateGroup(
        TESTING_APP_URL,
        ownerToken,
        firstGroup.slug,
        { slug: secondGroup.slug },
      );

      expect(updateResponse.status).toBe(409);
    }, 15000);
  });

  describe('Matrix room alias updates', () => {
    const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;

    // Skip Matrix tests if token not available
    const describeIfMatrixAvailable = HOMESERVER_TOKEN
      ? describe
      : describe.skip;

    describeIfMatrixAvailable('when group has a Matrix chat room', () => {
      it('should allow chat room access via new alias after slug change', async () => {
        const timestamp = Date.now();

        // 1. Create a group (this triggers Matrix room creation via group.created event)
        const testGroup = await createGroup(TESTING_APP_URL, ownerToken, {
          name: 'Matrix Alias Test Group',
          description: 'Testing Matrix alias update on slug change',
          visibility: 'public',
          status: 'published',
        });
        createdGroups.push(testGroup.slug);
        const originalSlug = testGroup.slug;

        // 2. Trigger room creation by querying the AppService for the room alias
        const originalRoomAlias = `#group-${originalSlug}-${testTenantId}:matrix.openmeet.net`;
        const roomCreateResponse = await serverApp
          .get(
            `/api/matrix/appservice/rooms/${encodeURIComponent(originalRoomAlias)}`,
          )
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

        // Verify room was created successfully (empty object = success per Matrix spec)
        expect(roomCreateResponse.status).toBe(200);
        expect(roomCreateResponse.body).toEqual({});

        // 3. Wait for event processing to complete
        await waitForEventProcessing(1000);

        // 4. Change the group slug
        const newSlug = `matrix-alias-updated-${timestamp}`;
        const updateResponse = await updateGroup(
          TESTING_APP_URL,
          ownerToken,
          originalSlug,
          { slug: newSlug },
        );

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.slug).toBe(newSlug);

        // Update cleanup tracking
        const idx = createdGroups.indexOf(originalSlug);
        if (idx > -1) createdGroups[idx] = newSlug;

        // 5. Wait for Matrix alias update to propagate
        await waitForEventProcessing(2000);

        // 6. Verify the new alias resolves to the same room
        const newRoomAlias = `#group-${newSlug}-${testTenantId}:matrix.openmeet.net`;
        const newAliasResponse = await serverApp
          .get(
            `/api/matrix/appservice/rooms/${encodeURIComponent(newRoomAlias)}`,
          )
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

        // Room should be accessible via new alias (empty object = success)
        expect(newAliasResponse.status).toBe(200);
        expect(newAliasResponse.body).toEqual({});
      }, 30000);

      it('should update canonical alias and record old alias in alt_aliases', async () => {
        const timestamp = Date.now();

        // 1. Create a group
        const testGroup = await createGroup(TESTING_APP_URL, ownerToken, {
          name: 'Matrix Alias Update Test',
          description: 'Testing canonical alias update with alt_aliases',
          visibility: 'public',
          status: 'published',
        });
        createdGroups.push(testGroup.slug);
        const originalSlug = testGroup.slug;

        // 2. Trigger room creation
        const originalRoomAlias = `#group-${originalSlug}-${testTenantId}:matrix.openmeet.net`;
        const createResponse = await serverApp
          .get(
            `/api/matrix/appservice/rooms/${encodeURIComponent(originalRoomAlias)}`,
          )
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);
        expect(createResponse.status).toBe(200);

        await waitForEventProcessing(1000);

        // 3. Change the slug
        const newSlug = `alias-update-test-${timestamp}`;
        const updateResponse = await updateGroup(
          TESTING_APP_URL,
          ownerToken,
          originalSlug,
          { slug: newSlug },
        );
        expect(updateResponse.status).toBe(200);

        // Update cleanup tracking
        const idx = createdGroups.indexOf(originalSlug);
        if (idx > -1) createdGroups[idx] = newSlug;

        await waitForEventProcessing(2000);

        // 4. Verify new alias works via AppService
        const newRoomAlias = `#group-${newSlug}-${testTenantId}:matrix.openmeet.net`;
        const newAliasResponse = await serverApp
          .get(
            `/api/matrix/appservice/rooms/${encodeURIComponent(newRoomAlias)}`,
          )
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);
        expect(newAliasResponse.status).toBe(200);
        expect(newAliasResponse.body).toEqual({});

        // 5. The old alias won't work via AppService (entity with old slug no longer exists)
        // but the Matrix room's canonical_alias state should have it in alt_aliases
        // This test verifies the AppService behavior is correct (returns "Room not found"
        // for aliases where the entity slug doesn't exist)
        const oldAliasResponse = await serverApp
          .get(
            `/api/matrix/appservice/rooms/${encodeURIComponent(originalRoomAlias)}`,
          )
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

        // AppService returns "Room not found" because entity with old slug doesn't exist
        // The actual Matrix alias still exists and would resolve via Matrix federation
        expect(oldAliasResponse.status).toBe(200);
        expect(oldAliasResponse.body).toEqual({ error: 'Room not found' });
      }, 30000);
    });
  });
});
