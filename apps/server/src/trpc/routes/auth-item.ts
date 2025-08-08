import { getZeroDB } from '../../lib/server-utils';
import { privateProcedure, router } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

export const authItemRouter = router({
  list: privateProcedure
    .input(
      z.object({
        connectionId: z.string().optional(),
        type: z.enum(['otp', 'ml']).optional(),
        limit: z.number().optional().default(50),
        includeExpired: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { connectionId, type, limit, includeExpired } = input;
      const db = await getZeroDB(ctx.sessionUser.id);

      try {
        const items = await db.findAuthItems(
          connectionId,
          type,
          limit,
          includeExpired,
          ctx.sessionUser.id,
        );
        return { items };
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
    }),

  markConsumed: privateProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getZeroDB(ctx.sessionUser.id);
      try {
        const success = await db.markAuthItemConsumed(ctx.sessionUser.id, input.id);
        return { success };
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
    }),

  delete: privateProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const db = await getZeroDB(ctx.sessionUser.id);
    try {
      const success = await db.deleteAuthItem(ctx.sessionUser.id, input.id);
      return { success };
    } catch {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    }
  }),
});
