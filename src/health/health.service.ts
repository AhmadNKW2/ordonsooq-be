import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check() {
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();

    const start = Date.now();
    try {
      // Lightweight query to ensure the DB compute is awake (Neon Scale-to-Zero).
      await this.dataSource.query('SELECT 1');
      const latencyMs = Date.now() - start;

      return {
        status: 'ok',
        timestamp,
        uptime,
        db: {
          status: 'ok',
          latency_ms: latencyMs,
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      throw new ServiceUnavailableException({
        status: 'unavailable',
        timestamp,
        uptime,
        db: {
          status: 'down',
          latency_ms: latencyMs,
        },
      });
    }
  }
}
