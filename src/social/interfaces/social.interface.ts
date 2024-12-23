export interface SocialInterface {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  accessToken?: string; // Add optional accessToken field for bluesky authentication
}
