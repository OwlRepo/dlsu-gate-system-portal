/**
 * The DASMA live scenario matrix.
 *
 * Every row here exists to prove one specific behaviour of the sync against the
 * real MSSQL source, the real BioStar instance and the real PostgreSQL — not
 * against a fake. All three remote endpoints are test environments, which is
 * what makes seeding them the right verification method rather than a risk.
 *
 * IDs are all `999000xxxx`: numeric, exactly 10 characters, impossible to
 * confuse with the 34 pre-existing sandbox rows, and removable in one
 * `DELETE ... WHERE ID LIKE '999000%'`.
 */

/** Every seeded id starts with this, and nothing else in the sandbox does. */
export const SEED_PREFIX = '999000';

export interface SourceRow {
  ID: string;
  LastName: string | null;
  FirstName: string | null;
  MiddleName: string | null;
  Suffix: string | null;
  Group: string | null;
  /** Campus_Entry: 1 -> 'Y' (admitted), 0 -> 'N' (denied). */
  Status: boolean | null;
  Remarks: string | null;
  IsArchived: boolean | null;
}

export interface Scenario {
  id: string;
  /** S-01 … S-23, matching the plan. */
  tag: string;
  proves: string;
  row?: SourceRow;
}

const r = (
  ID: string,
  LastName: string | null,
  FirstName: string | null,
  over: Partial<SourceRow> = {},
): SourceRow => ({
  ID,
  LastName,
  FirstName,
  MiddleName: null,
  Suffix: null,
  Group: 'STUDENT',
  Status: true,
  Remarks: null,
  IsArchived: false,
  ...over,
});

/** A remark of exactly 100 characters — the `varchar(100)` boundary. */
export const REMARK_100 = 'X'.repeat(100);

/**
 * A remark carrying every character that breaks naive CSV writing: a comma, a
 * double quote, and an embedded newline. If this survives a real `csv_import`
 * the RFC-4180 quoting is genuinely correct.
 */
export const REMARK_NASTY = 'Flagged: late, "again"\nsecond line';

/** Phase 1 — the state the sandbox is seeded into before run A. */
export const PHASE_1: Scenario[] = [
  {
    id: '9990000001',
    tag: 'S-01',
    proves: 'baseline active row; later the only row that changes in run B',
    row: r('9990000001', 'Alpha', 'One'),
  },
  {
    id: '9990000002',
    tag: 'S-02',
    proves: 'remark set now, removed in phase 2 — the Remarks Issue tracker',
    row: r('9990000002', 'Bravo', 'Two', {
      Group: 'EMPLOYEE',
      Remarks: 'Watchlist',
    }),
  },
  {
    id: '9990000003',
    tag: 'S-03',
    proves: 'whitespace-only remark is treated as no remark at all',
    row: r('9990000003', 'Charlie', 'Three', { Remarks: '   ' }),
  },
  {
    id: '9990000004',
    tag: 'S-04',
    proves: 'comma, quote and newline survive a real csv_import',
    row: r('9990000004', 'Delta', 'Four', { Remarks: REMARK_NASTY }),
  },
  {
    id: '9990000005',
    tag: 'S-05',
    proves: 'inactive row exports an already-expired window, then reactivates',
    row: r('9990000005', 'Echo', 'Five', { Group: 'AGENCY', Status: false }),
  },
  {
    id: '9990000006',
    tag: 'S-06',
    proves: 'archived rows never reach the CSV',
    row: r('9990000006', 'Foxtrot', 'Six', { IsArchived: true }),
  },
  {
    id: '9990000007',
    tag: 'S-07',
    proves: 'punctuation and diacritics are stripped rather than quoted',
    row: r('9990000007', "O'Golf-Nuñez", 'Seven', { Suffix: 'Jr.' }),
  },
  {
    id: '9990000008',
    tag: 'S-08',
    proves: 'a nameless row is skipped, never shipped to a gate',
    row: r('9990000008', '', ''),
  },
  {
    id: '9990000009',
    tag: 'S-09',
    proves: 'an unmapped Group falls back to null without breaking the row',
    row: r('9990000009', 'Hotel', 'Nine', { Group: 'CONTRACTOR' }),
  },
  {
    id: '9990000010',
    tag: 'S-10',
    proves: 'a remark at the varchar(100) boundary round-trips intact',
    row: r('9990000010', 'India', 'Ten', { Remarks: REMARK_100 }),
  },
  {
    id: '9990000011',
    tag: 'S-11',
    proves: 'the same ID twice in one batch does not drop the whole chunk',
    row: r('9990000011', 'Juliet', 'Eleven'),
  },
  {
    id: '9990000012',
    tag: 'S-12',
    proves: 'a row that vanishes from the source gets archived, not deleted',
    row: r('9990000012', 'Kilo', 'Twelve', { Group: 'EMPLOYEE' }),
  },
  {
    id: '9990000013',
    tag: 'S-13',
    proves: 'an inactive row still carries its remark',
    row: r('9990000013', 'Lima', 'Thirteen', {
      Status: false,
      Remarks: 'Old note',
    }),
  },
  {
    id: '9990000014',
    tag: 'S-14',
    proves:
      'a card held only in BioStar is resolved into the CSV and persisted',
    row: r('9990000014', 'Mike', 'Fourteen'),
  },
];

/** The duplicate half of S-11 — same ID, inserted as a second physical row. */
export const S11_DUPLICATE: SourceRow = r('9990000011', 'Juliet', 'Eleven-Dup');

/** Ids seeded straight into BioStar, with no source row behind them. */
export const BIOSTAR_ONLY = {
  /** S-15 — BioStar has them, the source does not. Inbound create. */
  inboundCreate: '9990000020',
  /** S-16 — card + remark, then an import with both cells blank. */
  blankCellProbe: '9990000022',
  /** S-17 — BioStar holds a remark PostgreSQL does not. The sweep's job. */
  staleRemark: '9990000023',
  /** S-18 — neither photo nor card, so the inbound pull must never fetch it. */
  noPhotoNoCard: '9990000024',
};

/**
 * S-21 — an id that exists in PostgreSQL and NOWHERE else, so BioStar answers
 * 400 for it. Today that leaves `remarks_checked_at` null forever.
 */
export const PG_ONLY_UNKNOWN_TO_BIOSTAR = '9990000099';

/** The card handed to S-14 and S-16 in BioStar. */
export const SEED_CARD_S14 = '7710000014';
export const SEED_CARD_S16 = '7710000016';
