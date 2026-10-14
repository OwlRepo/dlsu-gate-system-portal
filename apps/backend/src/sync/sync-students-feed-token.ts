export type FeedMode = 'i' | 'd';

export interface FeedPosition {
  mode: FeedMode;
  /** PostgreSQL's own text for the sort key, microseconds intact. */
  key: string;
  id: number;
}

// Calendar-impossible dates such as Feb 30 pass this check; PostgreSQL rejects
// the cast and the service turns that into a 400.
const RAW_TOKEN =
  /^([id])\|(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]) (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?)\|(\d{1,10})$/;
const MAX_INT4 = 2147483647;

// The cursor is the database's text for the value, not a JS Date: PostgreSQL
// keeps microseconds, a Date keeps milliseconds, and a bulk sync stamps many
// rows with one identical microsecond value. A millisecond cursor would sort
// below those rows and the next page would restart at the beginning of them.
export const encodeFeedToken = ({ mode, key, id }: FeedPosition): string =>
  Buffer.from(`${mode}|${key}|${id}`, 'utf8').toString('base64url');

export const decodeFeedToken = (token: string): FeedPosition | null => {
  const match = RAW_TOKEN.exec(
    Buffer.from(token, 'base64url').toString('utf8'),
  );
  if (!match) return null;

  const id = Number(match[3]);
  if (id > MAX_INT4) return null;

  return { mode: match[1] as FeedMode, key: match[2], id };
};
