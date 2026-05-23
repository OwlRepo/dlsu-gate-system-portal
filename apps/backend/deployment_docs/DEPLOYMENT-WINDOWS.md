# Windows Server Deployment Guide

Complete guide for deploying DLSU Gate System Backend on Windows Server.

---

## Quick Reference Checklist

```
[ ] Step 1: Install Node.js v18+
[ ] Step 2: Install PostgreSQL
[ ] Step 3: Install Redis/Memurai
[ ] Step 4: Run deployment_docs\check-prerequisites.bat (verify all installed)
[ ] Step 5: Clone repository
[ ] Step 6: Run deployment_docs\deploy-windows-server.bat
[ ] Step 7: Edit .env file with credentials
[ ] Step 8: Run deployment_docs\deploy-windows-server.bat again (if needed)
[ ] Step 9: Verify PM2 status
[ ] Step 10: Test health endpoint
[ ] Step 11: (Optional) Install as Windows Service
[ ] Step 12: Configure firewall
[ ] Step 13: Document deployment
```

**Estimated Time**: 30-60 minutes (depending on download speeds and system performance)

---

## Master Deployment Guide

Follow these steps in order to deploy the application successfully.

### Pre-Deployment Checklist

Before starting, ensure you have:

- **Windows Server** (2016 or later recommended)
- **Administrator privileges** (required for some steps)
- **Internet connection** (for downloading prerequisites)
- **Database credentials** ready (PostgreSQL username and password)
- **Approximately 30-60 minutes** for complete setup

---

### Step 1: Install Prerequisites

These tools must be installed manually before deployment. Click the links to download.

#### 1.1 Install Node.js v18+

**Download**: [https://nodejs.org/](https://nodejs.org/)

1. Click the download link above
2. Download the **LTS version** (Long Term Support)
3. Run the installer
4. **Important**: Check "Add to PATH" during installation
5. Verify installation:
   ```batch
   node --version
   ```
   Should show v18.x.x or higher

#### 1.2 Install PostgreSQL

**Download**: [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)

1. Click the download link above
2. Download PostgreSQL installer for Windows
3. Run the installer
4. **Important**: Remember the password you set for the `postgres` user
5. During installation, ensure PostgreSQL is added to PATH
6. Verify installation:
   ```batch
   psql --version
   ```
7. Start PostgreSQL service:
   - Open Services (`services.msc`)
   - Find "postgresql-x64-XX" service
   - Ensure it's running and set to "Automatic" startup

#### 1.3 Install Redis/Memurai

Choose one of the following options:

**Option 1: Memurai (Recommended for Windows)**

**Download**: [https://www.memurai.com/get-memurai](https://www.memurai.com/get-memurai)

1. Click the download link above
2. Download Memurai Developer Edition (free)
3. Run the installer
4. Start the Memurai service
5. Verify installation:
   ```batch
   redis-cli ping
   ```
   Should return `PONG`

**Option 2: Docker Desktop with Redis**

**Download**: [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)

1. Install Docker Desktop
2. Start Docker Desktop
3. Run Redis container:
   ```batch
   docker run -d -p 6379:6379 --name redis redis
   ```

**Option 3: WSL2 with Redis** (Advanced)

If you have WSL2 installed, you can install Redis in the Linux subsystem.

#### 1.4 Verify All Prerequisites

Run the prerequisites checker:

```batch
deployment_docs\check-prerequisites.bat
```

All required tools should show `[OK]` status.

---

### Step 2: Clone Repository

1. Open Command Prompt or PowerShell
2. Navigate to where you want to install the application:
   ```batch
   cd C:\Applications
   ```
3. Clone the repository:
   ```batch
   git clone <your-repository-url>
   ```
4. Navigate to the project directory:
   ```batch
   cd dlsu-gate-system-backend
   ```
5. Verify files are present:
   ```batch
   dir deployment_docs
   ```
   You should see the deployment batch files.

---

### Step 3: Configure Environment

1. Run the deployment script (it will create a `.env` template):
   ```batch
   deployment_docs\deploy-windows-server.bat
   ```
2. The script will create a `.env` file if it doesn't exist
3. **Stop the script** when prompted to edit `.env`
4. Open `.env` file in a text editor
5. Update the following values:

   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=your_postgres_password_here
   DB_NAME=dlsu_portal

   # Redis Configuration
   REDIS_HOST=localhost
   REDIS_PORT=6379

   # Application Configuration
   NODE_ENV=production
   PORT=10580

   # JWT Configuration
   JWT_SECRET=your-secret-key-change-this-in-production
   JWT_EXPIRES_IN=2d
   ```

6. **Important**: 
   - Replace `your_postgres_password_here` with your actual PostgreSQL password
   - Replace `your-secret-key-change-this-in-production` with a strong random string
   - Save the file

---

### Step 4: Deploy Application

1. Run the deployment script again:
   ```batch
   deployment_docs\deploy-windows-server.bat
   ```

2. The script will:
   - Check prerequisites
   - Install PM2 globally (if not installed)
   - Install npm dependencies
   - Build the application
   - Set up the database (create if needed)
   - Run database migrations
   - Create PM2 configuration
   - Start the application with PM2
   - Configure PM2 auto-start on boot

3. **Monitor the output** for any errors

4. If running as Administrator, PM2 startup will be configured automatically
5. If not running as Administrator, follow the instructions shown to configure PM2 startup

---

### Step 5: Verify Deployment

#### 5.1 Check PM2 Status

```batch
pm2 status
```

You should see `dlsu-portal-be` with status `online`.

#### 5.2 Test Health Endpoint

Open a web browser and navigate to:
```
http://localhost:10580/health
```

Should return a JSON response with health status.

#### 5.3 Test API Documentation

Open a web browser and navigate to:
```
http://localhost:10580/api/docs
```

Should display Swagger API documentation.

#### 5.4 Check Logs

```batch
pm2 logs dlsu-portal-be
```

Review logs for any errors or warnings.

#### 5.5 Verify PM2 Auto-Start

1. Check PM2 startup configuration:
   ```batch
   pm2 startup
   ```
   Should show the startup script path

2. Verify PM2 process list is saved:
   ```batch
   pm2 list
   ```
   Processes should be listed

3. **Test auto-start** (optional but recommended):
   - Restart Windows Server
   - After reboot, check PM2 status: `pm2 status`
   - Application should be running automatically

---

### Step 6: (Optional) Install as Windows Service

For more reliable service management, you can install as a Windows Service using NSSM.

#### 6.1 Install NSSM

**Download**: [https://nssm.cc/download](https://nssm.cc/download)

1. Download NSSM
2. Extract `nssm.exe` to a folder in PATH (e.g., `C:\Windows\System32`)
3. Or place it in the project root directory

#### 6.2 Install Service

```batch
deployment_docs\install-windows-service.bat
```

Follow the prompts to install and start the service.

#### 6.3 Manage Service

```batch
# Start service
net start DLSUGateSystemBackend

# Stop service
net stop DLSUGateSystemBackend

# Check status
sc query DLSUGateSystemBackend
```

Or use Windows Services GUI (`services.msc`).

---

### Step 7: Configure Firewall

If you need external access to the API:

1. Open Windows Firewall with Advanced Security
2. Create a new Inbound Rule:
   - Rule Type: Port
   - Protocol: TCP
   - Port: 10580
   - Action: Allow the connection
   - Profile: All
   - Name: DLSU Gate System Backend

Or use command line:

```batch
netsh advfirewall firewall add rule name="DLSU Gate System Backend" dir=in action=allow protocol=TCP localport=10580
```

---

### Step 8: Post-Deployment

#### 8.1 Document Service URLs

- API: `http://localhost:10580`
- API Docs: `http://localhost:10580/api/docs`
- Health Check: `http://localhost:10580/health`

#### 8.2 Set Up Monitoring

- Monitor PM2 status regularly: `pm2 status`
- Check logs periodically: `pm2 logs`
- Set up log rotation if needed

#### 8.3 Configure Backups

- Set up regular PostgreSQL backups
- Backup `.env` file securely
- Document backup procedures

#### 8.4 Document Credentials

- Store database credentials securely
- Document JWT secret (keep it secret!)
- Create a secure credential storage system

---

## Manual Installation Details

### Node.js Installation

**Download**: [https://nodejs.org/](https://nodejs.org/)

1. Visit the Node.js website
2. Download the **Windows Installer (.msi)** for LTS version
3. Run the installer
4. **Critical**: Check "Automatically install the necessary tools" if prompted
5. **Critical**: Ensure "Add to PATH" is checked
6. Complete the installation
7. Restart Command Prompt/PowerShell
8. Verify:
   ```batch
   node --version
   npm --version
   ```

**Troubleshooting**:
- If `node` command not found, add Node.js to PATH manually
- Default installation path: `C:\Program Files\nodejs\`
- Add to PATH: System Properties → Environment Variables → Path → Add Node.js path

---

### PostgreSQL Installation

**Download**: [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)

1. Visit PostgreSQL download page
2. Click "Download the installer"
3. Download PostgreSQL installer (latest version)
4. Run the installer
5. **Important Steps**:
   - Installation Directory: Use default or custom
   - Data Directory: Use default or custom
   - Password: **Set a strong password and remember it!**
   - Port: 5432 (default)
   - Advanced Options: Use default locale
6. **During Installation**:
   - Check "Add PostgreSQL bin directory to PATH"
   - Complete Stack Builder setup (optional)
7. Verify installation:
   ```batch
   psql --version
   ```
8. Test connection:
   ```batch
   psql -U postgres
   ```
   Enter your password when prompted

**Adding PostgreSQL to PATH**:
- Default path: `C:\Program Files\PostgreSQL\{version}\bin`
- Add to PATH: System Properties → Environment Variables → Path → Add PostgreSQL bin path

**Starting PostgreSQL Service**:
- Open Services (`services.msc`)
- Find `postgresql-x64-{version}` service
- Right-click → Start (if not running)
- Right-click → Properties → Set Startup Type to "Automatic"

---

### Redis/Memurai Installation

#### Option 1: Memurai (Recommended)

**Download**: [https://www.memurai.com/get-memurai](https://www.memurai.com/get-memurai)

1. Visit Memurai website
2. Download Memurai Developer Edition (free)
3. Run the installer
4. Complete installation wizard
5. Start Memurai service:
   - Open Services (`services.msc`)
   - Find "Memurai" service
   - Right-click → Start
   - Set Startup Type to "Automatic"
6. Verify:
   ```batch
   redis-cli ping
   ```
   Should return `PONG`

#### Option 2: Docker Desktop

**Download**: [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)

1. Install Docker Desktop
2. Start Docker Desktop
3. Run Redis container:
   ```batch
   docker run -d -p 6379:6379 --name redis redis
   ```
4. Verify:
   ```batch
   docker ps
   ```
   Should show Redis container running

---

### NSSM Installation (Optional)

**Download**: [https://nssm.cc/download](https://nssm.cc/download)

1. Download NSSM
2. Extract the ZIP file
3. Copy `nssm.exe` to one of:
   - `C:\Windows\System32` (system-wide)
   - Project root directory (local)
4. If not in PATH, use full path when running NSSM commands
5. Verify:
   ```batch
   nssm version
   ```

---

### Git Installation

**Download**: [https://git-scm.com/download/win](https://git-scm.com/download/win)

1. Download Git for Windows
2. Run the installer
3. Use default settings (recommended)
4. Verify:
   ```batch
   git --version
   ```

---

## Automated Deployment

### Using Batch Scripts

All deployment scripts are located in the `deployment_docs/` folder.

#### Check Prerequisites

```batch
deployment_docs\check-prerequisites.bat
```

Verifies all required tools are installed.

#### Deploy Application

```batch
deployment_docs\deploy-windows-server.bat
```

Complete deployment script that:
- Checks prerequisites
- Installs dependencies
- Builds application
- Sets up database
- Runs migrations
- Starts with PM2
- Configures auto-start

#### Update Application

```batch
deployment_docs\update-windows.bat
```

Updates existing deployment:
- Pulls latest code
- Installs dependencies
- Builds application
- Runs migrations
- Restarts PM2

#### Install as Windows Service

```batch
deployment_docs\install-windows-service.bat
```

Installs application as Windows Service using NSSM.

---

## Windows Service Installation

### Using NSSM (Recommended)

NSSM provides better Windows Service integration than PM2 startup.

#### Installation Steps

1. Install NSSM (see Manual Installation section)
2. Run:
   ```batch
   deployment_docs\install-windows-service.bat
   ```
3. Follow the prompts
4. Service will be named: `DLSUGateSystemBackend`

#### Service Management

```batch
# Start service
net start DLSUGateSystemBackend

# Stop service
net stop DLSUGateSystemBackend

# Check status
sc query DLSUGateSystemBackend

# View logs
type logs\service-out.log
type logs\service-error.log
```

#### Service Properties

- **Service Name**: DLSUGateSystemBackend
- **Display Name**: DLSU Gate System Backend
- **Startup Type**: Automatic
- **Log Files**: `logs\service-out.log` and `logs\service-error.log`

---

## Troubleshooting

### Common Issues

#### Port Already in Use

**Error**: `EADDRINUSE: address already in use :::10580`

**Solution**:
```batch
# Find process using port 10580
netstat -ano | findstr :10580

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

#### Database Connection Failed

**Error**: `Connection refused` or `Authentication failed`

**Solutions**:
1. Verify PostgreSQL service is running:
   ```batch
   sc query postgresql-x64-*
   ```
2. Check `.env` file credentials
3. Test connection manually:
   ```batch
   psql -U postgres -d postgres
   ```
4. Verify firewall allows PostgreSQL port (5432)

#### PM2 Not Starting

**Error**: Application doesn't start with PM2

**Solutions**:
1. Check PM2 logs:
   ```batch
   pm2 logs dlsu-portal-be
   ```
2. Verify PM2 is installed:
   ```batch
   pm2 --version
   ```
3. Check if port is available
4. Verify `.env` file exists and is configured correctly
5. Try starting manually:
   ```batch
   node dist/main.js
   ```
6. Each run of `deploy-windows-pm2.bat` writes a timestamped log to `logs\deploy-YYYYMMDD-HHMMSS.log`; on failure the script prints its path. Run `pm2 status` and `pm2 logs dlsu-portal-be --lines 100` for one-tap diagnostics. On Windows Server 2022, run the deploy script as Administrator from Command Prompt or PowerShell (`cmd /c deployment_docs\deploy-windows-pm2.bat`).

#### PM2 Auto-Start Not Working

**Issue**: Application doesn't start automatically on boot

**Solutions**:
1. Verify PM2 startup is configured:
   ```batch
   pm2 startup
   ```
2. If not configured, run:
   ```batch
   pm2 startup
   ```
   Then execute the command shown (as Administrator)
3. Verify PM2 process list is saved:
   ```batch
   pm2 save
   ```
4. Check if PM2 dump file exists:
   ```batch
   dir %USERPROFILE%\.pm2\dump.pm2
   ```
5. Check Windows Task Scheduler for PM2 startup task
6. Verify PM2 daemon is running:
   ```batch
   pm2 ping
   ```
7. Manual fix:
   - Run `pm2 startup` as Administrator
   - Execute the generated command
   - Run `pm2 save`
   - Restart Windows Server to test

#### Build Failed

**Error**: `npm run build` fails

**Solutions**:
1. Check Node.js version (must be v18+):
   ```batch
   node --version
   ```
2. Clear node_modules and reinstall:
   ```batch
   rmdir /s /q node_modules
   del package-lock.json
   npm install
   ```
3. Check for TypeScript errors:
   ```batch
   npm run build
   ```
4. Verify all dependencies are installed

#### Migration Failed

**Error**: Database migrations fail

**Solutions**:
1. Verify database exists:
   ```batch
   psql -U postgres -l
   ```
2. Check database connection in `.env`
3. Verify PostgreSQL user has permissions
4. Try running migrations manually:
   ```batch
   npm run migration:run
   ```

#### Firewall Blocking Access

**Issue**: Cannot access API from external machines

**Solutions**:
1. Open port 10580 in Windows Firewall (see Step 7)
2. Verify Windows Firewall is not blocking Node.js
3. Check if antivirus is blocking the port
4. Test locally first: `http://localhost:10580/health`

---

## Maintenance

### Updating the Application

#### Using Update Script

```batch
deployment_docs\update-windows.bat
```

This script will:
- Pull latest code
- Install dependencies
- Build application
- Run migrations
- Restart PM2

#### Manual Update Process

1. Pull latest code:
   ```batch
   git pull origin main
   ```
2. Install dependencies:
   ```batch
   npm install
   ```
3. Build application:
   ```batch
   npm run build
   ```
4. Run migrations:
   ```batch
   npm run migration:run
   ```
5. Restart PM2:
   ```batch
   pm2 restart dlsu-portal-be
   ```
6. Save PM2 process list:
   ```batch
   pm2 save
   ```

### Backup Procedures

#### Database Backup

```batch
# Backup database
pg_dump -U postgres dlsu_portal > backup_%date:~-4,4%%date:~-7,2%%date:~-10,2%.sql

# Restore database
psql -U postgres dlsu_portal < backup_YYYYMMDD.sql
```

#### Application Backup

1. Backup `.env` file (store securely)
2. Backup `logs/` directory
3. Backup `persistent_uploads/` directory
4. Document current PM2 configuration

### Log File Locations

- **PM2 Logs**: `logs/out.log` and `logs/error.log`
- **Windows Service Logs**: `logs/service-out.log` and `logs/service-error.log`
- **PM2 Logs**: `%USERPROFILE%\.pm2\logs\`

### Monitoring Commands

```batch
# Check PM2 status
pm2 status

# View logs
pm2 logs dlsu-portal-be

# Monitor in real-time
pm2 monit

# Check application health
curl http://localhost:10580/health
```

---

## Additional Resources

### Useful Commands

```batch
# PM2 Commands
pm2 status                    # Check status
pm2 logs                      # View logs
pm2 restart dlsu-portal-be    # Restart
pm2 stop dlsu-portal-be       # Stop
pm2 delete dlsu-portal-be     # Remove
pm2 save                      # Save process list
pm2 startup                   # Configure startup

# Database Commands
psql -U postgres              # Connect to PostgreSQL
psql -U postgres -l          # List databases
psql -U postgres -d dlsu_portal  # Connect to app database

# Service Commands (if using NSSM)
net start DLSUGateSystemBackend
net stop DLSUGateSystemBackend
sc query DLSUGateSystemBackend
```

### Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review PM2 logs: `pm2 logs`
3. Check application logs: `logs/error.log`
4. Verify all prerequisites are installed correctly

---

## Summary

This guide provides complete instructions for deploying the DLSU Gate System Backend on Windows Server. Follow the steps in order, and refer to the troubleshooting section if you encounter any issues.

**Key Points**:
- Install all prerequisites before deployment
- Configure `.env` file with correct credentials
- Use `deployment_docs\deploy-windows-server.bat` for automated deployment
- Verify PM2 auto-start is configured
- Test the application after deployment
- Set up regular backups

Good luck with your deployment!

