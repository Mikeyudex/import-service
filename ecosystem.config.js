module.exports = {
    apps : [{
      name   : "IMPORT SERVICE - PORT: 5003",
      script : "./dist/import-service/src/main.js",
      cron_restart: "0 3 * * *",
      env: {
        NODE_ENV: "dev",
        PORT: 5002
      },
      env_production: {
        NODE_ENV: "prod",
        PORT: 5003
      }
    }]
  }
  