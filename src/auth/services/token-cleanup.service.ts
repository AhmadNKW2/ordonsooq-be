import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from '../auth.service';

@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(private authService: AuthService) {}

  /**
   * Clean up expired tokens every hour
   * This removes:
   * - Expired refresh tokens
   * - Expired token blacklist entries
   * - Expired password reset tokens
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleTokenCleanup() {
    this.logger.log('Starting scheduled token cleanup...');
    try {
      await this.authService.cleanupExpiredTokens();
      this.logger.log('Token cleanup completed successfully');
    } catch (error) {
      this.logger.error('Token cleanup failed', error);
    }
  }
}
