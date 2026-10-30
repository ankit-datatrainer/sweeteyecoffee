// PM2 process file for the VPS: keeps the API (and the web app it serves) running
// and restarts it on crash or reboot.
//   pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: 'sweet-eye',
      cwd: __dirname + '/../server',
      script: 'src/index.js',
      // Hostinger Remote MySQL allowlists this VPS's IPv4 address.
      // Prefer it when the database hostname also resolves to IPv6.
      node_args: '--dns-result-order=ipv4first',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '600M',
      restart_delay: 3000,
      time: true,
    },
  ],
};
