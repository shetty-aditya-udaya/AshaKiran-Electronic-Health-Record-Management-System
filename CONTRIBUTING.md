# Contributing to AshaKiran

We are thrilled that you are interested in contributing to **AshaKiran (Ray of Hope)**! front-line ASHA health workers rely on this platform to deliver essential maternal care, vaccinations, and disease screening in remote communities. Your contributions help ensure the system remains reliable, highly performant, and secure.

---

## 📜 Code of Conduct

By participating in this project, you agree to abide by our standards of respectful, collaborative, and professional conduct. We expect all contributors to maintain high standards of patient privacy and medical data integrity.

---

## 🛠️ Development Standards

### 1. Offline-First Principles
AshaKiran is built to function fully offline under unstable 2G/3G network conditions.
- **Never bypass IndexedDB (Dexie)**: All frontend writes *must* write locally first. The background sync engine handles reconciliation.
- **Strict Idempotency**: Ensure all API requests use unique client-generated UUID keys to prevent double-insertions during reconnect storm replays.

### 2. Security Standards
- **Zero-Tolerance for Secrets**: Never commit `.env` files, certificates, or MySQL credentials.
- **Data Protection**: Ensure all patient identifiers are handled with proper client and server-side encryption/security controls. All uploads must validate magic-bytes binary headers.

### 3. Localization (i18n)
AshaKiran supports 10 distinct Indian languages.
- Never hardcode English strings in components.
- Always use the `useTranslation` hook and map strings to translation keys in `frontend/src/i18n/en.json` and `hi.json` (and other languages as appropriate).

---

## 🚀 How to Contribute

### 1. Fork and Clone
Fork the repository on GitHub and clone your fork locally:
```bash
git clone https://github.com/your-username/AshaKiran-Electronic-Health-Record-Management-System.git
```

### 2. Setup the Workspace
Refer to the installation steps in our [README.md](./README.md) to set up your backend Flask virtual environment and frontend Vite dev tools.

### 3. Create a Feature Branch
Create a descriptive branch for your changes:
```bash
git checkout -b feature/secure-token-persistence
```

### 4. Format & Validate
- Ensure your code compiles cleanly (`npm run build`).
- Verify the Flask backend boots without syntax errors.

### 5. Submit a Pull Request
Push your branch to your fork and open a Pull Request (PR) against the `main` branch. Provide a detailed summary of:
- What changes were made
- What problem they solve
- How you verified they do not break offline caching or data sync

---

Thank you for helping us empower ASHA health workers and transform rural healthcare!
