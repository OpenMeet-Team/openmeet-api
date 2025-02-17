export interface BlueskyPreferences {
  did?: string;
  handle?: string;
  avatar?: string;
  connected?: boolean;
  disconnectedAt?: Date | null;
  connectedAt?: Date | null;
  autoPost?: boolean;
}

export interface UserPreferences {
  bluesky?: BlueskyPreferences;
}
