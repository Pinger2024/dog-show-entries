import { createTRPCRouter } from '../init';
import { publicProcedure } from '../procedures';
import { breeds } from '@/server/db/schema';

export const breedsRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.breeds.findMany({
      with: {
        group: true,
      },
      orderBy: (breeds, { asc }) => [asc(breeds.name)],
    });
  }),
});
