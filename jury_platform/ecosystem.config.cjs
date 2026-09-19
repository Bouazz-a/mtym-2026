// pm2 process of the jury API on the server — the way the main site's apps
// run (pm2 ls: mtym_front, mtym_admin, mtym_api…). Started and reloaded by
// scripts/deploy.sh. The backend reads the rest of its settings from
// backend/.env; HOST and PORT are pinned here so the API is only ever
// reachable through Caddy.
module.exports = {
  apps: [
    {
      name: "mtym_jury_api",
      cwd: `${__dirname}/backend`,
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3011",
      },
      max_memory_restart: "300M",
      time: true, // timestamps in `pm2 logs mtym_jury_api`
    },
  ],
};
