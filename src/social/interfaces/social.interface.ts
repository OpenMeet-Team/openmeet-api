export interface SocialInterface {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailConfirmed?: boolean; // Whether the email is verified by the OAuth provider (e.g., Bluesky)
  avatar?: string;
  handle?: string; // Bluesky handle (e.g., "user.bsky.social")
}
