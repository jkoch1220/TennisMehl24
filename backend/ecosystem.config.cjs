/**
 * PM2 Ecosystem Konfiguration
 *
 * Verwendung:
 *   pm2 start ecosystem.config.cjs          # Starten
 *   pm2 stop tennismehl24-backend           # Stoppen
 *   pm2 restart tennismehl24-backend        # Neustarten
 *   pm2 logs tennismehl24-backend           # Logs anzeigen
 *   pm2 monit                               # Monitoring UI
 *   pm2 save                                # Konfiguration speichern
 *   pm2 startup                             # Auto-Start bei Boot
 */

module.exports = {
  apps: [
    {
      name: 'tennismehl24-backend',
      script: './dist/index.js',
      cwd: __dirname,

      // Instanzen (0 = CPU-Kerne)
      instances: 1,
      exec_mode: 'fork',

      // Auto-Restart
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 1000,

      // Memory Limit (Neustart bei Überschreitung)
      max_memory_restart: '500M',

      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },

      // Logs
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Graceful Shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
