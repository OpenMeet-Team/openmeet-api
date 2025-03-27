export interface MatrixMessage {
  id?: string;
  event_id?: string;
  eventId?: string;
  room_id?: string;
  roomId?: string;
  sender?: string;
  sender_id?: number;
  sender_name?: string;
  sender_full_name?: string;
  content?: {
    msgtype?: string;
    body?: string;
    topic?: string;
    format?: string;
    formatted_body?: string;
    _clientMsgId?: string;
  };
  origin_server_ts?: number;
  timestamp?: number;
  _optimistic?: boolean;
  _clientMsgId?: string;
  type?: string;
}

export interface MatrixRoom {
  id: string;
  name: string;
  topic?: string;
  members?: string[];
  avatarUrl?: string;
}

export interface MatrixUser {
  id: string;
  displayName?: string;
  avatarUrl?: string;
}
