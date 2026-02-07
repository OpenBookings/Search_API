import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

export interface Database {
  properties: any;
  bookings: any;
}

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  }),
});
