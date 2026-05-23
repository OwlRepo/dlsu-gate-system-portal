module.exports = {
  apps: [
    {
      name: 'dlsu-portal-be',
      script: 'dist/main.js',
      instances: 3,
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '8G',

      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 10580,
        TYPEORM_CONNECTION_RETRIES: 5,
        TYPEORM_MAX_QUERY_EXECUTION_TIME: 60000,
        TYPEORM_ENTITIES_CACHE: true,
        TYPEORM_POOL_SIZE: 30,
        NODE_OPTIONS:
          '--max-old-space-size=8192 --expose-gc --max-http-header-size=16384',
        KEEP_ALIVE_TIMEOUT: 65000,
        HEADERS_TIMEOUT: 66000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 10580,
        TYPEORM_CONNECTION_RETRIES: 5,
        TYPEORM_MAX_QUERY_EXECUTION_TIME: 60000,
        TYPEORM_ENTITIES_CACHE: true,
        TYPEORM_POOL_SIZE: 30,
        NODE_OPTIONS:
          '--max-old-space-size=8192 --expose-gc --max-http-header-size=16384',
        KEEP_ALIVE_TIMEOUT: 65000,
        HEADERS_TIMEOUT: 66000,
      },

      // Logging
      merge_logs: true, // Merge logs from all instances
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',

      // Make sure pm2-logrotate is installed and configured
      // These options will work only with pm2-logrotate installed
      // To install: `pm2 install pm2-logrotate`
      // Rotation settings are controlled separately via pm2 set commands

      // Clustering
      increment_var: 'PORT',
      instance_var: 'INSTANCE_ID',

      // Graceful shutdown and restarts
      kill_timeout: 30000,
      wait_ready: true,
      listen_timeout: 30000,
      exp_backoff_restart_delay: 100,
      max_restarts: 5,
      min_uptime: '30s',
      restart_delay: 10000,
      force: false,

      // Optional features
      time: true, // timestamp in logs
      deep_monitoring: true,

      // Node args
      node_args: [
        '--max-old-space-size=2048',
        '--expose-gc',
        '--max-http-header-size=16384',
      ],
    },
  ],
};
