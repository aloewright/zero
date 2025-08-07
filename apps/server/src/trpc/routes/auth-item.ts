import { privateProcedure, router } from '../trpc';
import { and, desc, eq } from 'drizzle-orm';
import { authItem } from '../../db/schema';
import { createDb } from '../../db';
import { env } from '../../env';
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
      const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
      const { connectionId, type, limit, includeExpired } = input;
      const conditions = [eq(authItem.userId, ctx.sessionUser.id)];
      if (connectionId) conditions.push(eq(authItem.connectionId, connectionId));
      if (type) conditions.push(eq(authItem.type, type));
      // if (!includeExpired) conditions.push(eq(authItem.type, 'otp'));

      try {
        const items = await db
          .select()
          .from(authItem)
          .where(and(...conditions))
          .orderBy(desc(authItem.receivedAt))
          .limit(limit);
        return { items };
      } finally {
        await conn.end();
      }
    }),

  markConsumed: privateProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
      try {
        const [updated] = await db
          .update(authItem)
          .set({ isConsumed: true, updatedAt: new Date() })
          .where(and(eq(authItem.id, input.id), eq(authItem.userId, ctx.sessionUser.id)))
          .returning();
        return { success: !!updated };
      } finally {
        await conn.end();
      }
    }),

  delete: privateProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
    try {
      const [deleted] = await db
        .delete(authItem)
        .where(and(eq(authItem.id, input.id), eq(authItem.userId, ctx.sessionUser.id)))
        .returning();
      return { success: !!deleted };
    } finally {
      await conn.end();
    }
  }),
});
