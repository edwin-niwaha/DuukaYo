export interface Database {
  execAsync(sql: string): Promise<void>;
  runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown>;
  getAllAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T[]>;
}
export type Payload = { client_id: string; [key: string]: unknown };
export type QueueRow = {
  id: string;
  scope: string;
  payload: string;
  state: "pending" | "synchronized" | "needs-review";
  error: string;
  response: string | null;
  created_at: string;
};
export const schema: string;
export function initialize(db: Database): Promise<void>;
export function enqueue(
  db: Database,
  scope: string,
  payload: Payload,
): Promise<void>;
export function rows(db: Database, scope: string): Promise<QueueRow[]>;
export function synchronize(
  db: Database,
  scope: string,
  upload: (payload: Payload) => Promise<{ review_reasons?: string[] }>,
): Promise<void>;
export function retry(db: Database, scope: string, id: string): Promise<void>;
