#!/usr/bin/env node

/**
 * Matrix Room Permission Fix Script
 * Fixes bot permissions in all Matrix rooms using the working approach.
 *
 * === CURRENT WORKING APPROACH ===
 * ✅ Authentication: Use appservice token (MATRIX_APPSERVICE_TOKEN)
 * ✅ Join bot to rooms: /_synapse/admin/v1/rooms/{roomId}/make_room_admin
 * ✅ Set power levels: /_matrix/client/v3/rooms/{roomId}/state/m.room.power_levels with appservice token
 * ✅ Fallback admin token: MAS_ADMIN_TOKEN for room listing if appservice token lacks admin privileges
 *
 * === EXPERIMENTAL APPROACHES TRIED (KEPT FOR REFERENCE) ===
 * ❌ MAS compatibility tokens - tenant bot users don't exist in MAS
 * ❌ Bot login through MAS - "Unrecognized request" error with MAS
 * ❌ /_synapse/admin/v1/join/{roomId} - admin user must be in room first
 * ❌ /_matrix/client/v3/rooms/{roomId}/join with appservice token - doesn't bypass invite rules
 * ❌ Matrix v3 state API membership - still respects room permissions
 * ❌ Appservice impersonation login - "Unrecognized request" with MAS
 * 
 * Note: Remote/orphaned rooms cannot be joined by any method due to Matrix federation constraints.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration
const SCRIPT_DIR = __dirname;
const TENANT_CONFIG_PATH = path.join(
  SCRIPT_DIR,
  '../../tenant-service/tenants-local.yaml',
);
const MATRIX_SERVER_NAME = 'matrix.openmeet.net';
let HOMESERVER_URL = 'http://localhost:8448';

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(message) {
  console.log(
    `${colors.green}[${new Date().toISOString()}] ${message}${colors.reset}`,
  );
}

function warn(message) {
  console.log(
    `${colors.yellow}[${new Date().toISOString()}] WARNING: ${message}${colors.reset}`,
  );
}

function error(message) {
  console.error(
    `${colors.red}[${new Date().toISOString()}] ERROR: ${message}${colors.reset}`,
  );
  process.exit(1);
}

class MatrixRoomFixer {
  constructor(environment, tenantId) {
    this.environment = environment;
    this.tenantId = tenantId;
    this.tenantConfig = null;
    this.compatToken = null;
    this.botCompatToken = null;
  }

  // Execute command in MAS container based on environment
  execMasCommand(command) {
    let fullCommand;

    switch (this.environment) {
      case 'docker':
        const containerName = process.env.MAS_CONTAINER_NAME || 'openmeet_mas';
        fullCommand = `docker exec ${containerName} ${command}`;
        break;

      case 'kubernetes':
      case 'k8s':
        const namespace = process.env.KUBE_NAMESPACE || 'default';
        const podSelector = process.env.MAS_POD_SELECTOR || 'app=mas';

        // Get pod name first
        const getPodCmd = `kubectl get pods -n ${namespace} -l ${podSelector} -o jsonpath='{.items[0].metadata.name}'`;
        let podName;
        try {
          podName = execSync(getPodCmd, { encoding: 'utf8' }).trim();
        } catch (e) {
          error(`Failed to get MAS pod: ${e.message}`);
        }

        if (!podName) {
          error('No MAS pod found');
        }

        fullCommand = `kubectl exec -n ${namespace} ${podName} -- ${command}`;
        break;

      case 'local':
        // For local development, assume mas-cli is available in PATH
        fullCommand = command;
        break;

      default:
        error(
          `Unsupported environment: ${this.environment}. Use 'docker', 'kubernetes', or 'local'`,
        );
    }

    log(`Executing: ${fullCommand}`);

    try {
      return execSync(fullCommand, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      throw new Error(
        `Command failed: ${e.message}\nStdout: ${e.stdout}\nStderr: ${e.stderr}`,
      );
    }
  }

  // Parse tenant configuration
  parseTenantConfig() {
    log(`Parsing tenant config for tenant: ${this.tenantId}`);

    if (!fs.existsSync(TENANT_CONFIG_PATH)) {
      error(`Tenant config file not found: ${TENANT_CONFIG_PATH}`);
    }

    try {
      const configContent = fs.readFileSync(TENANT_CONFIG_PATH, 'utf8');
      const tenants = yaml.load(configContent);

      const tenant = tenants.find((t) => t.id === this.tenantId);
      if (!tenant) {
        error(`Tenant ${this.tenantId} not found in config`);
      }

      if (
        !tenant.matrixConfig ||
        !tenant.matrixConfig.adminUser ||
        !tenant.matrixConfig.botUser
      ) {
        error(
          'Tenant config missing required matrixConfig.adminUser or matrixConfig.botUser',
        );
      }

      this.tenantConfig = {
        adminUsername: tenant.matrixConfig.adminUser.username,
        adminPassword: tenant.matrixConfig.adminUser.password,
        botSlug: tenant.matrixConfig.botUser.slug,
        botEmail: tenant.matrixConfig.botUser.email,
        botPassword: tenant.matrixConfig.botUser.password,
        botUserId: `@${tenant.matrixConfig.botUser.slug}:${MATRIX_SERVER_NAME}`,
        adminUserId: `@${tenant.matrixConfig.adminUser.username}:${MATRIX_SERVER_NAME}`,
        appserviceToken:
          process.env.MATRIX_APPSERVICE_TOKEN ||
          tenant.matrixConfig.appservice?.token,
        adminAccessToken: tenant.matrixConfig.adminUser?.accessToken,
        homeserverUrl: tenant.matrixConfig.homeserverUrl,
      };

      // Update the global HOMESERVER_URL to use tenant-specific configuration
      HOMESERVER_URL = this.tenantConfig.homeserverUrl;

      log('Tenant config parsed successfully:');
      log(`  Admin User: ${this.tenantConfig.adminUsername}`);
      log(`  Bot User: ${this.tenantConfig.botSlug}`);
      log(`  Bot User ID: ${this.tenantConfig.botUserId}`);
    } catch (e) {
      error(`Failed to parse tenant config: ${e.message}`);
    }
  }

  // Setup authentication tokens for room operations
  async setupAdminToken() {
    log('Setting up authentication tokens for room operations');

    // Primary: Use appservice token (works for most operations)
    if (this.tenantConfig.appserviceToken) {
      this.compatToken = this.tenantConfig.appserviceToken;
      log(`Using appservice token: ${this.compatToken.substring(0, 10)}...`);

      if (await this.testAdminToken()) {
        log('Appservice token verified for admin operations');
        return;
      } else {
        warn('Appservice token lacks admin privileges, falling back to MAS admin token...');
      }
    }

    // Fallback: Use MAS admin token for admin operations
    const masAdminToken = process.env.MAS_ADMIN_TOKEN || 'local-mas-admin-token';
    this.compatToken = masAdminToken;
    log(`Using MAS admin token: ${this.compatToken.substring(0, 10)}...`);

    if (await this.testAdminToken()) {
      return;
    } else {
      error('No working admin token found. Cannot proceed with room fixes.');
    }
  }

  // Note: MAS compatibility token methods removed - they don't work with tenant-specific bots
  // Keeping this comment for reference in case we need them for other integrations in the future
  
  // Helper function to properly encode room IDs for Matrix API URLs
  encodeRoomId(roomId) {
    // Room IDs start with ! which needs to be encoded as %21
    return roomId.replace(/[!]/g, '%21');
  }

  // Test if the current token has admin privileges for room operations
  async testAdminToken() {
    try {
      // Test with a room admin endpoint to ensure we can actually do room operations
      await this.makeRequest(
        `${HOMESERVER_URL}/_synapse/admin/v1/rooms?limit=1`,
      );
      log('Admin token verified successfully');
      return true;
    } catch (e) {
      warn(`Admin token test failed: ${e.message}`);
      return false;
    }
  }

  // Make HTTP request with error handling
  async makeRequest(url, options = {}, token = null) {
    let fetch;
    try {
      // Try to use dynamic import for node-fetch (ES module)
      const fetchModule = await import('node-fetch');
      fetch = fetchModule.default;
    } catch (e) {
      // Fallback to require (CommonJS)
      try {
        fetch = require('node-fetch');
      } catch (e2) {
        throw new Error(
          'node-fetch not available. Please install it: npm install node-fetch',
        );
      }
    }

    // Use provided token or fall back to compatToken
    const authToken = token || this.compatToken;
    
    const defaultOptions = {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, defaultOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      return await response.json();
    } catch (e) {
      throw new Error(`Request failed: ${e.message}`);
    }
  }

  // Get list of all rooms (handles pagination)
  async getAllRooms(limit = 2000) {
    log(`Fetching rooms from Matrix server (limit: ${limit})...`);

    try {
      const response = await this.makeRequest(
        `${HOMESERVER_URL}/_synapse/admin/v1/rooms?limit=${limit}`,
      );

      if (!response.rooms || response.rooms.length === 0) {
        warn('No rooms found');
        return [];
      }

      const roomIds = response.rooms
        .map((room) => room.room_id)
        .filter(Boolean);
      log(
        `Found ${roomIds.length} rooms to process (total_rooms: ${response.total_rooms || 'unknown'}, offset: ${response.offset || 0})`,
      );

      if (response.total_rooms && response.total_rooms > limit) {
        log(
          `Note: There are ${response.total_rooms} total rooms, but processing only ${limit} for this run`,
        );
      }

      return roomIds;
    } catch (e) {
      // If appservice token fails for room listing, try MAS admin token
      if (this.compatToken !== 'local-mas-admin-token') {
        warn(
          `Room listing failed with current token, trying MAS admin token: ${e.message}`,
        );
        this.compatToken = 'local-mas-admin-token';

        try {
          const response = await this.makeRequest(
            `${HOMESERVER_URL}/_synapse/admin/v1/rooms?limit=${limit}`,
          );

          if (!response.rooms || response.rooms.length === 0) {
            warn('No rooms found');
            return [];
          }

          const roomIds = response.rooms
            .map((room) => room.room_id)
            .filter(Boolean);
          log(
            `Found ${roomIds.length} rooms to process (using MAS admin token, total_rooms: ${response.total_rooms || 'unknown'})`,
          );

          return roomIds;
        } catch (e2) {
          error(`Failed to fetch rooms with MAS admin token: ${e2.message}`);
        }
      } else {
        error(`Failed to fetch rooms: ${e.message}`);
      }
    }
  }

  // Get room information including name, members, and state
  async getRoomInfo(roomId) {
    try {
      // Get room details from admin API
      const roomDetails = await this.makeRequest(
        `${HOMESERVER_URL}/_synapse/admin/v1/rooms/${this.encodeRoomId(roomId)}`,
      );

      // Get room members
      const membersResponse = await this.makeRequest(
        `${HOMESERVER_URL}/_synapse/admin/v1/rooms/${this.encodeRoomId(roomId)}/members`,
      );

      const roomInfo = {
        roomId: roomId,
        name: roomDetails.name || 'Unknown',
        topic: roomDetails.topic || '',
        joinedMembers: membersResponse.total || 0,
        members: membersResponse.members || [],
        creator: roomDetails.creator || 'Unknown',
        roomVersion: roomDetails.room_version || 'Unknown',
        joinRules: roomDetails.join_rules || 'Unknown',
        federatable: roomDetails.federatable !== false,
        public: roomDetails.public !== false,
      };

      return roomInfo;
    } catch (e) {
      warn(`Failed to get room info for ${roomId}: ${e.message}`);
      return {
        roomId: roomId,
        name: 'ERROR: Could not fetch',
        topic: '',
        joinedMembers: 0,
        members: [],
        creator: 'Unknown',
        error: e.message,
      };
    }
  }

  // Check if bot is in room
  async botInRoom(roomId) {
    try {
      const response = await this.makeRequest(
        `${HOMESERVER_URL}/_synapse/admin/v1/rooms/${this.encodeRoomId(roomId)}/members`,
      );
      return (
        response.members &&
        response.members.some(
          (member) => member.user_id === this.tenantConfig.botUserId,
        )
      );
    } catch (e) {
      warn(`Failed to check bot membership in room ${roomId}: ${e.message}`);
      return false;
    }
  }

  // Create bot user using appservice token
  async createBotUserWithAppservice() {
    try {
      log(`Creating bot user using appservice: ${this.tenantConfig.botUserId}`);

      // Register the user using the appservice token
      await this.makeRequest(
        `${HOMESERVER_URL}/_matrix/client/v3/register`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'm.login.application_service',
            username: this.tenantConfig.botSlug,
            access_token: this.tenantConfig.appserviceToken,
          }),
        },
        this.tenantConfig.appserviceToken
      );

      log(`Bot user created successfully with appservice`);
      return true;
    } catch (registerError) {
      // User might already exist, which is fine
      if (
        registerError.message.includes('already taken') ||
        registerError.message.includes('User ID already taken')
      ) {
        log(`Bot user already exists: ${this.tenantConfig.botUserId}`);
        return true;
      }

      warn(`Failed to create bot user with appservice: ${registerError.message}`);
      return false;
    }
  }

  // Force join bot to room using appservice token
  async forceJoinBot(roomId) {
    log(`Force-joining bot to room: ${roomId}`);

    try {
      // First ensure the bot user exists using appservice
      await this.createBotUserWithAppservice();

      // === WHAT WE TRIED AND WHAT WORKED ===
      //
      // ❌ FAILED: Admin force join API
      // - Endpoint: /_synapse/admin/v1/join/{roomId}
      // - Error: "not in room" - admin user must be in room first
      //
      // ✅ SUCCESS: Make room admin API
      // - Endpoint: /_synapse/admin/v1/rooms/{roomId}/make_room_admin
      // - This makes the bot user an admin AND joins them to the room
      //
      // ❌ FAILED: Appservice token join
      // - Endpoint: /_matrix/client/v3/rooms/{roomId}/join
      // - Error: "You are not invited to this room" - appservice tokens don't bypass invite rules
      //
      // ❌ FAILED: MAS compatibility tokens
      // - Command: mas-cli manage issue-compatibility-token
      // - Error: "User not found" - tenant bot users don't exist in MAS
      //
      // ❌ FAILED: Matrix client login for bot
      // - Endpoint: /_matrix/client/v3/login
      // - Error: "Unrecognized request" - MAS doesn't handle appservice users

      // HISTORICAL NOTE: What we tried that didn't work:
      // ❌ Method 1: /_synapse/admin/v1/join/{roomId} - admin user must be in room first
      // ❌ Method 3: Matrix v3 join with appservice token - doesn't bypass invite rules
      // ❌ Method 4: Matrix v3 state API - still respects room permissions
      // ❌ Method 5: Appservice impersonation login - "Unrecognized request" with MAS
      // ❌ Method 6: Standard appservice join - "You are not invited to this room"
      
      // ✅ WORKING METHOD: Use Synapse make_room_admin API
      // This both joins the bot to the room AND gives it admin permissions
      log(`  Using Synapse make_room_admin API...`);
      
      await this.makeRequest(
        `${HOMESERVER_URL}/_synapse/admin/v1/rooms/${this.encodeRoomId(roomId)}/make_room_admin`,
        {
          method: 'POST',
          body: JSON.stringify({ user_id: this.tenantConfig.botUserId }),
        },
      );
      log(`  ✅ Successfully joined bot to room`);
      return true;
    } catch (e) {
      warn(`Failed to join bot to room ${roomId}: ${e.message}`);
      return false;
    }
  }

  // Set bot power levels using appservice token
  async setBotPowerLevels(roomId) {
    log(`Setting bot power levels in room: ${roomId}`);

    try {
      // HISTORICAL NOTE: What we tried for power levels:
      // ✅ SUCCESS: Using appservice token with Matrix client API
      // ❌ FAILED: Using admin token (user not in room)
      // ❌ FAILED: Using Synapse admin API (endpoint doesn't exist)

      // Use appservice token (bot is now in room so this works)
      const appserviceToken = this.tenantConfig.appserviceToken;

      // Get current power levels
      let currentPowerLevels;
      try {
        currentPowerLevels = await this.makeRequest(
          `${HOMESERVER_URL}/_matrix/client/v3/rooms/${this.encodeRoomId(roomId)}/state/m.room.power_levels`,
          {},
          appserviceToken
        );
      } catch (e) {
        // If we can't get current power levels, use defaults
        currentPowerLevels = {
          users_default: 0,
          events_default: 0,
          state_default: 50,
          ban: 50,
          kick: 50,
          redact: 50,
          invite: 0,
          users: {},
        };
      }

      // Update power levels to include bot with level 100
      const updatedPowerLevels = {
        ...currentPowerLevels,
        users: {
          ...currentPowerLevels.users,
          [this.tenantConfig.botUserId]: 100,
        },
      };

      // Set power levels using Matrix client API with appservice token
      await this.makeRequest(
        `${HOMESERVER_URL}/_matrix/client/v3/rooms/${this.encodeRoomId(roomId)}/state/m.room.power_levels`,
        {
          method: 'PUT',
          body: JSON.stringify(updatedPowerLevels),
        },
        appserviceToken
      );

      return true;
    } catch (e) {
      warn(`Failed to set power levels in room ${roomId}: ${e.message}`);
      return false;
    }
  }

  // Fix room permissions for all rooms or specific room IDs
  async fixAllRoomPermissions(targetRoomIds = null) {
    let roomIds;
    
    if (targetRoomIds && targetRoomIds.length > 0) {
      log(`Starting room permission fix for ${targetRoomIds.length} specific rooms...`);
      roomIds = targetRoomIds;
    } else {
      log('Starting room permission fix process for all rooms...');
      roomIds = await this.getAllRooms();
      if (roomIds.length === 0) {
        warn('No rooms to process');
        return;
      }
    }

    let totalRooms = 0;
    let joinedRooms = 0;
    let powerLevelUpdates = 0;
    let alreadyInRoom = 0;
    let failedRooms = 0;
    let errorCategories = {
      forbidden: 0,
      remote_room: 0,
      server_error: 0,
      not_found: 0,
      other: 0,
    };

    for (const roomId of roomIds) {
      totalRooms++;
      log(`\nProcessing room ${totalRooms}/${roomIds.length}: ${roomId}`);

      // Get room information
      const roomInfo = await this.getRoomInfo(roomId);
      log(`  Room: "${roomInfo.name}" (${roomInfo.joinedMembers} members)`);
      log(`  Creator: ${roomInfo.creator}`);
      log(
        `  Join rules: ${roomInfo.joinRules}, Federatable: ${roomInfo.federatable}`,
      );

      if (roomInfo.error) {
        log(`  ERROR: ${roomInfo.error}`);
        failedRooms++;

        // Categorize error
        if (
          roomInfo.error.includes('403') ||
          roomInfo.error.includes('FORBIDDEN')
        ) {
          errorCategories.forbidden++;
        } else if (
          roomInfo.error.includes('404') ||
          roomInfo.error.includes('NOT_FOUND')
        ) {
          errorCategories.not_found++;
        } else if (roomInfo.error.includes('500')) {
          errorCategories.server_error++;
        } else {
          errorCategories.other++;
        }

        continue;
      }

      // Check if bot is already in room
      const botIsInRoom = await this.botInRoom(roomId);
      if (botIsInRoom) {
        log(`  Bot already in room`);
        alreadyInRoom++;
      } else {
        log(`  Bot not in room, attempting to join...`);

        try {
          if (await this.forceJoinBot(roomId)) {
            log(`  ✅ Successfully joined bot to room`);
            joinedRooms++;
          } else {
            log(`  ❌ Failed to join bot to room`);
            failedRooms++;
            continue;
          }
        } catch (e) {
          log(`  ❌ Failed to join bot to room: ${e.message}`);
          failedRooms++;

          // Categorize error
          if (e.message.includes('403') || e.message.includes('FORBIDDEN')) {
            errorCategories.forbidden++;
          } else if (
            e.message.includes('remote room') ||
            e.message.includes('no servers')
          ) {
            errorCategories.remote_room++;
          } else if (e.message.includes('500') || e.message.includes('Internal server error')) {
            errorCategories.server_error++;
          } else if (
            e.message.includes('404') ||
            e.message.includes('NOT_FOUND')
          ) {
            errorCategories.not_found++;
          } else {
            errorCategories.other++;
          }

          continue;
        }
      }

      // Set power levels
      try {
        if (await this.setBotPowerLevels(roomId)) {
          log(`  ✅ Power levels updated`);
          powerLevelUpdates++;
        } else {
          log(`  ❌ Failed to update power levels`);
          failedRooms++;
        }
      } catch (e) {
        log(`  ❌ Failed to update power levels: ${e.message}`);
        failedRooms++;
      }

      // Small delay to avoid overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    log('\n=== Room Permission Fix Summary ===');
    log(`Total rooms processed: ${totalRooms}`);
    log(`Bot already in rooms: ${alreadyInRoom}`);
    log(`Bot joined to new rooms: ${joinedRooms}`);
    log(`Power levels updated: ${powerLevelUpdates}`);
    log(`Failed operations: ${failedRooms}`);
    log('\nError breakdown:');
    log(`  Forbidden (403): ${errorCategories.forbidden}`);
    log(`  Remote room errors: ${errorCategories.remote_room}`);
    log(`  Server errors (500): ${errorCategories.server_error}`);
    log(`  Not found (404): ${errorCategories.not_found}`);
    log(`  Other errors: ${errorCategories.other}`);
  }

  // Main execution
  async run(targetRoomIds = null) {
    log(
      `Starting Matrix room permission fix for tenant: ${this.tenantId} (environment: ${this.environment})`,
    );

    try {
      this.parseTenantConfig();
      await this.setupAdminToken();
      await this.fixAllRoomPermissions(targetRoomIds);

      log('Matrix room permission fix completed successfully!');
    } catch (e) {
      error(`Fix failed: ${e.message}`);
    }
  }
}

// Check dependencies
function checkDependencies() {
  const requiredPackages = ['js-yaml', 'node-fetch'];
  const missingPackages = [];

  for (const pkg of requiredPackages) {
    try {
      require(pkg);
    } catch (e) {
      missingPackages.push(pkg);
    }
  }

  if (missingPackages.length > 0) {
    error(
      `Missing required packages: ${missingPackages.join(', ')}\nRun: npm install ${missingPackages.join(' ')}`,
    );
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(
      'Usage: node fix-matrix-room-permissions.js <environment> <tenant_id> [room_id1] [room_id2] ...',
    );
    console.log('');
    console.log('Arguments:');
    console.log('  environment - Execution environment (docker, kubernetes, k8s, local)');
    console.log('  tenant_id   - Tenant ID from tenant config');
    console.log('  room_id     - (Optional) Specific room ID(s) to process. If not provided, processes all rooms.');
    console.log('');
    console.log('Examples:');
    console.log('  # Process all rooms for tenant');
    console.log('  node fix-matrix-room-permissions.js docker lsdfaopkljdfs');
    console.log('');
    console.log('  # Process specific rooms only');
    console.log('  node fix-matrix-room-permissions.js docker lsdfaopkljdfs "!KtNadbssmTprIQzSFH:matrix.openmeet.net" "!AnotherRoom:matrix.openmeet.net"');
    console.log('');
    console.log('Environments:');
    console.log(
      '  docker      - Use Docker exec (requires MAS_CONTAINER_NAME env var, defaults to "openmeet_mas")',
    );
    console.log(
      '  kubernetes  - Use kubectl exec (requires KUBE_NAMESPACE and MAS_POD_SELECTOR env vars)',
    );
    console.log('  k8s         - Alias for kubernetes');
    console.log('  local       - Use local mas-cli command');
    console.log('');
    console.log('Environment variables:');
    console.log(
      '  MAS_CONTAINER_NAME  - Docker container name (default: openmeet_mas)',
    );
    console.log(
      '  KUBE_NAMESPACE      - Kubernetes namespace (default: default)',
    );
    console.log(
      '  MAS_POD_SELECTOR    - Pod selector for MAS (default: app=mas)',
    );
    console.log('');

    try {
      const configContent = fs.readFileSync(TENANT_CONFIG_PATH, 'utf8');
      const tenants = yaml.load(configContent);
      console.log('Available tenants:');
      tenants.forEach((tenant) => {
        if (tenant.id) {
          console.log(`  ${tenant.id}`);
        }
      });
    } catch (e) {
      console.log('Could not read tenant config to show available tenants');
    }

    process.exit(1);
  }

  const [environment, tenantId, ...roomIds] = args;
  const targetRoomIds = roomIds.length > 0 ? roomIds : null;

  checkDependencies();

  const fixer = new MatrixRoomFixer(environment, tenantId);
  await fixer.run(targetRoomIds);
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on('uncaughtException', (error) => {
  error(`Uncaught Exception: ${error.message}`);
});

// Run the script
if (require.main === module) {
  main().catch(error);
}
