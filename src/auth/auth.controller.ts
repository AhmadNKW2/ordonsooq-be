import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Response,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../users/entities/user.entity';

@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {
    this.isProduction = this.configService.get('IS_PRODUCTION') === 'true';
  }

  /**
   * Set authentication cookies on response
   */
  private getIsSecureContext(req: ExpressRequest): boolean {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto;
    const isHttps = proto === 'https' || (req as any).secure === true;
    return this.isProduction || isHttps;
  }

  private setAuthCookies(
    req: ExpressRequest,
    res: ExpressResponse,
    accessToken: string,
    refreshToken: string,
  ): void {
    const cookieOptions = this.authService.getCookieOptions(
      this.getIsSecureContext(req),
    );
    res.cookie('access_token', accessToken, cookieOptions.access);
    res.cookie('refresh_token', refreshToken, cookieOptions.refresh);
  }

  /**
   * Clear authentication cookies
   */
  private clearAuthCookies(req: ExpressRequest, res: ExpressResponse): void {
    const cookieOptions = this.authService.getCookieOptions(
      this.getIsSecureContext(req),
    );

    res.cookie('access_token', '', {
      ...cookieOptions.access,
      maxAge: 0,
    });
    res.cookie('refresh_token', '', {
      ...cookieOptions.refresh,
      maxAge: 0,
    });
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Request() req) {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Request() req: ExpressRequest,
    @Response() res: ExpressResponse,
  ) {
    const data = await this.authService.googleLogin(
      req.user,
      this.getRequestMetadata(req),
    );

    this.setAuthCookies(
      req,
      res,
      data.tokens.accessToken,
      data.tokens.refreshToken,
    );

    const frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    return res.redirect(frontendUrl);
  }

  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  async facebookAuth(@Request() req) {}

  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  async facebookAuthRedirect(
    @Request() req: ExpressRequest,
    @Response() res: ExpressResponse,
  ) {
    const data = await this.authService.facebookLogin(
      req.user,
      this.getRequestMetadata(req),
    );

    this.setAuthCookies(
      req,
      res,
      data.tokens.accessToken,
      data.tokens.refreshToken,
    );

    const frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    return res.redirect(frontendUrl);
  }

  @Get('apple')
  @UseGuards(AuthGuard('apple'))
  async appleAuth(@Request() req) {}

  @Post('apple/callback')
  @UseGuards(AuthGuard('apple'))
  async appleAuthCallback(
    @Request() req: ExpressRequest,
    @Response() res: ExpressResponse,
  ) {
    console.log('=== APPLE CALLBACK START ===');
    console.log('User from Apple:', req.user);
    
    try {
      const data = await this.authService.appleLogin(
        req.user,
        this.getRequestMetadata(req),
      );

      console.log('User created/found:', data.user);
      console.log('Access token generated:', data.tokens.accessToken ? 'YES' : 'NO');
      console.log('Refresh token generated:', data.tokens.refreshToken ? 'YES' : 'NO');

      this.setAuthCookies(
        req,
        res,
        data.tokens.accessToken,
        data.tokens.refreshToken,
      );
      
      console.log('Cookies set successfully');
      console.log('Cookie options:', this.authService.getCookieOptions(this.getIsSecureContext(req)));
      
      const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
      console.log('Redirecting to:', frontendUrl);
      console.log('=== APPLE CALLBACK END ===');
      
      return res.redirect(frontendUrl);
    } catch (error) {
      console.error('=== APPLE CALLBACK ERROR ===');
      console.error('Error:', error);
      return res.redirect(`${this.configService.get('FRONTEND_URL')}/login?error=auth_failed`);
    }
  }

  /**
   * Extract request metadata for token storage
   */
  private getRequestMetadata(req: ExpressRequest) {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.socket.remoteAddress,
    };
  }

  // POST /auth/register
  @Post('register')
  async register(
    @Body() registerDto: RegisterDto,
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    if (registerDto.role === UserRole.ADMIN) {
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        throw new ForbiddenException('Admin creation requires authentication');
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        throw new ForbiddenException('Invalid token');
      }

      try {
        const payload = this.jwtService.verify(token);
        if (payload.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only admins can create other admins');
        }
      } catch (error) {
        throw new ForbiddenException('Only admins can create other admins');
      }
    }

    const metadata = this.getRequestMetadata(req);
    const result = await this.authService.register(registerDto, metadata);

    // Set HTTP-only cookies
    this.setAuthCookies(
      req,
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
    );

    return {
      success: true,
      message: 'Registration successful',
      data: {
        user: result.user,
        access_token: result.tokens.accessToken,
        expires_in: this.authService.getAccessTokenExpiresInSeconds(),
      },
    };
  }

  // POST /auth/login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const metadata = this.getRequestMetadata(req);
    const result = await this.authService.login(loginDto, metadata);

    // Set HTTP-only cookies
    this.setAuthCookies(
      req,
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
    );

    return {
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
        access_token: result.tokens.accessToken,
        expires_in: this.authService.getAccessTokenExpiresInSeconds(),
      },
    };
  }

  // POST /auth/refresh - Refresh access token using refresh token
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      this.clearAuthCookies(req, res);
      throw new UnauthorizedException('No refresh token provided');
    }

    try {
      const metadata = this.getRequestMetadata(req);
      const tokens = await this.authService.refreshTokens(
        refreshToken,
        metadata,
      );

      // Set new cookies with rotated tokens
      this.setAuthCookies(req, res, tokens.accessToken, tokens.refreshToken);

      return {
        success: true,
        message: 'Token refreshed successfully',
        data: {
          access_token: tokens.accessToken,
          expires_in: this.authService.getAccessTokenExpiresInSeconds(),
        },
      };
    } catch {
      // Clear cookies on refresh failure
      this.clearAuthCookies(req, res);
      throw new UnauthorizedException('Session expired. Please login again.');
    }
  }

  // POST /auth/logout - Protected route (requires JWT token)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async logout(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const accessToken =
      req.cookies?.access_token ||
      req.headers.authorization?.replace('Bearer ', '');
    const refreshToken = req.cookies?.refresh_token;

    // Blacklist tokens
    await this.authService.logout(accessToken, refreshToken);

    // Clear cookies
    this.clearAuthCookies(req, res);

    return {
      message: 'Logged out successfully',
      userId: (req as any).user.id,
    };
  }

  // POST /auth/logout-all - Logout from all devices
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async logoutAllDevices(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const user = (req as any).user;

    // Get current access token JTI if available
    const accessToken =
      req.cookies?.access_token ||
      req.headers.authorization?.replace('Bearer ', '');
    let accessTokenJti: string | undefined;

    if (accessToken) {
      try {
        const decoded = JSON.parse(
          Buffer.from(accessToken.split('.')[1], 'base64').toString(),
        );
        accessTokenJti = decoded.jti;
      } catch {
        // Ignore decode errors
      }
    }

    await this.authService.logoutAllDevices(user.id, accessTokenJti);

    // Clear cookies
    this.clearAuthCookies(req, res);

    return {
      message: 'Logged out from all devices successfully',
    };
  }

  // GET /auth/profile - Protected route (requires JWT token)
  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Request() req) {
    return {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
    };
  }

  // POST /auth/forgot-password
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  // POST /auth/reset-password
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
