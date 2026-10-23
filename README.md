# IXL Skill Assigner

Desktop app that flips IXL's assignment workflow: select **one student**, assign **many skills** at once.

## Features

- **Bulk skill assignment** - Select a student, pick skills (or use range like `M.9-M.21`), assign all at once
- **Multiple subjects** - Math, ELA, NJSLA, NJGPA
- **Student groups** - Create groups for faster batch assignments
- **Queue system** - Queue up multiple assignments, runs in background
- **Assignment history** - Track what was assigned and when

## Download

Get the latest release from the [Releases page](https://github.com/wekantakabotdis/IXL-Skill-Assigner/releases):
- **macOS Intel**: `.dmg` (x64)
- **macOS Apple Silicon**: `.dmg` (arm64)  
- **Windows**: `.exe`

## Usage

1. Launch the app
2. Log in with your IXL teacher credentials
3. Select student(s) → Pick subject/grade → Select skills → Assign

## Disclaimer

This tool automates IXL interactions and may violate their Terms of Service. Use at your own risk.

## Development checks

- `npm test` checks catalog validation, queued skill identity, history preservation, and cancellation with temporary databases.
- `npm run test:browser` runs Playwright regressions against the development UI and local IXL fixtures. Google Chrome must be installed. These tests do not sign in to IXL or change real student assignments.
- `npm run package:mac:all` builds Intel and Apple Silicon DMGs in `release/` and restores the local SQLite dependency afterward.

Regular assignments require `gradeLevel` and `subject` alongside `studentIds` and `skillIds` in `POST /api/assign`. The server rejects skills outside that catalog. A cached catalog with inconsistent grade URLs returns `409 CATALOG_MISMATCH`; the UI refreshes it automatically. Catalog refreshes retain historical skill rows and assignment history.

## License

MIT
