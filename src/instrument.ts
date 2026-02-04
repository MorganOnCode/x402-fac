import * as Sentry from '@sentry/node';

// Only initialize if DSN is provided
// This allows running without Sentry in development
export function initSentry(dsn: string | undefined, environment: string): void {
  if (!dsn) {
    console.log('Sentry DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: 1.0,
    // Capture unhandled promise rejections
    integrations: [Sentry.onUnhandledRejectionIntegration()],
  });

  console.log(`Sentry initialized for environment: ${environment}`);
}

// Re-export Sentry for use in error handler
export { Sentry };
