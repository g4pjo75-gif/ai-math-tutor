const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8765',
    channel: 'chrome',
    headless: true,
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 900 }
  },
  webServer: {
    command: 'python3 -m http.server 8765 --bind 127.0.0.1',
    cwd: __dirname,
    url: 'http://localhost:8765/math/',
    reuseExistingServer: true,
    timeout: 30000
  }
});
