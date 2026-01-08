const { chromium } = require('playwright');
const { humanDelay, humanClick, humanType } = require('./delays');
const { execSync } = require('child_process');

class IXLBrowser {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  async ensureBrowserInstalled() {
    try {
      // Try to get the browser executable path - if it fails, browser isn't installed
      const executablePath = chromium.executablePath();
      const fs = require('fs');
      if (fs.existsSync(executablePath)) {
        console.log('Chromium browser found at:', executablePath);
        return true;
      }
    } catch (e) {
      // Browser not installed
    }

    console.log('Chromium browser not found. Installing... (this may take a few minutes)');
    try {
      execSync('npx playwright install chromium', {
        stdio: 'inherit',
        timeout: 300000 // 5 minute timeout
      });
      console.log('Chromium installed successfully!');
      return true;
    } catch (error) {
      console.error('Failed to install Chromium:', error.message);
      throw new Error('Could not install Chromium browser. Please run: npx playwright install chromium');
    }
  }

  async launch() {
    // Ensure browser is installed before trying to launch
    await this.ensureBrowserInstalled();

    this.browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });

    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    this.page = await this.context.newPage();
    return this.page;
  }

  async login(username, password) {
    if (!this.page) {
      await this.launch();
    }

    try {
      console.log('Opening IXL login page...');
      console.log('Please log in manually in the browser window that opened.');

      await this.page.goto('https://www.ixl.com/signin/vsafuture', {
        waitUntil: 'domcontentloaded'
      });

      console.log('Waiting for you to log in...');
      console.log('The app will detect when you are logged in.');

      await this.page.waitForFunction(
        () => {
          return !window.location.href.includes('signin');
        },
        { timeout: 300000 }
      );

      console.log('Login detected! Waiting a moment for page to settle...');
      await this.page.waitForTimeout(3000);

      const currentUrl = this.page.url();
      console.log('Current URL after login:', currentUrl);

      this.isLoggedIn = currentUrl.includes('ixl.com') &&
        !currentUrl.includes('signin');

      console.log('Login successful:', this.isLoggedIn);
      return this.isLoggedIn;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }

  async saveCookies() {
    if (!this.context) return null;
    const cookies = await this.context.cookies();
    return cookies;
  }

  async loadCookies(cookies) {
    if (!this.context) {
      await this.launch();
    }
    await this.context.addCookies(cookies);
    this.isLoggedIn = true;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.isLoggedIn = false;
    }
  }

  getPage() {
    return this.page;
  }

  isAuthenticated() {
    return this.isLoggedIn;
  }
}

module.exports = IXLBrowser;
