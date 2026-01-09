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

  async launch() {
    this.browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
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
    try {
      // Check if browser is actually connected
      if (this.browser && !this.browser.isConnected()) {
        console.log('Browser is disconnected, closing and relaunching...');
        await this.close();
      }

      if (!this.page) {
        await this.launch();
      }

      console.log('Opening IXL login page...');
      console.log('Please log in manually in the browser window that opened.');

      try {
        await this.page.goto('https://www.ixl.com/signin/vsafuture', {
          waitUntil: 'domcontentloaded'
        });
      } catch (navigationError) {
        console.log('Navigation failed, trying to relaunch browser...', navigationError.message);
        // If navigation fails, the browser/page might be dead. Relaunch and try once more.
        await this.close();
        await this.launch();
        await this.page.goto('https://www.ixl.com/signin/vsafuture', {
          waitUntil: 'domcontentloaded'
        });
      }

      // Click on the username field to focus it for easy entry
      try {
        await this.page.waitForSelector('input[name="username"], input#username, input[type="text"]', { timeout: 30000 });
        await this.page.click('input[name="username"], input#username, input[type="text"]');
        console.log('Focused on username field for easy entry.');
      } catch (e) {
        console.log('Could not auto-focus username field:', e.message);
      }

      console.log('Waiting for you to log in...');
      console.log('The app will detect when you are logged in.');

      await this.page.waitForFunction(
        () => {
          return !window.location.href.includes('signin');
        },
        { timeout: 900000 } // 15 minutes timeout
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
      // Ensure we clean up if something went totally wrong
      if (error.message.includes('Target closed') || error.message.includes('browser has been closed')) {
        await this.close();
      }
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
