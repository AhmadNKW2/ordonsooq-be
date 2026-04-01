import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, UserRole } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  private getEffectiveRoles(role?: string): Set<string> {
    const effectiveRoles = new Set<string>();

    if (!role) {
      return effectiveRoles;
    }

    effectiveRoles.add(role);

    if (
      role === UserRole.CONSTANT_TOKEN_ADMIN ||
      role === 'products_api'
    ) {
      effectiveRoles.add(UserRole.ADMIN);
      effectiveRoles.add(UserRole.CATALOG_MANAGER);
      effectiveRoles.add(UserRole.CONSTANT_TOKEN_ADMIN);
    }

    return effectiveRoles;
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const effectiveRoles = this.getEffectiveRoles(user?.role);
    return requiredRoles.some((role) => effectiveRoles.has(role));
  }
}
