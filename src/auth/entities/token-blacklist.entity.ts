import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('token_blacklist')
@Index('idx_token_blacklist_jti', ['jti'])
@Index('idx_token_blacklist_expires_at', ['expiresAt'])
export class TokenBlacklist {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ unique: true })
  jti: string; // JWT ID - unique identifier for the token

  @Column()
  userId: number;

  @Column({ type: 'timestamp' })
  expiresAt: Date; // When the original token would have expired

  @Column({ nullable: true })
  reason: string; // e.g., 'logout', 'password_change', 'admin_revoke'

  @CreateDateColumn()
  blacklistedAt: Date;
}
