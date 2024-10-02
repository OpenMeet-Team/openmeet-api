export class UserRightsDto {
  role: string; // Array of roles, e.g., ['admin', 'user']
  permissions: string[]; // Array of permissions, e.g., ['create_event', 'delete_event']
}
