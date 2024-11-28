import {
  ZulipClient,
  ZulipConfig,
  ZulipFetchApiKeyResponse,
  ZulipMessage,
  ZulipUser,
} from 'zulip-js';

export const mockZulipSetting = {
  zulip_version: '1.0.0',
  zulip_merge_base: '1.0.0',
  zulip_feature_level: 1,
};

export const mockZulipStream = {
  id: 410,
  name: 'test',
};

export const mockZulipMessageResponse = {
  id: 1,
};

export const mockZulipUser = {
  email: 'test@test.com',
  full_name: 'test',
  avatar_url: 'test',
  is_active: true,
  is_admin: true,
  is_guest: false,
  is_owner: false,
  is_billing_admin: false,
  role: 1,
  is_bot: false,
  timezone: 'UTC',
  date_joined: '2021-01-01',
  delivery_email: 'test@test.com',
  avatar_version: 1,
  user_id: 1,
} as ZulipUser;

export const mockZulipApiResponse = {
  result: 'success' as 'success' | 'error',
  msg: '' as string,
  code: '' as string,
};

export const mockZulipMessage = {
  id: 1,
  content: 'test',
  sender_id: mockZulipUser.user_id,
  sender_full_name: mockZulipUser.full_name,
} as ZulipMessage;

export const mockZulipStreamTopic = {
  name: 'test',
  max_id: 450,
};

export const mockZulipFilter = {
  id: 1,
  name: 'test',
};

export const mockZulipEvent = {
  id: 1,
  type: 'test',
};

export const mockZulipSubscriptionResponse = {
  subscribed: true,
  stream_id: mockZulipStream.id,
};

export const mockZulipFetchApiKeyResponse = {
  api_key: 'test',
  email: mockZulipUser.email,
  user_id: mockZulipUser.user_id,
} as ZulipFetchApiKeyResponse;

export const mockZulipClient = {
  config: {} as ZulipConfig,
  accounts: {
    retrieve: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      accounts: [mockZulipUser],
    }),
  },
  server: {
    settings: jest
      .fn()
      .mockResolvedValue({ ...mockZulipApiResponse, ...mockZulipSetting }),
  },
  filters: {
    retrieve: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      filters: [mockZulipFilter],
    }),
  },
  messages: {
    send: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      id: mockZulipMessageResponse.id,
      automatic_new_visibility_policy: 1,
    }),
    retrieve: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      messages: [mockZulipMessage],
    }),
    update: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      detached_uploads: [],
    }),
    deleteById: jest.fn().mockResolvedValue(mockZulipApiResponse),
    flags: {
      add: jest.fn().mockResolvedValue({
        ...mockZulipApiResponse,
        messages: [mockZulipMessage.id],
      }),
      remove: jest.fn().mockResolvedValue({
        ...mockZulipApiResponse,
        messages: [mockZulipMessage.id],
      }),
    },
    getById: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      message_id: mockZulipMessage.id,
    }),
    getHistoryById: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      message_ids: [mockZulipMessage.id],
    }),
    deleteReactionById: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      message_id: mockZulipMessage.id,
    }),
  },
  queues: {
    register: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      last_event_id: 1,
      queue_id: 'test',
      event_queue_longpoll_timeout_seconds: 1,
    }),
  },
  events: {
    retrieve: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      events: [mockZulipEvent],
      queue_id: 'test',
    }),
  },
  reactions: {
    add: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      message_id: mockZulipMessage.id,
    }),
    remove: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      message_id: mockZulipMessage.id,
    }),
  },
  users: {
    me: {
      pointer: {
        retrieve: jest.fn().mockResolvedValue({
          ...mockZulipApiResponse,
          stream_id: mockZulipStream.id,
          topic: mockZulipStreamTopic.name,
        }),
        update: jest.fn().mockResolvedValue({
          ...mockZulipApiResponse,
        }),
      },
      getProfile: jest.fn().mockResolvedValue({
        ...mockZulipApiResponse,
        ...mockZulipUser,
      }),
      subscriptions: {
        add: jest.fn().mockResolvedValue({
          ...mockZulipApiResponse,
          ...mockZulipSubscriptionResponse,
        }),
        remove: jest.fn().mockResolvedValue({
          ...mockZulipApiResponse,
          removed: [],
          not_removed: [],
        }),
      },
    },
    retrieve: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      users: [mockZulipUser],
    }),
    create: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      id: mockZulipUser.user_id,
    }),
  },
  streams: {
    retrieve: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      streams: [mockZulipStream],
    }),
    getStreamId: jest.fn().mockResolvedValue({
      ...mockZulipApiResponse,
      stream_id: mockZulipStream.id,
    }),
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue({
        ...mockZulipApiResponse,
        subscriptions: [mockZulipSubscriptionResponse],
      }),
    },
    deleteById: jest.fn().mockResolvedValue(mockZulipApiResponse),
    topics: {
      retrieve: jest.fn().mockResolvedValue({
        ...mockZulipApiResponse,
        topics: [mockZulipStreamTopic],
      }),
    },
  },
  callEndpoint: jest.fn().mockResolvedValue(mockZulipMessageResponse),
} as unknown as ZulipClient;

export const mockZulipService = {
  getStream: jest.fn().mockResolvedValue(mockZulipStream),
  getInitialisedClient: jest.fn().mockResolvedValue(mockZulipClient),
  getAdminUsers: jest.fn().mockResolvedValue([mockZulipUser]),
  getUserMessages: jest.fn().mockResolvedValue([mockZulipMessage]),
  getUserStreamTopics: jest.fn().mockResolvedValue([mockZulipStreamTopic]),
  getAdminMessages: jest.fn().mockResolvedValue([mockZulipMessage]),
  getAdminStreamTopics: jest.fn().mockResolvedValue([mockZulipStreamTopic]),
  createUser: jest.fn().mockResolvedValue({ id: mockZulipUser.user_id }),
  getAdminSettings: jest.fn().mockResolvedValue(mockZulipSetting),
  subscribeAdminToChannel: jest
    .fn()
    .mockResolvedValue(mockZulipSubscriptionResponse),
  getAdminStreamId: jest.fn().mockResolvedValue(mockZulipStream.id),
  deleteAdminStreamTopic: jest.fn().mockResolvedValue(mockZulipApiResponse),
  sendUserMessage: jest.fn().mockResolvedValue(mockZulipMessageResponse),
  updateAdminMessage: jest.fn().mockResolvedValue(mockZulipMessageResponse),
  deleteAdminMessage: jest.fn().mockResolvedValue(mockZulipApiResponse),
  updateUserMessage: jest.fn().mockResolvedValue(mockZulipMessageResponse),
  updateUserProfile: jest.fn().mockResolvedValue(mockZulipApiResponse),
  getAdminApiKey: jest.fn().mockResolvedValue(mockZulipFetchApiKeyResponse),
  getUserProfile: jest.fn().mockResolvedValue(mockZulipUser),
};

export const mockGetZulipClient = jest.fn().mockResolvedValue(mockZulipClient);
export const mockGetZulipAdminClient = jest
  .fn()
  .mockResolvedValue(mockZulipClient);
