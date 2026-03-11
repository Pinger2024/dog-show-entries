import { createTRPCRouter, createCallerFactory } from './init';
import { showsRouter } from './routers/shows';
import { dogsRouter } from './routers/dogs';
import { entriesRouter } from './routers/entries';
import { usersRouter } from './routers/users';
import { organisationsRouter } from './routers/organisations';
import { breedsRouter } from './routers/breeds';
import { secretaryRouter } from './routers/secretary';
import { paymentsRouter } from './routers/payments';
import { ordersRouter } from './routers/orders';
import { devRouter } from './routers/dev';
import { feedbackRouter } from './routers/feedback';
import { subscriptionRouter } from './routers/subscription';
import { stewardRouter } from './routers/steward';
import { onboardingRouter } from './routers/onboarding';
import { invitationsRouter } from './routers/invitations';
import { adminRouter } from './routers/admin';
import { adminDashboardRouter } from './routers/admin-dashboard';
import { secretaryApplicationsRouter } from './routers/secretary-applications';
import { proRouter } from './routers/pro';
import { backlogRouter } from './routers/backlog';
import { timelineRouter } from './routers/timeline';
import { followsRouter } from './routers/follows';
import { printOrdersRouter } from './routers/print-orders';

export const appRouter = createTRPCRouter({
  shows: showsRouter,
  dogs: dogsRouter,
  entries: entriesRouter,
  users: usersRouter,
  organisations: organisationsRouter,
  breeds: breedsRouter,
  secretary: secretaryRouter,
  payments: paymentsRouter,
  orders: ordersRouter,
  dev: devRouter,
  feedback: feedbackRouter,
  subscription: subscriptionRouter,
  steward: stewardRouter,
  onboarding: onboardingRouter,
  invitations: invitationsRouter,
  admin: adminRouter,
  adminDashboard: adminDashboardRouter,
  applications: secretaryApplicationsRouter,
  pro: proRouter,
  backlog: backlogRouter,
  timeline: timelineRouter,
  follows: followsRouter,
  printOrders: printOrdersRouter,
});

export type AppRouter = typeof appRouter;

import type { inferRouterOutputs } from '@trpc/server';
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const createCaller = createCallerFactory(appRouter);
