# Project Rules and Guidelines

## UI & UX Standards

### 1. No Native Dialogs
- **Rule:** Never use native browser dialogs: `alert()`, `confirm()`, or `prompt()`.
- **Reason:** They are blocking, not themeable, and provide a poor user experience.
- **Replacement:** Use the project's custom UI components provided in `SBZRShared`:
  - For notifications/alerts: Use `SBZRShared.showAppToast(message, { tone: 'info'|'success'|'warning'|'error' })`.
  - For confirmations: Use `SBZRShared.showAppConfirm(title, message)`.
  - For inputs: Use `SBZRShared.showCodeInputDialog()` or similar custom modal implementations.

## Development Workflow
- Always verify changes in the target environment if possible.
- Adhere to the established coding style and directory structure.
