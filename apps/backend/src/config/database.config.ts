import { registerAs } from '@nestjs/config';

const productionConfig = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: false,
  ssl: {
    rejectUnauthorized: false, // Required for Railway's SSL connection
  },
  autoLoadEntities: true,
};

const developmentConfig = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'development',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: true,
  autoLoadEntities: true,
};

export default registerAs('database', () => {
  return process.env.NODE_ENV === 'production'
    ? productionConfig
    : developmentConfig;
});
