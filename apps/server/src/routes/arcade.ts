import type { HonoContext } from '../ctx';
import { createAuth } from '../lib/auth';
import Arcade from '@arcadeai/arcadejs';
import { env } from '../env';
import { Hono } from 'hono';

export const arcadeRouter = new Hono<HonoContext>()
  .use('*', async (c, next) => {
    // const { sessionUser } = c.var;
    // c.set(
    //   'customerData',
    //   !sessionUser
    //     ? null
    //     : {
    //         customerId: sessionUser.id,
    //         customerData: {
    //           name: sessionUser.name,
    //           email: sessionUser.email,
    //         },
    //       },
    // );
    await next();
  })
  .get('/verify-user', async (c) => {
    try {
      const flowId = c.req.query('flow_id');

      if (!flowId) {
        console.error('[Arcade Verify User] Missing flow_id parameter');
        return c.json({ error: 'Missing required parameter: flow_id' }, 400);
      }

      const auth = createAuth();
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      if (!session || !session.user) {
        console.error('[Arcade Verify User] No authenticated session found');
        return c.json({ error: 'Authentication required' }, 401);
      }

      if (!env.ARCADE_API_KEY) {
        console.error('[Arcade Verify User] ARCADE_API_KEY not configured');
        return c.json({ error: 'Arcade integration not configured' }, 500);
      }

      const arcade = new Arcade({ apiKey: env.ARCADE_API_KEY });

      try {
        const result = await arcade.auth.confirmUser({
          flow_id: flowId,
          user_id: session.user.id,
        });

        console.log('[Arcade Verify User] Successfully verified user', {
          userId: session.user.id,
          authId: result.auth_id,
          user: result,
        });

        console.log('[Arcade Verify User] waiting for completion');

        const authResponse = await arcade.auth.waitForCompletion(result.auth_id);

        console.log('[Arcade Verify User] authResponse', authResponse);

        if (authResponse.status === 'completed') {
          // const { mutateAsync: createConnection } =
          // trpc.arcadeConnections.createConnection.mutationOptions();

          const toolkit = c.req.query('toolkit');

          const params = new URLSearchParams();
          params.set('arcade_auth_success', 'true');
          if (toolkit) {
            params.set('toolkit', toolkit);
          }
          params.set('auth_id', result.auth_id);

          const redirectUrl = `${env.VITE_PUBLIC_APP_URL}/settings/connections?${params.toString()}`;
          return c.redirect(redirectUrl);
        } else {
          console.error('[Arcade Verify User] Authorization not completed', {
            status: authResponse.status,
          });

          return c.redirect(
            `${env.VITE_PUBLIC_APP_URL}/settings/connections?error=arcade_auth_incomplete`,
          );
        }
      } catch (error) {
        console.error('[Arcade Verify User] Error confirming user with Arcade:', error);

        if (error && typeof error === 'object' && 'status' in error) {
          const statusCode = (error as { status: number }).status;
          const errorData = (error as { status: number; data?: unknown }).data;

          console.error('[Arcade Verify User] Arcade API error details:', {
            statusCode,
            errorData,
          });

          return c.redirect(
            `${env.VITE_PUBLIC_APP_URL}/settings/connections?error=arcade_verification_failed`,
          );
        }

        return c.redirect(
          `${env.VITE_PUBLIC_APP_URL}/settings/connections?error=arcade_auth_error`,
        );
      }
    } catch (error) {
      console.error('[Arcade Verify User] Unexpected error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  })
  .get('/callback', async (c) => {
    const success = c.req.query('success');
    const error = c.req.query('error');
    const toolkit = c.req.query('toolkit');

    if (error) {
      console.error('Arcade authorization error:', error);
      return c.redirect(`${env.VITE_PUBLIC_APP_URL}/settings/connections?error=arcade_auth_failed`);
    }

    const params = new URLSearchParams();
    if (success === 'true' && toolkit) {
      params.set('arcade_connected', toolkit);
    }

    return c.redirect(`${env.VITE_PUBLIC_APP_URL}/settings/connections?${params.toString()}`);
  });
