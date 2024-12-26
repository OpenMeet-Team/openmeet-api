export interface BlueskySession {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface BlueskyCallbackResponse {
  session: BlueskySession;
  state: string | null;
}
