# Antler Ops Portal (Refactored)

This repository contains a refactored version of the **Antler Ops Portal** built with React, TypeScript and Supabase.  The goal of the refactor is to improve maintainability, reliability and accessibility without breaking the existing production application.  Key changes include:

* **Modular architecture** – The monolithic `App.tsx` has been decomposed into smaller, focused components such as `AccountList`, `AccountDetails`, `ManagerDashboard`, `TaskManager` and `LogsPanel`.  Each component encapsulates its own markup, state and styling, making the code easier to read and test.
* **React Query for data fetching** – Server‑state (e.g. accounts and tasks) is loaded through reusable hooks powered by [TanStack Query](https://tanstack.com/query).  This gives automatic caching, background updates and built‑in loading/error states.
* **Improved error handling and loading UI** – Rather than a single global loading flag, the app distinguishes between initial load and background refresh.  Skeleton placeholders and contextual error messages guide the user through fetch failures.
* **CSS Modules for styling** – Component‑scoped CSS modules prevent class name clashes and encourage reuse.  Each UI module has a corresponding `.module.css` file defining its visual appearance.
* **Accessibility enhancements** – Semantic HTML tags, labelled inputs, keyboard‑focusable buttons and ARIA attributes make the interface usable with assistive technologies.

## Prerequisites

* [Node.js](https://nodejs.org/) 18 or later
* A Supabase project with the required tables (`accounts`, `tasks`, `logs` etc.) and [API keys](https://supabase.com/docs/guides/getting-started/setup) stored in environment variables (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).  See `.env.example` for guidance.

## Getting Started

1. **Install dependencies**:

   ```sh
   npm install
   ```

2. **Create an `.env` file** in the project root and set your Supabase credentials:

   ```sh
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Run the development server**:

   ```sh
   npm run dev
   ```

   The app will be available at `http://localhost:5173` by default.

4. **Build for production**:

   ```sh
   npm run build
   ```

   The compiled assets will be output to the `dist/` directory.

## Project Structure

```
antler-ops-refactor/
│  README.md           – This file
│  package.json        – Project metadata and scripts
│  tsconfig.json       – TypeScript configuration (generated automatically by Vite)
└─ src/
   ├─ App.tsx          – Top‑level component handling routing and layout
   ├─ main.tsx         – Entry point bootstrapping React and the query client
   ├─ types.ts         – Shared type definitions for accounts, tasks and logs
   ├─ hooks/           – Custom hooks for data fetching (e.g. `useAccounts.ts`)
   ├─ lib/             – Utility libraries (e.g. `supabase.ts` and `withSupabaseTimeout.ts`)
   └─ components/
      ├─ AccountList.tsx
      ├─ AccountDetails.tsx
      ├─ ManagerDashboard.tsx
      ├─ TaskManager.tsx
      ├─ LogsPanel.tsx
      └─ (and corresponding `.module.css` files)
```

## Running Tests

While not yet fully implemented, the project is structured to facilitate testing with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).  Tests should be placed under `src/__tests__/` and focus on user interactions rather than implementation details.  A sample GitHub Actions workflow (`.github/workflows/tests.yml`) can be added to run the tests automatically on pushes and pull requests.

## Contributing

Feel free to open issues or submit pull requests for further improvements.  This refactored version is intended as a starting point for future enhancements such as unit tests, continuous integration, additional hooks, or a design system.
