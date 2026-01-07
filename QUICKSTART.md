# Quick Start Guide

## Installation (5 minutes)

1. Open Terminal and navigate to the project:
   ```bash
   cd ixl-skill-assigner
   ```

2. Install all dependencies:
   ```bash
   npm install
   ```

3. Install Playwright browser:
   ```bash
   npx playwright install chromium
   ```

## Running the App

```bash
npm run dev
```

This starts:
- Backend server (port 3001)
- Frontend dev server (port 5173)
- Electron desktop app

## First Use

1. **Login**: Enter your IXL teacher credentials
2. **Wait for Sync**: App will automatically load your students and skills
3. **Select Student**: Choose from the dropdown
4. **Select Skills**: Either:
   - Click individual skills
   - Type a range like "M.9-M.21" and click "Add Range"
5. **Assign**: Click the big blue button
6. **Watch Progress**: Real-time modal shows assignment progress

## Range Selection Tips

- Format: `CATEGORY.START-CATEGORY.END`
- Examples:
  - `M.9-M.21` ✓ (12 skills)
  - `A.1-A.5` ✓ (5 skills)
  - `M.9-A.21` ✗ (different categories)

## Troubleshooting

**Can't login?**
- Check credentials
- Make sure not using SSO

**Skills not appearing?**
- Wait 30 seconds for first sync
- Check internet connection

**Assignment failing?**
- Keep browser window open
- Don't minimize during assignment
- Try fewer skills at once

## Important Notes

⚠️ **This tool may violate IXL's Terms of Service**
⚠️ **Use at your own risk**
⚠️ **Keep the browser window open during assignments**
⚠️ **Don't assign 100+ skills at once (looks suspicious)**

## Need Help?

Check the full README.md for detailed documentation.
