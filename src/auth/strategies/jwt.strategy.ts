import {
  Injectable,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService, TokenPayload } from '../auth.service';

/**
 * Custom extractor that tries to get the JWT from:
 * 1. Authorization header as Bearer token
 * 2. HTTP-only cookie named 'access_token' (fallback for browser auth)
 */
const cookieOrBearerExtractor = (req: Request): string | null => {
  // Prefer an explicit bearer token over ambient cookies.
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Fallback to cookie-based auth for browser clients.
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }

  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: cookieOrBearerExtractor,
      ignoreExpiration: false,
      secretOrKey:
        configService.get('JWT_SECRET') ||
        'your-secret-key-change-in-production',
    });
  }

  async validate(payload: TokenPayload) {
    // Ensure this is an access token, not a refresh token
    if (
      payload.type &&
      payload.type !== 'access' &&
      payload.type !== 'static_access'
    ) {
      throw new UnauthorizedException('Invalid token type');
    }

    try {
      // Validate token (checks blacklist and user status)
      const user = await this.authService.validateToken(payload);
      return user; // This will be available as req.user in controllers
    } catch (error) {
      // Token might be expired, blacklisted, or user no longer exists
      throw new UnauthorizedException(
        'Token validation failed. Please login again.',
      );
    }
  }
}
