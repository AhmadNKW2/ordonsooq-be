import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        @InjectRepository(PasswordResetToken)
        private passwordResetTokenRepository: Repository<PasswordResetToken>,
    ) { }

    async register(registerDto: RegisterDto) {
        // Enforce ADMIN role for all registrations
        registerDto.role = UserRole.ADMIN;
        const user = await this.usersService.create(registerDto);

        // Generate JWT token
        const payload = { sub: user.id, email: user.email, role: user.role };
        const access_token = this.jwtService.sign(payload);

        return {
            access_token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
        };
    }

    async login(loginDto: LoginDto) {
        const user = await this.usersService.findByEmail(loginDto.email);

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await this.usersService.validatePassword(
            loginDto.password,
            user.password,
        );

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('Account is deactivated');
        }

        const payload = { sub: user.id, email: user.email, role: user.role };
        const access_token = this.jwtService.sign(payload);

        return {
            access_token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
        };
    }

    async validateUser(userId: number) {
        return await this.usersService.findOne(userId);
    }

    async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
        const user = await this.usersService.findByEmail(forgotPasswordDto.email);

        if (!user) {
            // Don't reveal if email exists or not for security
            return {
                data: null,
                message: 'If the email exists, a password reset link has been sent',
            };
        }

        // Generate secure random token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

        // Invalidate any existing tokens for this user
        await this.passwordResetTokenRepository.update(
            { userId: user.id, used: false },
            { used: true },
        );

        // Create new reset token
        const resetToken = this.passwordResetTokenRepository.create({
            token,
            userId: user.id,
            expiresAt,
        });

        await this.passwordResetTokenRepository.save(resetToken);

        // TODO: Send email with reset link
        // const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
        // await this.emailService.sendPasswordResetEmail(user.email, resetLink);

        return {
            data: { token }, // In production, remove this and only send via email
            message: 'Password reset link has been sent to your email',
        };
    }

    async resetPassword(resetPasswordDto: ResetPasswordDto) {
        // Find valid token
        const resetToken = await this.passwordResetTokenRepository.findOne({
            where: {
                token: resetPasswordDto.token,
                used: false,
            },
            relations: ['user'],
        });

        if (!resetToken) {
            throw new BadRequestException('Invalid or expired reset token');
        }

        if (new Date() > resetToken.expiresAt) {
            throw new BadRequestException('Reset token has expired');
        }

        // Update user password
        await this.usersService.updatePassword(resetToken.userId, resetPasswordDto.newPassword);

        // Mark token as used
        resetToken.used = true;
        await this.passwordResetTokenRepository.save(resetToken);

        // Clean up expired tokens
        await this.passwordResetTokenRepository.delete({
            expiresAt: LessThan(new Date()),
        });

        return {
            data: null,
            message: 'Password has been reset successfully',
        };
    }
}