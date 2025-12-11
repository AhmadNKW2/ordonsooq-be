import { Controller, Post, Body, Get, UseGuards, Request, Response, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
    private readonly useSecureCookies: boolean;

    constructor(
        private authService: AuthService,
        private configService: ConfigService,
    ) {
        // Use COOKIE_SECURE env variable, fallback to NODE_ENV check
        const cookieSecure = this.configService.get('COOKIE_SECURE');
        this.useSecureCookies = cookieSecure !== undefined 
            ? cookieSecure === 'true' 
            : this.configService.get('NODE_ENV') === 'production';
    }

    /**
     * Set authentication cookies on response
     */
    private setAuthCookies(res: ExpressResponse, accessToken: string, refreshToken: string): void {
        const cookieOptions = this.authService.getCookieOptions(this.useSecureCookies);

        res.cookie('access_token', accessToken, cookieOptions.access);
        res.cookie('refresh_token', refreshToken, cookieOptions.refresh);
    }

    /**
     * Clear authentication cookies
     */
    private clearAuthCookies(res: ExpressResponse): void {
        const cookieOptions = this.authService.getCookieOptions(this.useSecureCookies);

        res.cookie('access_token', '', {
            ...cookieOptions.access,
            maxAge: 0,
        });
        res.cookie('refresh_token', '', {
            ...cookieOptions.refresh,
            maxAge: 0,
        });
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
        const metadata = this.getRequestMetadata(req);
        const result = await this.authService.register(registerDto, metadata);

        // Set HTTP-only cookies
        this.setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);

        return {
            message: 'Registration successful',
            user: result.user,
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
        this.setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);

        return {
            message: 'Login successful',
            user: result.user,
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
            this.clearAuthCookies(res);
            return {
                statusCode: HttpStatus.UNAUTHORIZED,
                message: 'No refresh token provided',
            };
        }

        try {
            const metadata = this.getRequestMetadata(req);
            const tokens = await this.authService.refreshTokens(refreshToken, metadata);

            // Set new cookies with rotated tokens
            this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

            return {
                message: 'Token refreshed successfully',
            };
        } catch {
            // Clear cookies on refresh failure
            this.clearAuthCookies(res);
            throw new Error('Session expired. Please login again.');
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
        const accessToken = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
        const refreshToken = req.cookies?.refresh_token;

        // Blacklist tokens
        await this.authService.logout(accessToken, refreshToken);

        // Clear cookies
        this.clearAuthCookies(res);

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
        const accessToken = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
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
        this.clearAuthCookies(res);

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