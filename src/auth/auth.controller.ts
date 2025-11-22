import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    // POST /auth/register
    @Post('register')
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    // POST /auth/login
    @Post('login')
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    // POST /auth/logout - Protected route (requires JWT token)
    @Post('logout')
    @UseGuards(AuthGuard('jwt'))
    async logout(@Request() req) {
        // Since we're using stateless JWT, logout is handled on the client side
        // Client should remove the token from storage
        // This endpoint can be used for logging or additional cleanup if needed
        return {
            message: 'Logged out successfully',
            userId: req.user.id,
        };
    }

    // NOTE: profile route removed per project requirements

    // POST /auth/forgot-password
    @Post('forgot-password')
    async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
        return this.authService.forgotPassword(forgotPasswordDto);
    }

    // POST /auth/reset-password
    @Post('reset-password')
    async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
        return this.authService.resetPassword(resetPasswordDto);
    }
}