import { getZeroAgent, getZeroDB } from '../../lib/server-utils';
import { subscriptionCategoryEnum } from '../../db/schema';
import { router, privateProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

export const subscriptionsRouter = router({
  list: privateProcedure
    .input(
      z.object({
        connectionId: z.string(),
        category: z.enum(subscriptionCategoryEnum.enumValues).optional(),
        isActive: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.sessionUser) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to view subscriptions',
        });
      }

      const db = await getZeroDB(ctx.sessionUser.id);

      return await db.listSubscriptions({
        userId: ctx.sessionUser.id,
        connectionId: input.connectionId,
        category: input.category,
        isActive: input.isActive,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  get: privateProcedure
    .input(
      z.object({
        subscriptionId: z.string(),
        connectionId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.sessionUser) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to view subscription details',
        });
      }

      const db = await getZeroDB(ctx.sessionUser.id);

      try {
        return await db.getSubscription(input.subscriptionId, ctx.sessionUser.id);
      } catch {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        });
      }
    }),

  unsubscribe: privateProcedure
    .input(
      z.object({
        subscriptionId: z.string(),
        connectionId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.sessionUser) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to unsubscribe',
        });
      }

      const db = await getZeroDB(ctx.sessionUser.id);

      try {
        return await db.unsubscribeFromEmail(input.subscriptionId, ctx.sessionUser.id);
      } catch {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        });
      }
    }),

  updatePreferences: privateProcedure
    .input(
      z.object({
        subscriptionId: z.string(),
        connectionId: z.string(),
        autoArchive: z.boolean().optional(),
        category: z.enum(subscriptionCategoryEnum.enumValues).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.sessionUser) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to update preferences',
        });
      }

      const db = await getZeroDB(ctx.sessionUser.id);

      return await db.updateSubscriptionPreferences({
        subscriptionId: input.subscriptionId,
        userId: ctx.sessionUser.id,
        autoArchive: input.autoArchive,
        category: input.category,
      });
    }),

  resubscribe: privateProcedure
    .input(
      z.object({
        subscriptionId: z.string(),
        connectionId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.sessionUser) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to resubscribe',
        });
      }

      const db = await getZeroDB(ctx.sessionUser.id);

      return await db.resubscribeToEmail(input.subscriptionId, ctx.sessionUser.id);
    }),

  stats: privateProcedure
    .input(
      z.object({
        connectionId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.sessionUser) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to view statistics',
        });
      }

      const db = await getZeroDB(ctx.sessionUser.id);

      return await db.getSubscriptionStats(ctx.sessionUser.id, input.connectionId);
    }),

  bulkUnsubscribe: privateProcedure
    .input(
      z.object({
        subscriptionIds: z.array(z.string()),
        connectionId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.sessionUser) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to bulk unsubscribe',
        });
      }

      const db = await getZeroDB(ctx.sessionUser.id);

      return await db.bulkUnsubscribeEmails(input.subscriptionIds, ctx.sessionUser.id);
    }),
});
