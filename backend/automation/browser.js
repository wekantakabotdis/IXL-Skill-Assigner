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

  async launch(headless = false) {
    this.browser = await chromium.launch({
      headless: headless,
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
    this.page.setDefaultTimeout(900000); // 15 minutes for any action
    this.page.setDefaultNavigationTimeout(900000); // 15 minutes for navigation
    return this.page;
  }

  async login(username, password, headless = false) {
    try {
      // Check if browser is actually connected
      if (this.browser && !this.browser.isConnected()) {
        console.log('Browser is disconnected, closing and relaunching...');
        await this.close();
      }

      if (!this.page) {
        await this.launch(headless);
      }

      console.log('Opening IXL login page...');

      try {
        await this.page.goto('https://www.ixl.com/signin/vsafuture/form', {
          waitUntil: 'domcontentloaded'
        });
      } catch (navigationError) {
        console.log('Navigation failed, trying to relaunch browser...', navigationError.message);
        // If navigation fails, the browser/page might be dead. Relaunch and try once more.
        await this.close();
        await this.launch(headless);
        await this.page.goto('https://www.ixl.com/signin/vsafuture/form', {
          waitUntil: 'domcontentloaded'
        });
      }

      // Automated login if credentials provided
      if (username && password) {
        console.log(`Attempting automated login for ${username}...`);
        try {
          await this.page.waitForSelector('input[name="username"], input#username, input[type="text"]', { timeout: 10000 });
          await humanType(this.page, 'input[name="username"], input#username, input[type="text"]', username);
          await this.page.waitForSelector('input[name="password"], input#password, input[type="password"]', { timeout: 10000 });
          await humanType(this.page, 'input[name="password"], input#password, input[type="password"]', password);

          // Click sign in button
          const signInSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            '#signinbutton',
            '.signin-button'
          ];

          let clicked = false;
          for (const selector of signInSelectors) {
            try {
              if (await this.page.$(selector)) {
                await humanClick(this.page, selector);
                clicked = true;
                break;
              }
            } catch (e) { }
          }

          if (!clicked) {
            await this.page.keyboard.press('Enter');
          }

          console.log('Submitted login form. Waiting for navigation...');
        } catch (e) {
          console.log('Automated login entry failed, falling back to manual wait:', e.message);
        }
      } else {
        // Click on the username field to focus it for easy entry
        try {
          await this.page.waitForSelector('input[name="username"], input#username, input[type="text"]', { timeout: 900000 });
          await this.page.click('input[name="username"], input#username, input[type="text"]');
          console.log('Focused on username field for easy entry.');
        } catch (e) {
          console.log('Could not auto-focus username field:', e.message);
        }

        console.log('Please log in manually in the browser window that opened.');
        console.log('Waiting for you to log in...');
        console.log('The app will detect when you are logged in.');
      }

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
