import { SetMetadata } from '@nestjs/common';

export interface PermissionRequirement {
  context: 'event' | 'group' | 'user';
  permissions: string[];
}

export const PERMISSIONS_KEY = 'permissions';

export const Permissions = (
  ...requirements: (string | PermissionRequirement)[]
) => {
  // Convert any string permissions to user context requirements
  const formattedRequirements: PermissionRequirement[] = requirements.map(
    (req) => {
      if (typeof req === 'string') {
        return {
          context: 'user',
          permissions: [req],
        };
      }
      return req;
    },
  );

  return SetMetadata(PERMISSIONS_KEY, formattedRequirements);
};
