/** Dispatched on window when the backend answers again after being slow or unreachable. */
export const BACKEND_UP_EVENT = 'zoro:backend-up';

/** True when the web app runs on the developer's own machine, where the daemon is started by hand. */
export const isLocalApp = () => typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

/** What to do when the daemon cannot be reached, worded for where the app is running. */
export const daemonDownHint = () =>
  isLocalApp()
    ? 'Start it with `pnpm dev`.'
    : 'The hosted backend may be starting after a period of inactivity, which takes about a minute. This page keeps retrying on its own.';
