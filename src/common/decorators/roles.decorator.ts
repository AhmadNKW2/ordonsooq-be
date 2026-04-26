import { SetMetadata } from '@nestjs/common';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  CATALOG_MANAGER = 'catalog_manager',
  CONSTANT_TOKEN_ADMIN = 'constant_token_admin',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
