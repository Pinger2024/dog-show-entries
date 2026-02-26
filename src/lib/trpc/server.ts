import 'server-only';
import { createTRPCContext } from '@/server/trpc/init';
import { createCaller } from '@/server/trpc/router';
import { headers } from 'next/headers';
import { cache } from 'react';

const createContext = cache(async () => {
  const heads = await headers();
  return createTRPCContext({ headers: heads });
});

export const api = cache(async () => {
  const ctx = await createContext();
  return createCaller(ctx);
});
