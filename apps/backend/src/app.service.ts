import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  constructor(private dataSource: DataSource) {}

  async testConnection() {
    try {
      const connection = await this.dataSource.query('SELECT NOW()');
      return { success: true, timestamp: connection[0].now };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
