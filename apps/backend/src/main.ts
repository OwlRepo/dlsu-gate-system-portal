import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { AppDataSource } from './config/data-source';

async function bootstrap() {
  // Add prominent separator for visibility
  console.log('\n===========================================');
  console.log('🚀 STARTING APPLICATION INITIALIZATION');
  console.log('===========================================\n');

  // Database initialization with detailed logging
  console.log('📊 DATABASE INITIALIZATION');
  console.log('-------------------------------------------');
  try {
    console.log('⏳ Connecting to database...');
    console.log('Database config:', {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'dlsu_portal',
    });

    // Initialize the database connection
    await AppDataSource.initialize();
    console.log('✅ Database connection established successfully');

    // Run pending migrations
    console.log('\n📦 RUNNING MIGRATIONS');
    console.log('-------------------------------------------');
    const pendingMigrations = await AppDataSource.showMigrations();
    if (pendingMigrations) {
      const migrations = await AppDataSource.runMigrations();
      console.log(`✅ Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach((migration, index) => {
        console.log(`   ${index + 1}. ${migration.name}`);
      });
    } else {
      console.log('✅ No pending migrations found');
    }

    // Verify all migrations have been applied
    const unappliedMigrations = await AppDataSource.showMigrations();
    if (unappliedMigrations) {
      throw new Error('Some migrations were not applied successfully');
    }
  } catch (error) {
    console.log('\n❌ DATABASE ERROR');
    console.log('-------------------------------------------');
    console.error('Failed to initialize database or run migrations:');
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }

  console.log('\n🛠️  INITIALIZING APPLICATION SERVER');
  console.log('-------------------------------------------');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('trust proxy', 1);

  // Enable CORS
  app.enableCors({
    origin: '*', // Allow all origins
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Requested-With',
    ],
    exposedHeaders: ['Authorization'],
    maxAge: 3600, // Cache preflight requests for 1 hour
  });

  // Setup Swagger
  const config = new DocumentBuilder()
    .setTitle('DLSU Gate System API')
    .setDescription('API documentation for DLSU Gate System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const guard = app.get(JwtAuthGuard);
  app.useGlobalGuards(guard);

  // Remove the environment check and always serve static files
  app.useStaticAssets(join(process.cwd(), 'persistent_uploads'), {
    prefix: '/persistent_uploads',
  });

  // Add graceful shutdown
  app.enableShutdownHooks();

  // Add compression
  app.use(compression());

  // Add rate limiting with increased limit
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // increased from 100 to 1000 requests per windowMs
    }),
  );

  await app.listen(process.env.PORT || 3000, '0.0.0.0');
  const appUrl = await app.getUrl();

  console.log('\n===========================================');
  console.log(`✨ Application successfully started!`);
  console.log(`🌐 Server running at: ${appUrl}`);
  console.log('===========================================\n');
}

bootstrap().catch((error) => {
  console.error('\n❌ FATAL APPLICATION ERROR');
  console.error('-------------------------------------------');
  console.error('Error:', error);
  process.exit(1);
});
