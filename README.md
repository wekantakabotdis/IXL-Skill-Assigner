# IXL Skill Assigner

An automated desktop application for assigning IXL skills to students. This tool allows teachers to select a student and mass-assign multiple skills at once, including a convenient range selection feature (e.g., M.9-M.21).

## Features

- **Student-Centric Assignment**: Select ONE student and assign MANY skills (opposite of IXL's default workflow)
- **Range Selection**: Quickly select skill ranges like "M.9-M.21" to assign multiple skills at once
- **Search & Filter**: Search for specific skills by name
- **Category Organization**: Skills organized by IXL categories with collapsible sections
- **Progress Tracking**: Real-time progress indicator showing which skills are being assigned
- **Human-Like Automation**: Uses randomized delays and natural mouse movements to avoid detection
- **Cross-Platform**: Works on macOS, Windows, and Linux

## Prerequisites

- Node.js 18+ installed
- IXL teacher account
- At least 2GB of available RAM

## Installation

1. Clone or download this repository
2. Navigate to the project directory:
   ```bash
   cd ixl-skill-assigner
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. **Browser Setup**:
   - Ensure you have **Google Chrome** installed on your computer. The application uses your official browser for automation.

## Running the Application

### Development Mode

1. Start the backend server and frontend dev server:
   ```bash
   npm run dev
   ```

This will:
- Start the Express backend API on `http://localhost:3001`
- Start the Vite dev server on `http://localhost:5173`
- Launch the Electron app automatically

### Production Build

1. Build the React frontend:
   ```bash
   npm run build
   ```

2. Package the Electron app:
   ```bash
   npm run package
   ```

The packaged app will be in the `dist` folder.

## How to Use

### First-Time Setup

1. Launch the application
2. Log in with your IXL teacher credentials
3. The app will automatically sync your students and skills on first login

### Assigning Skills

1. **Select a Student**: Choose a student from the dropdown menu
2. **Select Skills**: Use one of these methods:
   - **Manual Selection**: Click individual skills in the list
   - **Range Selection**: Type a range (e.g., "M.9-M.21") in the "Quick Range Selection" box and click "Add Range"
   - **Search**: Use the search box to filter skills by name
3. **Assign**: Click the "Assign Skills to Student" button
4. **Monitor Progress**: Watch the real-time progress modal as skills are assigned

### Range Selection Examples

- `M.9-M.21` - Selects skills M.9 through M.21
- `A.1-A.5` - Selects skills A.1 through A.5
- `BB.10-BB.15` - Selects skills BB.10 through BB.15

**Note**: Both skills in the range must be from the SAME category (e.g., both M, both A, etc.)

## Project Structure

```
ixl-skill-assigner/
├── backend/
│   ├── automation/          # Playwright automation scripts
│   │   ├── browser.js       # Browser management
│   │   ├── delays.js        # Human-like delays
│   │   ├── scraper.js       # Data scraping
│   │   └── assigner.js      # Skill assignment logic
│   ├── database/            # SQLite database
│   │   ├── schema.sql       # Database schema
│   │   └── db.js            # Database access layer
│   └── server.js            # Express API server
├── electron/
│   ├── main.js              # Electron main process
│   └── preload.js           # Electron preload script
├── frontend/
│   └── src/
│       ├── components/      # React components
│       │   ├── StudentSelector.jsx
│       │   ├── SkillsSelector.jsx
│       │   ├── ProgressModal.jsx
│       │   └── Notification.jsx
│       ├── utils/
│       │   ├── api.js       # API client
│       │   └── skillHelpers.js  # Skill utilities
│       ├── App.jsx          # Main app component
│       └── main.jsx         # React entry point
├── package.json
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login to IXL
- `GET /api/auth/status` - Check authentication status

### Data Sync
- `POST /api/sync/students` - Sync students from IXL
- `POST /api/sync/skills` - Sync skills from IXL

### Data Retrieval
- `GET /api/students` - Get all students
- `GET /api/skills?gradeLevel=8` - Get skills for a grade level

### Assignment
- `POST /api/assign` - Create an assignment task
- `GET /api/assign/:taskId/status` - Get assignment progress

### History
- `GET /api/history?studentId=1&limit=100` - Get assignment history

## Troubleshooting

### Login Issues
- Ensure your IXL credentials are correct
- Check if your school uses SSO (currently not supported)
- Try logging in manually to IXL first to check for CAPTCHAs

### Skills Not Syncing
- Click the sync button manually
- Check your internet connection
- Ensure you're still logged in to IXL

### Assignment Failures
- Check the error message in the notification
- Ensure the browser window stays open during assignment
- Reduce the number of skills being assigned at once

### Browser Detection
- The app uses stealth mode, but if IXL detects automation:
  - Reduce assignment frequency
  - Add longer delays between assignments
  - Assign fewer skills per session

## Security Notes

- Your IXL credentials are sent directly to IXL's servers
- No credentials are stored persistently (you must log in each session)
- All data is stored locally in a SQLite database
- The automation runs in a visible browser window for transparency

## Limitations

- Currently supports Grade 8 Math only (easily extensible)
- Does not support SSO logins
- Requires manual login each session
- Browser window must remain open during assignment

## Customization

### Change Grade Level
Edit `frontend/src/App.jsx`, line with `api.getSkills('8')` and change `'8'` to your desired grade.

### Adjust Automation Speed
Edit `backend/automation/delays.js` to change delay ranges:
- `humanDelay()` - 1-3 seconds (between major actions)
- `shortDelay()` - 100-300ms (between minor actions)

### Change Default Port
Edit `backend/server.js` line `const PORT = 3001;` to use a different port.

## Disclaimer

This tool automates interactions with IXL's website. While it uses human-like delays and stealth techniques:

1. **Terms of Service**: This may violate IXL's Terms of Service. Use at your own risk.
2. **Detection**: IXL may detect and block automation.
3. **Account Risk**: Your IXL account could be suspended.
4. **No Warranty**: This software is provided as-is with no guarantees.

**Recommendation**: Use sparingly and contact IXL support if you need bulk assignment features.

## License

MIT License - use at your own risk.

## Support

For issues or questions, please open an issue on GitHub.
