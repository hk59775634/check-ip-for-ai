module.exports = {
  apps: [
    {
      name: 'aicheck',
      script: 'server.js',
      cwd: '/www/wwwroot/aicheck.ai101.eu.org',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: 3456,
      },
    },
  ],
};
