import postgres from "postgres";

export type Sql = postgres.Sql<{}>;
export type Tx = postgres.TransactionSql<{}>;
export type Db = Sql | Tx;

const g = globalThis as unknown as { __folioSql?: Sql };

export function makeSql(max = 10): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
    types: {
      // ids and counts fit comfortably in a JS number
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  }) as unknown as Sql;
}

export const sql: Sql = g.__folioSql ?? (g.__folioSql = makeSql(Number(process.env.DB_POOL_SIZE || 10)));

export function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  return sql.begin(fn as (t: Tx) => Promise<T>) as Promise<T>;
}
