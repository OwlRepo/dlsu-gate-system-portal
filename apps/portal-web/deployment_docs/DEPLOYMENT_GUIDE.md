# DLSU Portal - Windows Server Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Pre-Deployment Checklist](#pre-deployment-checklist)
4. [Deployment Instructions](#deployment-instructions)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Maintenance](#maintenance)
7. [Troubleshooting](#troubleshooting)
8. [Uninstallation](#uninstallation)

---

## Overview

This guide provides step-by-step instructions for deploying the DLSU Portal Next.js application on a Windows Server without Docker. The deployment process is automated through batch scripts that handle installation, configuration, and startup.

### What This Deployment Includes

- **Node.js Installation** (v20 LTS) - Automatically installed if not present
- **Project Dependencies** - All npm packages installed
- **Application Build** - Next.js production build
- **PM2 Process Manager** - For application lifecycle management
- **Windows Startup Configuration** - Automatic startup on server boot
- **Helper Scripts** - Easy management commands

---

## Prerequisites

### System Requirements

- **Operating System**: Windows Server 2016 or later
- **Architecture**: x64 (64-bit)
- **RAM**: Minimum 4GB (8GB recommended)
- **Disk Space**: Minimum 5GB free space
- **Network**: Internet connection for initial setup

### Required Permissions

- **Administrative Rights**: All deployment scripts require administrator privileges
- **Network Access**: Ability to download Node.js installer and npm packages
- **Firewall**: Port 3000 should be accessible (or configure custom port)

### Software Requirements

- **Windows PowerShell** (included with Windows Server)
- **Internet Explorer** or **Microsoft Edge** (for downloading Node.js if needed)

---

## Pre-Deployment Checklist

Before starting the deployment, ensure the following:

### 1. Environment Variables

Create a `.env` file in the project root directory with the following variables:

```env
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_BIOSTAR_API=<your-biostar-api-url>
NEXT_PUBLIC_BIOSTAR_LOGIN_ID=<biostar-login-id>
NEXT_PUBLIC_BIOSTAR_PASSWORD=<biostar-password>
NEXT_PUBLIC_API_URL=<your-api-url>
```

**Important**: Replace the placeholder values with your actual API URLs and Biostar credentials.

### 2. Firewall Configuration

Ensure port 3000 (or your configured port) is open in Windows Firewall:

1. Open **Windows Defender Firewall with Advanced Security**
2. Click **Inbound Rules** → **New Rule**
3. Select **Port** → **Next**
4. Select **TCP** and enter port **3000** → **Next**
5. Select **Allow the connection** → **Next**
6. Check all profiles → **Next**
7. Name it "DLSU Portal" → **Finish**

### 3. Project Files

Ensure all project files are present in the deployment directory:

- `package.json`
- `next.config.ts`
- `src/` directory
- `public/` directory
- All other project files

### 4. Backup (Optional but Recommended)

- Backup any existing application data
- Document current server configuration
- Note any custom environment variables

---

## Deployment Instructions

### Step 1: Prepare the Deployment Directory

1. Copy the entire project folder to your Windows Server
2. Navigate to the `deployment_docs` folder within the project
3. Verify all deployment files are present:
   - `deploy.bat`
   - `ecosystem.config.js`
   - `setup-pm2-startup.bat`
   - `stop.bat`
   - `restart.bat`
   - `status.bat`
   - `logs.bat`
   - `DEPLOYMENT_GUIDE.md` (this file)

### Step 2: Configure Environment Variables

1. Navigate to the project root directory (one level up from `deployment_docs`)
2. Create a `.env` file if it doesn't exist
3. Add all required environment variables (see Pre-Deployment Checklist)

### Step 3: Run the Deployment Script

1. **Right-click** on `deploy.bat` in the `deployment_docs` folder
2. Select **"Run as administrator"**
3. The script will:
   - Check and install Node.js (if needed)
   - Install project dependencies
   - Build the application
   - Install PM2 globally
   - Start the application with PM2
   - Configure startup (with manual step)

4. **Wait for completion** - This may take 10-20 minutes depending on:
   - Internet speed (for downloading Node.js and packages)
   - Server performance
   - Number of dependencies

### Step 4: Configure Windows Startup (Optional but Recommended)

After the deployment script completes:

1. Run `setup-pm2-startup.bat` as administrator
2. Copy the command shown in the output (starts with `pm2 startup`)
3. Open a new **Administrator Command Prompt**
4. Paste and run the command
5. Run `pm2 save` to save the current process list

**Note**: This ensures the application starts automatically when Windows Server reboots.

### Step 5: Verify Deployment

See [Post-Deployment Verification](#post-deployment-verification) section below.

---

## Post-Deployment Verification

### 1. Check Application Status

Run `status.bat` from the `deployment_docs` folder or use:

```batch
pm2 list
```

You should see `dlsu-portal` in the list with status `online`.

### 2. Check Application Logs

Run `logs.bat` from the `deployment_docs` folder or use:

```batch
pm2 logs dlsu-portal
```

Look for:
- No error messages
- Application started successfully
- Server listening on port 3000

### 3. Test Application Access

1. Open a web browser on the server
2. Navigate to: `http://localhost:3000`
3. Verify the application loads correctly
4. Test key functionality (login, navigation, etc.)

### 4. Test from Remote Machine (if applicable)

1. From another machine on the network, navigate to: `http://<server-ip>:3000`
2. Ensure firewall rules allow access
3. Verify the application loads correctly

### 5. Check System Resources

Monitor system resources to ensure the application is running smoothly:

```batch
pm2 monit
```

This shows real-time CPU and memory usage.

---

## Maintenance

### Common Operations

#### View Application Status

```batch
cd deployment_docs
status.bat
```

Or directly:
```batch
pm2 list
pm2 describe dlsu-portal
```

#### View Application Logs

```batch
cd deployment_docs
logs.bat
```

Or directly:
```batch
pm2 logs dlsu-portal
pm2 logs dlsu-portal --lines 100  # Last 100 lines
pm2 logs dlsu-portal --err        # Error logs only
```

#### Restart Application

```batch
cd deployment_docs
restart.bat
```

Or directly:
```batch
pm2 restart dlsu-portal
```

#### Stop Application

```batch
cd deployment_docs
stop.bat
```

Or directly:
```batch
pm2 stop dlsu-portal
```

#### Start Application (if stopped)

```batch
pm2 start ecosystem.config.js
pm2 save
```

### Updating the Application

When you need to deploy updates:

1. **Stop the application**:
   ```batch
   cd deployment_docs
   stop.bat
   ```

2. **Update project files** (copy new files to project directory)

3. **Rebuild and redeploy**:
   ```batch
   cd deployment_docs
   deploy.bat
   ```

   Or manually:
   ```batch
   cd <project-root>
   npm install
   npm run build
   pm2 restart dlsu-portal
   ```

### Monitoring

#### Real-time Monitoring

```batch
pm2 monit
```

#### Check Resource Usage

```batch
pm2 list
```

The output shows CPU and memory usage for each process.

#### View Detailed Information

```batch
pm2 describe dlsu-portal
```

### Log Management

PM2 logs are stored in:
- `./logs/pm2-out.log` - Standard output
- `./logs/pm2-error.log` - Error output

To clear logs:
```batch
pm2 flush
```

To rotate logs (if they get too large):
```batch
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: "Node.js is not recognized"

**Symptoms**: Script fails with "node is not recognized as an internal or external command"

**Solutions**:
1. Restart the command prompt after Node.js installation
2. Verify Node.js is in PATH: `echo %PATH%`
3. Manually add Node.js to PATH if needed:
   - System Properties → Environment Variables
   - Add `C:\Program Files\nodejs` to System PATH
4. Re-run `deploy.bat`

#### Issue: "npm install fails"

**Symptoms**: Dependency installation fails with network errors

**Solutions**:
1. Check internet connection
2. Verify firewall allows npm access
3. Try clearing npm cache: `npm cache clean --force`
4. Check npm registry: `npm config get registry`
5. If behind corporate proxy, configure npm proxy:
   ```batch
   npm config set proxy http://proxy-server:port
   npm config set https-proxy http://proxy-server:port
   ```

#### Issue: "Build fails"

**Symptoms**: `npm run build` fails with errors

**Solutions**:
1. Check error messages in the output
2. Ensure all environment variables are set correctly
3. Verify Node.js version: `node --version` (should be v20.x)
4. Clear `.next` folder and rebuild:
   ```batch
   rmdir /s /q .next
   npm run build
   ```

#### Issue: "PM2 fails to start application"

**Symptoms**: Application doesn't start or crashes immediately

**Solutions**:
1. Check PM2 logs: `pm2 logs dlsu-portal`
2. Verify `ecosystem.config.js` exists in project root
3. Check if port 3000 is already in use:
   ```batch
   netstat -ano | findstr :3000
   ```
4. Verify environment variables are set correctly
5. Try starting manually:
   ```batch
   npm start
   ```

#### Issue: "Application not accessible from network"

**Symptoms**: Works on localhost but not from other machines

**Solutions**:
1. Check Windows Firewall rules (see Pre-Deployment Checklist)
2. Verify application is binding to `0.0.0.0` not just `localhost`
3. Check server IP address: `ipconfig`
4. Verify port is not blocked by network firewall
5. Check Next.js configuration in `next.config.ts`

#### Issue: "PM2 startup not working after reboot"

**Symptoms**: Application doesn't start automatically after server restart

**Solutions**:
1. Verify PM2 startup is configured:
   ```batch
   pm2 startup
   ```
2. Ensure PM2 process list is saved:
   ```batch
   pm2 save
   ```
3. Check Windows Task Scheduler for PM2 startup task
4. Re-run `setup-pm2-startup.bat` and follow instructions

#### Issue: "High memory usage"

**Symptoms**: Application consumes excessive memory

**Solutions**:
1. Check current usage: `pm2 list`
2. Restart application: `pm2 restart dlsu-portal`
3. Adjust `max_memory_restart` in `ecosystem.config.js`
4. Monitor with: `pm2 monit`

#### Issue: "Application crashes frequently"

**Symptoms**: Application stops unexpectedly

**Solutions**:
1. Check error logs: `pm2 logs dlsu-portal --err`
2. Verify environment variables are correct
3. Check system resources (CPU, memory, disk)
4. Review application code for errors
5. Enable PM2 auto-restart (should be enabled by default)

### Getting Help

If you encounter issues not covered here:

1. **Check PM2 Logs**: `pm2 logs dlsu-portal`
2. **Check Windows Event Viewer**: Look for application errors
3. **Review Deployment Logs**: Check the output from `deploy.bat`
4. **Verify Configuration**: Ensure all environment variables and settings are correct
5. **Check System Resources**: Ensure server has adequate resources

---

## Uninstallation

### Removing the Application

To completely remove the application from the server:

#### Step 1: Stop and Delete PM2 Process

```batch
pm2 stop dlsu-portal
pm2 delete dlsu-portal
pm2 save
```

#### Step 2: Remove PM2 Startup (Optional)

1. Open Task Scheduler
2. Find and delete the PM2 startup task
3. Or run: `pm2 unstartup`

#### Step 3: Uninstall PM2 (Optional)

```batch
npm uninstall -g pm2
```

#### Step 4: Remove Project Files

Delete the project directory from the server.

#### Step 5: Uninstall Node.js (Optional)

If Node.js was installed only for this project:

1. Open **Control Panel** → **Programs and Features**
2. Find **Node.js**
3. Click **Uninstall**

#### Step 6: Remove Firewall Rule (Optional)

1. Open **Windows Defender Firewall with Advanced Security**
2. Find the "DLSU Portal" inbound rule
3. Delete it

### Partial Removal

To keep Node.js and PM2 but remove only the application:

```batch
pm2 stop dlsu-portal
pm2 delete dlsu-portal
pm2 save
```

Then delete the project directory.

---

## Additional Resources

### PM2 Documentation

- Official PM2 Documentation: https://pm2.keymetrics.io/docs/
- PM2 Windows Guide: https://pm2.keymetrics.io/docs/usage/startup/

### Next.js Documentation

- Next.js Deployment: https://nextjs.org/docs/deployment
- Next.js Production: https://nextjs.org/docs/going-to-production

### Node.js Documentation

- Node.js Downloads: https://nodejs.org/
- Node.js Windows Installation: https://nodejs.org/en/download/

---

## Support

For deployment-related issues:

1. Review this guide thoroughly
2. Check the Troubleshooting section
3. Review PM2 and application logs
4. Contact your system administrator or development team

---

## Version History

- **v1.0** - Initial deployment guide and scripts

---

**Last Updated**: 2024

**Document Version**: 1.0

