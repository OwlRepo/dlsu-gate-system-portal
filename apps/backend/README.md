# DLSU Gate System Backend

A high-availability, load-balanced backend service for DLSU's campus access management system.

## Overview

Enterprise-grade backend service featuring:

- 5-node distributed API architecture
- Sub-second gate access validation
- Automated university system synchronization
- Multi-layer security with DDoS protection
- Horizontal scalability with zero-downtime deployment

## Branch Management

> **Important**: This repository follows strict branch management practices:
>
> - `main` - Production environment only. Protected branch for stable releases
> - `dev` - Development and testing environment
>
> Always create feature branches from `dev` and submit PRs to `dev` first. Changes are promoted to `main` only after thorough testing.

## Architecture

```
┌─────────────────┐     ┌──────────────┐
│   Nginx (LB)    │────▶│ API Node 1   │
│   - SSL Term    │     └──────────────┘
│   - Rate Limit  │     ┌──────────────┐
│   - Load Bal    │────▶│ API Node 2   │
└────────┬────────┘     └──────────────┘
         │              ┌──────────────┐
         └─────────────▶│ API Node 3-5 │
                        └──────────────┘
         │                    │
    ┌────┼────────────┬───────┘
    │    │            │
┌─────────┐     ┌─────────┐
│ Redis   │     │ Postgres│
└─────────┘     └─────────┘
    │
    │
┌───────────────┐
│ File Storage  │
└───────────────┘
```

### Core Components

- **Nginx**: Load balancing, SSL termination, DDoS protection
- **API Nodes**: NestJS-powered business logic and request handling
- **Redis**: Session management, caching, rate limiting
- **PostgreSQL**: Transactional data storage, audit logs

## Quick Start

1. **Prerequisites**

   - Node.js (v18 or higher)
   - PM2 (Process Manager)
   - Git
   - Bun

2. **Setup**

```bash
git clone git@github.com:OwlRepo/dlsu-gate-system-backend.git
cd dlsu-gate-system-backend

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Install dependencies
bun install

# Build the application
bun run build

# Start with PM2
pm2 start ecosystem.config.js
```

3. **Access Points**

- API: `http://localhost:10580`
- Docs: `http://localhost:10580/api/docs`
- Health: `http://localhost:10580/health`

## Development

```bash
# Install dependencies
bun install

# Development server
bun run dev

# Testing
bun test

# Linting
bun run lint
```

### Best Practices

- Follow TypeScript standards
- Maintain 80%+ test coverage
- Use feature branches
- Write conventional commits

## Monitoring

### Logs

```
logs/
├── application/  # App logs
├── access/       # Access logs
├── error/        # Error logs
└── sync/         # Sync logs
```

### Health Checks

```bash
curl http://localhost:10580/health
pm2 status
pm2 logs
```

## Technology Stack

- **NestJS**: TypeScript-based API framework
- **PostgreSQL**: ACID-compliant database
- **Redis**: Distributed caching
- **Nginx**: Load balancing and security
- **PM2**: Process management and clustering

## Deployment

### Production Requirements

- 4+ CPU cores
- 8GB+ RAM
- 50GB+ storage
- SSL certificate

### Deploy

```bash
# Pull latest changes
git pull origin main

# Install dependencies
bun install

# Build the application
bun run build

# Start with PM2
pm2 start ecosystem.config.js

# Note: The system automatically deploys 5 API instances as defined in ecosystem.config.js
```

### Maintenance

```bash
# Backup
pg_dump -U postgres dlsu_gate_system > backup.sql

# Updates
git pull origin main
bun install
bun run build
pm2 reload ecosystem.config.js
bun run migration:run
```

## License

Copyright © 2024 De La Salle University. All rights reserved.
Proprietary and confidential software.
