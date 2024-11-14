// export interface ZulipConfig {
//   username: string;
//   apiKey: string;
//   realm: string;
// }

// export interface ZulipMessage {
//   id?: number;
//   sender_id?: number;
//   content: string;
//   recipient_id?: number;
//   timestamp?: number;
//   client?: string;
//   subject?: string;
//   topic_links?: string[];
//   is_me_message?: boolean;
//   reactions?: ZulipReaction[];
//   submessages?: any[];
//   flags?: string[];
// }

// export interface ZulipStream {
//   stream_id: number;
//   name: string;
//   description: string;
//   rendered_description: string;
//   invite_only: boolean;
//   is_web_public: boolean;
//   stream_post_policy: number;
//   history_public_to_subscribers: boolean;
//   first_message_id: number;
//   message_retention_days: number | null;
//   stream_weekly_traffic: number | null;
//   date_created: number;
//   is_announcement_only: boolean;
// }

// export interface ZulipTopic {
//   name: string;
//   max_id: number;
//   messages: ZulipMessage[];
// }

// export interface ZulipReaction {
//   emoji_name: string;
//   emoji_code: string;
//   reaction_type: string;
//   user_id: number;
// }

// export interface ZulipMessageParams {
//   to: string | number;
//   type: 'stream' | 'private';
//   content: string;
//   topic?: string;
//   queue_id?: string;
//   local_id?: string;
// }

// export interface ZulipMessagesQuery {
//   anchor: number | 'newest' | 'oldest' | 'first_unread';
//   num_before: number;
//   num_after: number;
//   narrow: Array<{
//     operator: string;
//     operand: string | number;
//   }>;
// }

// export interface ZulipResponse<T> {
//   result: string;
//   msg: string;
//   data?: T;
// }
