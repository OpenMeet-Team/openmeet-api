/**
 * Mock implementation of MatrixCoreService for testing
 *
 * This mock provides jest mock functions for all Matrix API methods
 * used by the ChatRoomManagerInterface implementation.
 */
export class MockMatrixService {
  // Room operations
  createRoom = jest.fn();
  getRoomState = jest.fn();
  joinRoom = jest.fn();
  leaveRoom = jest.fn();
  inviteUserToRoom = jest.fn();
  deleteRoom = jest.fn();
  getRoomMembers = jest.fn();

  // User operations
  getUserProfile = jest.fn();
  createGuestUser = jest.fn();
  registerUser = jest.fn();
  registerApplicationService = jest.fn();

  // Power level operations
  setRoomPowerLevels = jest.fn();
  getRoomPowerLevels = jest.fn();

  // Message operations (deprecated - now handled client-side)

  // Room visibility operations
  setRoomVisibility = jest.fn();
  getRoomVisibility = jest.fn();

  constructor() {
    // Default implementation of getRoomMembers returns an empty array
    this.getRoomMembers.mockResolvedValue([]);

    // Default implementation of getRoomPowerLevels returns a standard power level structure
    this.getRoomPowerLevels.mockResolvedValue({
      users: {},
      users_default: 0,
      events: {},
      events_default: 0,
      state_default: 50,
      ban: 50,
      kick: 50,
      redact: 50,
      invite: 50,
    });
  }
}
