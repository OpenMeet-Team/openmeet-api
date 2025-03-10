import { MatrixService } from '../../matrix/matrix.service';

export const mockMatrixMessage = {
  id: 'message123',
  content: 'Test message',
  sender: 'user123',
  timestamp: new Date().toISOString(),
};

export const mockMatrixMessageResponse = {
  eventId: 'event123',
  id: 1,
};

export const mockMatrixService = {
  createRoom: jest.fn().mockResolvedValue('!room123:example.com'),
  sendMessage: jest.fn().mockResolvedValue({ eventId: 'event123', id: 1 }),
  getInitializedClient: jest.fn().mockResolvedValue({
    sendEvent: jest.fn().mockResolvedValue({ event_id: 'event123' }),
  }),
  inviteUserToRoom: jest.fn().mockResolvedValue({}),
  updateMessage: jest.fn().mockResolvedValue({ eventId: 'event123', id: 1 }),
  deleteMessage: jest.fn().mockResolvedValue({ eventId: 'event123', id: 1 }),
  getMessages: jest.fn().mockResolvedValue([mockMatrixMessage]),
}; 