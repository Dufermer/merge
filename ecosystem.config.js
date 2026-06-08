// ecosystem.config.js — PM2 config for Hermes heartbeat processes
// Автозапуск при старте системы, авторестарт при падении

module.exports = {
  apps: [
    {
      name: "translator-heartbeat",
      script: "translator-heartbeat.js",
      cwd: "C:\\Users\\rus\\Desktop\\merge",
      watch: false,
      max_restarts: 100,
      restart_delay: 3000,
      min_uptime: 5000,
      autorestart: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "C:\\Users\\rus\\.pm2\\logs\\translator-heartbeat-error.log",
      out_file: "C:\\Users\\rus\\.pm2\\logs\\translator-heartbeat-out.log",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "paperclip-ceo",
      script: "paperclipai",
      args: "run",
      cwd: "C:\\Users\\rus\\Desktop\\merge",
      watch: false,
      max_restarts: 100,
      restart_delay: 5000,
      min_uptime: 10000,
      autorestart: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "C:\\Users\\rus\\.pm2\\logs\\paperclip-ceo-error.log",
      out_file: "C:\\Users\\rus\\.pm2\\logs\\paperclip-ceo-out.log",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
