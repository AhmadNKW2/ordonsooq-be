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
 * 1. HTTP-only cookie named 'access_token'
 * 2. Authorization header as Bearer token (fallback for API clients)
 */
const cookieOrBearerExtractor = (req: Request): string | null => {
  // First try to extract from cookie
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }

  // Fallback to Authorization header for API clients
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
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
    if (payload.type && payload.type !== 'access') {
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
