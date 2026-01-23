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

  async login(username, password, headless = false, organization = '') {
    try {
      // Sanitize organization to prevent URL injection
      const sanitizedOrg = organization ? organization.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50) : '';
      const loginUrl = sanitizedOrg
        ? `https://www.ixl.com/signin/${sanitizedOrg}`
        : 'https://www.ixl.com/signin';

      console.log(`Using login URL: ${loginUrl}`);

      // Always close any existing browser process before a fresh login attempt
      // to ensure a clean state and prevent "stuck" situations.
      console.log('Ensuring clean state for fresh login...');
      await this.close();

      await this.launch(headless);

      console.log('Opening IXL login page...');

      try {
        await this.page.goto(loginUrl, {
          waitUntil: 'domcontentloaded'
        });
      } catch (navigationError) {
        console.log('Navigation failed, trying once more...', navigationError.message);
        await this.close();
        await this.launch(headless);
        await this.page.goto(loginUrl, {
          waitUntil: 'domcontentloaded'
        });
      }

      // Automated login if credentials provided
      if (username && password) {
        console.log(`Attempting automated login for ${username}...`);
        try {
          // Fast check for username field
          await this.page.waitForSelector('input[name="username"], input#username', { timeout: 15000 });
          // Use fill() for instant entry instead of slow typing
          await this.page.fill('input[name="username"], input#username', username);
          await this.page.waitForSelector('input[name="password"], input#password', { timeout: 5000 });
          await this.page.fill('input[name="password"], input#password', password);

          await this.page.keyboard.press('Enter');
          console.log('Submitted login form. Waiting for authentication...');

          // Race between successful login and error detection
          const errorSelector = '.invalid-signin, div[role="alert"], #error-message, .error-message, .alert-danger';

          try {
            await Promise.race([
              // Wait for successful navigation away from signin
              this.page.waitForFunction(() => !window.location.href.includes('signin'), { timeout: 10000 }),
              // Or wait for error message to appear
              (async () => {
                const errorElement = await this.page.waitForSelector(errorSelector, { timeout: 10000 });
                if (errorElement) {
                  const errorText = await errorElement.textContent();
                  if (errorText && (errorText.toLowerCase().includes('invalid') ||
                    errorText.toLowerCase().includes('incorrect') ||
                    errorText.toLowerCase().includes('wrong'))) {
                    throw new Error('Invalid username or password');
                  }
                }
              })()
            ]);
          } catch (e) {
            if (e.message === 'Invalid username or password') {
              throw e;
            }
            // If we timeout, check if we're still on signin page
            const currentUrl = this.page.url();
            if (currentUrl.includes('signin')) {
              // Still on signin page after 10 seconds - likely failed
              console.log('Still on signin page after form submission - checking for errors...');

              // Give it a bit more time to show an error
              try {
                const errorElement = await this.page.waitForSelector(errorSelector, { timeout: 5000 });
                if (errorElement) {
                  const errorText = await errorElement.textContent();
                  console.log('Error message found:', errorText);
                  throw new Error('Invalid username or password');
                }
              } catch (innerError) {
                // No error message found, but still on signin page
                console.log('No error message found, but still on signin page - assuming login failed');
                throw new Error('Login failed - please check your credentials');
              }
            }
          }
        } catch (e) {
          if (e.message.includes('Invalid username or password') ||
            e.message.includes('Login failed')) {
            throw e;
          }
          console.log('Automated login entry failed, falling back to manual wait:', e.message);
        }
      } else {
        // Just focus the field and wait for manual login
        try {
          await this.page.waitForSelector('input[name="username"], input#username', { timeout: 10000 });
          await this.page.click('input[name="username"], input#username');
        } catch (e) { }
        console.log('Please log in manually or via automation in the opened window.');
      }

      // Wait for navigation away from signin page (with longer timeout for manual login)
      // Use both URL check AND navigation events for maximum speed/reliability
      await Promise.race([
        this.page.waitForFunction(() => !window.location.href.includes('signin'), { timeout: 900000 }),
        this.page.waitForURL(url => !url.href.includes('signin'), { timeout: 900000 })
      ]);

      console.log('Login detected! Settle check...');

      // Instead of hard 3s wait, wait for a short bit or till network is relatively quiet
      try {
        await Promise.race([
          this.page.waitForLoadState('networkidle', { timeout: 2000 }),
          this.page.waitForTimeout(1000)
        ]);
      } catch (e) {
        // If networkidle times out, that's fine, we proceed anyway
      }

      const currentUrl = this.page.url();
      this.isLoggedIn = currentUrl.includes('ixl.com') && !currentUrl.includes('signin');

      console.log('Login successful:', this.isLoggedIn);
      return { success: this.isLoggedIn };
    } catch (error) {
      console.error('Login error:', error.message);
      // If the target was closed by user, ensure we clean up and return false promptly
      if (error.message.includes('Target closed') || error.message.includes('closed')) {
        console.log('Browser window was closed by user.');
      }
      await this.close();

      // Determine if this is a credentials error
      const isAuthError = error.message.includes('Invalid username or password') ||
                          error.message.includes('Login failed');

      return {
        success: false,
        error: error.message,
        isAuthError
      };
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
    try {
      if (this.browser) {
        // Use a timeout for browser close to prevent hanging
        await Promise.race([
          this.browser.close(),
          new Promise(resolve => setTimeout(resolve, 3000))
        ]);
      }
    } catch (e) {
      console.log('Error during browser close (likely already closed):', e.message);
    } finally {
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
