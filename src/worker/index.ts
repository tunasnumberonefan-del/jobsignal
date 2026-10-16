import { assertConfig, type Env } from './env';
import { base, createApp, csrf, errorHandler, identity } from './app';
import { notFound } from './lib/errors';
import { log } from './lib/log';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { billingRoutes } from './routes/billing';
import { meRoutes } from './routes/me';
import { publicRoutes } from './routes/public';
import { seoRoutes } from './routes/seo';
import { runScheduled } from './services/monitoring';

export function buildApp() {
  const app = createApp();
  app.use('*', async (c, next) => {
    assertConfig(c.env);
    return next();
  });
  app.use('*', base);
  app.use('/api/*', csrf);
  app.use('*', identity);
  app.route('/', publicRoutes);
  app.route('/', authRoutes);
  app.route('/', billingRoutes);
  app.route('/', meRoutes);
  app.route('/', adminRoutes);
  app.route('/', seoRoutes);
  app.all('/api/*', () => {
    throw notFound('No such API endpoint.');
  });
  app.onError(errorHandler);
  return app;
}

const app = buildApp();

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runScheduled(env, controller.cron).catch((e: unknown) => log('error', 'scheduled_failed', { cron: controller.cron, error: String(e) })),
    );
  },
} satisfies ExportedHandler<Env>;
