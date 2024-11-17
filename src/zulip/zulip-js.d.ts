declare module 'zulip-js' {
  export type HttpMethod =
    | 'GET'
    | 'HEAD'
    | 'POST'
    | 'PUT'
    | 'DELETE'
    | 'TRACE'
    | 'OPTIONS'
    | 'CONNECT'
    | 'PATCH';
  export interface Params {
    [key: string]: any;
    [key: number]: any;
  }

  export interface ZulipUser {
    email: string;
    user_id: number;
    avatar_version: number;
    is_admin: boolean;
    is_owner: boolean;
    is_guest: boolean;
    is_billing_admin: boolean;
    role: number;
    is_bot: boolean;
    full_name: string;
    timezone: string;
    is_active: boolean;
    date_joined: string;
    delivery_email: string;
    avatar_url: string | null;
  }

  export interface ZulipNarrow {
    operator: string;
    operand: string | number;
  }

  export interface ZulipReaction {
    emoji_code: string;
    emoji_name: string;
    user_id: number;
  }

  export interface ZulipStream {
    can_remove_subscribers_group: number;
    creator_id: number;
    date_created: number;
    description: string;
    first_message_id: number;
    history_public_to_subscribers: boolean;
    invite_only: boolean;
    is_web_public: boolean;
    message_retention_days: null;
    name: string;
    rendered_description: string;
    stream_id: number;
    stream_post_policy: number;
    is_announcement_only: boolean;
    stream_weekly_traffic: number;
  }

  export interface ZulipMessage {
    id: number;
    sender_id: number;
    content: string;
    recipient_id: number;
    timestamp: number;
    client: string;
    subject: string;
    topic_links: [];
    is_me_message: boolean;
    reactions: [];
    submessages: [];
    flags: [];
    sender_full_name: string;
    sender_email: string;
    sender_realm_str: string;
    display_recipient: string;
    type: string;
    stream_id: number;
    avatar_url: string | null;
    content_type: string;
  }

  interface ZulipSettings {
    authentication_methods: {
      password: boolean;
      dev: boolean;
      email: boolean;
      ldap: boolean;
      remoteuser: boolean;
      github: boolean;
      azuread: boolean;
      gitlab: boolean;
      google: boolean;
      apple: boolean;
      saml: boolean;
      'openid connect': boolean;
    };
    zulip_version: string;
    zulip_merge_base: string;
    zulip_feature_level: number;
    push_notifications_enabled: boolean;
    is_incompatible: boolean;
    email_auth_enabled: boolean;
    require_email_format_usernames: boolean;
    realm_url: string;
    realm_name: string;
    realm_icon: string;
    realm_description: string;
    realm_web_public_access_enabled: boolean;
    external_authentication_methods: [];
    realm_uri: string;
  }

  interface ZulipBaseEvent {
    id: number;
  }
  export interface ZulipHeartbeatEvent extends ZulipBaseEvent {
    type: 'heartbeat';
  }
  export interface ZulipMsgEvent extends ZulipBaseEvent {
    type: 'message';
    message: ZulipMsg;
  }
  export interface ZulipReactionEvent extends ZulipBaseEvent {
    type: 'reaction';
    op: 'add' | 'remove';
    emoji_code: string;
    emoji_name: string;
    user_id: number;
    message_id: number;
  }

  export type ZulipAnchor = number | 'first_unread' | 'newest' | 'oldest';

  export interface ZulipMessagesRetrieveParams {
    narrow?: ZulipNarrow[];
    anchor: ZulipAnchor;
    num_before: number;
    num_after: number;
    client_gravatar?: boolean;
    apply_markdown?: boolean;
    message_ids?: number[];
    include_anchor?: boolean;
    // num_before required if message_ids is not provided
  }

  interface ZulipSubscription {
    name: string;
    description?: string;
  }

  interface ZulipSubscriptionParams {
    subscriptions: ZulipSubscription[];
    principals?: (string | number)[];
    authorization_errors_fatal?: boolean;
    announce?: boolean;
    invite_only?: boolean;
    is_web_public?: boolean;
    is_default_stream?: boolean;
    history_public_to_subscribers?: boolean;
    stream_post_policy?: number;
    message_retention_days?: string | number;
    can_remove_subscribers_group?: number;
  }

  interface ZulipRemoveSubscriptionParams {
    subscriptions: ZulipSubscription[];
    principals?: (string | number)[];
  }

  export interface ZulipCreateUserParams {
    email: string;
    password: string;
    full_name: string;
  }

  interface ZulipBaseMessageParams {
    content: string;
    queue_id?: string;
    local_id?: string;
    read_by_sender?: boolean;
  }

  export interface ZulipDirectMessageParams extends ZulipBaseMessageParams {
    type: 'direct';
    to: number | number[] | string | string[];
  }

  export interface ZulipChannelMessageParams extends ZulipBaseMessageParams {
    type: 'channel' | 'stream';
    to: string | number; // Channel name or ID
    topic: string; // Required for channel messages
  }

  export type ZulipCreateMessageParams =
    | ZulipDirectMessageParams
    | ZulipChannelMessageParams;

  export type ZulipEvent =
    | ZulipHeartbeatEvent
    | ZulipMsgEvent
    | ZulipReactionEvent;

  export interface ZulipConfig {
    realm: string;
    username: string;
    password: string;
    apiURL: string;
    apiToken: string;
  }

  export interface ZulipTopic {
    name: string;
    max_id: number;
  }

  export type ZulipFlag = 'starred' | 'read' | 'collapsed' | 'mentioned';

  export interface ZulipFlagsAddParams {
    messages: number[];
    flag: ZulipFlag;
  }

  export interface ZulipFlagsRemoveParams {
    messages: number[];
    flag: ZulipFlag;
  }

  export interface ZuliprcConfig {
    zuliprc: string;
  }

  export interface ZulipErrorResponse {
    code: string;
    msg: string;
    result: 'error';
  }
  export interface ZulipSuccessResponse {
    msg: string;
    result: 'success';
  }
  export interface ZulipMessagesRetrieveResponse {
    found_anchor: boolean;
    found_oldest: boolean;
    found_newest: boolean;
    history_limited: boolean;
    anchor: number;
    messages: ZulipMessage[];
  }

  export type ZulipApiResponse<T = object> = Promise<
    (ZulipSuccessResponse & T) | ZulipErrorResponse
  >;

  export interface ZulipClient {
    config: ZulipConfig;
    callEndpoint: typeof callEndpoint;
    accounts: {
      retrieve(): ZulipApiResponse<{
        accounts: {
          email: string;
          user_id: number;
        }[];
      }>;
    };
    server: {
      settings(): ZulipApiResponse<ZulipSettings>;
    };
    filters: {
      retrieve(): ZulipApiResponse<{ filters: ZulipFilter[] }>;
    };
    messages: {
      send(
        params: ZulipDirectMessageParams | ZulipChannelMessageParams,
      ): ZulipApiResponse<{
        id: number;
        automatic_new_visibility_policy?: number;
      }>;
      retrieve(
        params: ZulipMessagesRetrieveParams,
      ): ZulipApiResponse<ZulipMessagesRetrieveResponse>;
      render(params: { content: string }): ZulipApiResponse<{
        rendered_content: string;
      }>;
      flags: {
        add(params: ZulipFlagsAddParams): ZulipApiResponse<{
          messages: number[];
        }>;
        remove(params: ZulipFlagsRemoveParams): ZulipApiResponse<{
          messages: number[];
        }>;
      };
      update(params: { message_id: number; content: string }): ZulipApiResponse;
      getById(params: { message_id: number }): ZulipApiResponse<ZulipMessage>;
      getHistoryById(params: {
        message_ids: number[];
      }): ZulipApiResponse<ZulipMessage[]>;
      deleteReactionById(params: { message_id: number }): ZulipApiResponse;
      deleteById(params: { message_id: number }): ZulipApiResponse;
    };
    queues: {
      register(params: {
        event_types: string[];
        narrow?: ZulipNarrow[];
      }): ZulipApiResponse<{
        last_event_id: number;
        queue_id: string;
        event_queue_longpoll_timeout_seconds?: number;
      }>;
      deregister(params: { queue_id: string }): ZulipApiResponse;
    };
    events: {
      retrieve(params: {
        queue_id: string;
        last_event_id?: number;
      }): ZulipApiResponse<{ events: ZulipEvent[]; queue_id: string }>;
    };
    reactions: {
      add(params: { message_id: number; emoji_name: string }): ZulipApiResponse;
      remove(params: {
        message_id: number;
        emoji_name: string;
      }): ZulipApiResponse;
    };
    users: {
      me: {
        pointer: {
          update(params: {
            stream_id: number;
            topic: string;
          }): ZulipApiResponse;
          retrieve(): ZulipApiResponse<{
            stream_id: number;
            topic: string;
          }>;
        };
        getProfile(): ApiResponse<ZulipUser>;
        subscriptions: {
          remove(params: ZulipRemoveSubscriptionParams): ZulipApiResponse<{
            removed?: string[];
            not_removed?: string[];
          }>;
          add(params: ZulipSubscriptionParams): ZulipApiResponse<{
            subscribed?: string[];
            already_subscribed?: string[];
          }>;
        };
      };
      create(params: ZulipCreateUserParams): ZulipApiResponse<ZulipUser>;
      retrieve(): ZulipApiResponse<{ users: ZulipUser[] }>;
    };
    // emojis: EmojisClient;
    // typing: TypingClient;
    reactions: {
      add(params: { message_id: number; emoji_name: string }): ZulipApiResponse;
      remove(params: {
        message_id: number;
        emoji_name: string;
      }): ZulipApiResponse;
    };
    streams: {
      retrieve(): ZulipApiResponse<{ streams: ZulipStream[] }>;
      getStreamId(name: string): ZulipApiResponse<{
        result: 'success' | 'error';
        msg: string;
        stream_id: number;
      }>;
      subscriptions: {
        retrieve(params: {
          stream_id: number;
        }): ZulipApiResponse<{ subscriptions: ZulipSubscription[] }>;
      };
      deleteById(params: { stream_id: number }): ZulipApiResponse;
      topics: {
        retrieve(params: {
          stream_id: number;
        }): ZulipApiResponse<{ topics: ZulipTopic[] }>;
      };
    };
    // filters: FiltersClient;
  }

  export type ZulipInitialConfig = ZuliprcConfig | Pick<ZulipConfig, 'realm'>;

  export function callEndpoint(
    endpoint: string,
    method: HttpMethod,
    params: Params,
  ): Promise<unknown>;

  export default function zulip(
    initialConfig: Partial<ZulipInitialConfig>,
  ): Promise<ZulipClient>;
}
