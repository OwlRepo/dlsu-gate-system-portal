import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import axios from 'axios';

import { BiostarApiService } from './biostar-api.service';

jest.mock('axios');

/**
 * Unit coverage for the one BioStar call that WRITES a user field.
 *
 * Clearing a remark is the only per-user write this system makes, and it is
 * the write we cannot observe against a real server from here. So everything
 * that IS observable — the request shape, and every way the server can say
 * "no" — is pinned here instead.
 *
 * The `{ custom_field: { name }, item }` element shape is not invented: it is
 * what the production dashboards read off the live server
 * (`apps/portal-web/src/app/dashboard/dashboard.tsx`), matching on
 * `field.custom_field.name === "Remarks"`.
 */
describe('BiostarApiService.clearUserCustomField', () => {
  let service: BiostarApiService;

  const CONFIG: Record<string, string> = {
    BIOSTAR_API_BASE_URL: 'https://biostar.fake',
    BIOSTAR_API_LOGIN_ID: 'fake',
    BIOSTAR_API_PASSWORD: 'fake',
  };

  /** A user detail payload with the three custom fields Dasma actually uses. */
  const userWithFields = (remark: string | null) => ({
    data: {
      User: {
        user_id: 'ZZTEST001',
        name: 'Test User',
        user_custom_fields: [
          { custom_field: { name: 'Lived Name' }, item: 'Johnny' },
          { custom_field: { name: 'Remarks' }, item: remark },
          { custom_field: { name: 'Gate' }, item: 'Main' },
        ],
      },
    },
  });

  /** The body handed to the single PUT the method makes. */
  const putBody = () => (axios.put as jest.Mock).mock.calls[0][1];

  beforeEach(async () => {
    jest.clearAllMocks();
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn(() => false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BiostarApiService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => CONFIG[key]) },
        },
      ],
    }).compile();

    service = module.get(BiostarApiService);
  });

  const clear = () =>
    service.clearUserCustomField('ZZTEST001', 'Remarks', 't0ken', 's3ss10n');

  // ------------------------------------------------------------------
  // Happy path
  // ------------------------------------------------------------------
  it('blanks only the target field and hands every other one back untouched', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields('Owes fee'));
    (axios.put as jest.Mock).mockResolvedValue({ data: {} });

    await expect(clear()).resolves.toBe(true);

    expect(putBody()).toEqual({
      User: {
        user_custom_fields: [
          { custom_field: { name: 'Lived Name' }, item: 'Johnny' },
          { custom_field: { name: 'Remarks' }, item: '' },
          { custom_field: { name: 'Gate' }, item: 'Main' },
        ],
      },
    });
  });

  it('PUTs to the per-user endpoint', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields('Owes fee'));
    (axios.put as jest.Mock).mockResolvedValue({ data: {} });

    await clear();

    expect((axios.put as jest.Mock).mock.calls[0][0]).toBe(
      'https://biostar.fake/api/users/ZZTEST001',
    );
  });

  // ------------------------------------------------------------------
  // Error cases — the server said no
  // ------------------------------------------------------------------
  // THE REGRESSION TEST. BioStar answers HTTP 200 with a non-zero
  // Response.code when it refuses a write. The old code discarded the
  // response entirely and returned true, so the caller cleared
  // `remarks_clear_pending` on a write that never landed — permanent drift,
  // silently.
  it('reports failure when the PUT returns 200 with a non-zero Response.code', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields('Owes fee'));
    (axios.put as jest.Mock).mockResolvedValue({
      data: { Response: { code: '1', message: 'Partially successful' } },
    });

    await expect(clear()).resolves.toBe(false);
  });

  it('reports failure for the documented all-failed code 8', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields('Owes fee'));
    (axios.put as jest.Mock).mockResolvedValue({
      data: { Response: { code: '8' } },
    });

    await expect(clear()).resolves.toBe(false);
  });

  it('returns false when the PUT throws', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields('Owes fee'));
    (axios.put as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));

    await expect(clear()).resolves.toBe(false);
  });

  it('returns false when the user cannot be read', async () => {
    (axios.get as jest.Mock).mockRejectedValue(new Error('404'));

    await expect(clear()).resolves.toBe(false);
    expect(axios.put).not.toHaveBeenCalled();
  });

  // What BioStar sends for an HTTP error, as axios hands it over.
  const httpFailure = (status: number, code?: string) => {
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn(() => true);
    return Object.assign(
      new Error(`Request failed with status code ${status}`),
      {
        isAxiosError: true,
        response: {
          status,
          data: code === undefined ? {} : { Response: { code } },
        },
      },
    );
  };

  it('error: still fails on a 400 that is not "user not found"', async () => {
    (axios.get as jest.Mock).mockRejectedValue(httpFailure(400, '1'));

    await expect(clear()).resolves.toBe(false);
  });

  it('error: still fails when BioStar answers 500', async () => {
    (axios.get as jest.Mock).mockRejectedValue(httpFailure(500));

    await expect(clear()).resolves.toBe(false);
  });

  it('edge: counts a 404 for the user as nothing left to clear', async () => {
    (axios.get as jest.Mock).mockRejectedValue(httpFailure(404));

    await expect(clear()).resolves.toBe(true);
    expect(axios.put).not.toHaveBeenCalled();
  });

  // The user can leave BioStar between the GET and the PUT; the PUT then
  // gets the same "not found" answer, and the clear is still done.
  it('edge: counts "user not found" on the PUT as nothing left to clear', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields('Owes fee'));
    (axios.put as jest.Mock).mockRejectedValue(httpFailure(400, '201'));

    await expect(clear()).resolves.toBe(true);
  });

  // Measured 2026-09-25: archived student 91000006 is never sent to BioStar,
  // so GET answers 400 with Response.code "201" ("User can not be found with
  // id"), and the clear was retried as a failure on every sync.
  it('regression: counts "user not found" (400, code 201) as nothing left to clear', async () => {
    (axios.get as jest.Mock).mockRejectedValue(httpFailure(400, '201'));

    await expect(clear()).resolves.toBe(true);
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('returns false when user_custom_fields is not an array', async () => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: { User: { user_id: 'ZZTEST001' } },
    });

    await expect(clear()).resolves.toBe(false);
    expect(axios.put).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // Rare / boundary — the shape of "success" is not nailed down by Suprema
  // ------------------------------------------------------------------
  // Suprema's own JSON examples show `"code": "0"` as a string, but our two
  // in-repo fixtures disagree (the fake BioStar server uses a number). No real
  // response has ever been captured, so success must survive BOTH.
  it('treats a numeric zero Response.code as success', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields('Owes fee'));
    (axios.put as jest.Mock).mockResolvedValue({
      data: { Response: { code: 0 } },
    });

    await expect(clear()).resolves.toBe(true);
  });

  it('treats a string zero Response.code as success', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields('Owes fee'));
    (axios.put as jest.Mock).mockResolvedValue({
      data: { Response: { code: '0' } },
    });

    await expect(clear()).resolves.toBe(true);
  });

  // A 2xx with no envelope at all must not be read as a refusal — requiring a
  // code would break the method against a server that simply does not send one.
  it('treats a 2xx with no Response envelope as success', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields('Owes fee'));
    (axios.put as jest.Mock).mockResolvedValue({ data: {} });

    await expect(clear()).resolves.toBe(true);
  });

  it('accepts a detail payload that is not wrapped in User', async () => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: userWithFields('Owes fee').data.User,
    });
    (axios.put as jest.Mock).mockResolvedValue({ data: {} });

    await expect(clear()).resolves.toBe(true);
  });

  // ------------------------------------------------------------------
  // Edge — nothing to do
  // ------------------------------------------------------------------
  it('does not PUT when the field is already blank', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields(''));

    await expect(clear()).resolves.toBe(true);
    expect(axios.put).not.toHaveBeenCalled();
  });

  // Not a parse failure: the shape is confirmed against the live server, so a
  // missing Remarks entry genuinely means this user has no remark to clear.
  // The caller counts these separately so they cannot masquerade as clears.
  it('does not PUT when the user has no such custom field', async () => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: {
        User: {
          user_custom_fields: [
            { custom_field: { name: 'Gate' }, item: 'Main' },
          ],
        },
      },
    });

    await expect(clear()).resolves.toBe(true);
    expect(axios.put).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // Performance-relevant
  // ------------------------------------------------------------------
  it('makes exactly one GET and at most one PUT per user', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields('Owes fee'));
    (axios.put as jest.Mock).mockResolvedValue({ data: {} });

    await clear();

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.put).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------
  // Edge — the shape a REAL cleared field comes back in
  // ------------------------------------------------------------------

  /**
   * Read off the live server on 2026-09-10 after a successful clear: BioStar
   * drops the `item` key entirely rather than storing an empty string, and
   * adds `size: "0"`. `item === ''` therefore never matches a field this code
   * itself cleared, so every later run PUT again for no reason.
   */
  it('treats a Remarks entry with no item key at all as already blank', async () => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: {
        User: {
          user_id: 'ZZTEST001',
          user_custom_fields: [
            {
              user_id: { user_id: 'ZZTEST001', name: 'Test User' },
              custom_field: { id: '1', name: 'Remarks', type: '0', order: '1' },
              size: '0',
            },
          ],
        },
      },
    });

    await expect(clear()).resolves.toBe(true);
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('treats a null item as already blank', async () => {
    (axios.get as jest.Mock).mockResolvedValue(userWithFields(null));

    await expect(clear()).resolves.toBe(true);
    expect(axios.put).not.toHaveBeenCalled();
  });
});

/**
 * The detail fetch has to say WHY it came back empty.
 *
 * `fetchBiostarUserDetailWithRetry` answers `null` both for "BioStar has no
 * such user" and for "BioStar could not be reached", and two callers need to
 * tell those apart:
 *
 *   - the remark sweep, which must stamp a user BioStar does not have (else it
 *     re-checks them forever), but must NOT stamp one it merely failed to reach;
 *   - the CSN resolver, which must let a brand-new student through with an
 *     empty `csn` (there is no card to blank), but must hold back a row when
 *     BioStar is simply unreachable.
 */
describe('BiostarApiService.fetchBiostarUserDetail', () => {
  let service: BiostarApiService;

  const CONFIG: Record<string, string> = {
    BIOSTAR_API_BASE_URL: 'https://biostar.fake',
    BIOSTAR_API_LOGIN_ID: 'fake',
    BIOSTAR_API_PASSWORD: 'fake',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BiostarApiService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => CONFIG[key]) },
        },
      ],
    }).compile();
    service = module.get(BiostarApiService);
  });

  const axiosError = (status: number | null) => {
    const err = Object.assign(new Error('boom'), {
      isAxiosError: true,
      response: status == null ? undefined : { status },
      code: status == null ? 'ETIMEDOUT' : undefined,
    });
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn(() => true);
    return err;
  };

  const fetch = () =>
    service.fetchBiostarUserDetail('ZZTEST001', 't0ken', 's3ss10n', 1);

  it('returns the user and status 200 when BioStar has them', async () => {
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn(() => false);
    (axios.get as jest.Mock).mockResolvedValue({
      data: { User: { user_id: 'ZZTEST001', name: 'Test User' } },
    });

    await expect(fetch()).resolves.toEqual({
      detail: { user_id: 'ZZTEST001', name: 'Test User' },
      status: 200,
      definitive: true,
    });
  });

  it.each([400, 404])(
    'reports a %s as definitive — BioStar genuinely has no such user',
    async (status) => {
      (axios.get as jest.Mock).mockRejectedValue(axiosError(status));

      await expect(fetch()).resolves.toEqual({
        detail: null,
        status,
        definitive: true,
      });
    },
  );

  it.each([500, 502, 429])(
    'reports a %s as NOT definitive — the answer is unknown, not "absent"',
    async (status) => {
      (axios.get as jest.Mock).mockRejectedValue(axiosError(status));

      await expect(fetch()).resolves.toEqual({
        detail: null,
        status,
        definitive: false,
      });
    },
  );

  it('reports a timeout as not definitive', async () => {
    (axios.get as jest.Mock).mockRejectedValue(axiosError(null));

    await expect(fetch()).resolves.toEqual({
      detail: null,
      status: null,
      definitive: false,
    });
  });

  it('keeps the old null-returning wrapper working for existing callers', async () => {
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn(() => false);
    (axios.get as jest.Mock).mockResolvedValue({
      data: { User: { user_id: 'ZZTEST001' } },
    });

    await expect(
      service.fetchBiostarUserDetailWithRetry(
        'ZZTEST001',
        't0ken',
        's3ss10n',
        1,
      ),
    ).resolves.toEqual({ user_id: 'ZZTEST001' });
  });
});

describe('BiostarApiService — quiet, list-based lookups', () => {
  let service: BiostarApiService;

  const CONFIG: Record<string, string> = {
    BIOSTAR_API_BASE_URL: 'https://biostar.fake',
    BIOSTAR_API_LOGIN_ID: 'fake',
    BIOSTAR_API_PASSWORD: 'fake',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BiostarApiService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => CONFIG[key]) },
        },
      ],
    }).compile();
    service = module.get(BiostarApiService);
  });

  afterEach(() => jest.restoreAllMocks());

  const httpError = (status: number) => {
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn(() => true);
    return Object.assign(
      new Error(`Request failed with status code ${status}`),
      { isAxiosError: true, response: { status } },
    );
  };
  const page = (total: number, rows: Record<string, unknown>[]) => ({
    data: { UserCollection: { total: String(total), rows } },
  });

  it('error: returns null when a page of the user list cannot be read', async () => {
    (axios.get as jest.Mock).mockRejectedValueOnce(httpError(500));

    await expect(
      service.listUserCardCounts('t0ken', 's3ss10n'),
    ).resolves.toBeNull();
  });

  it('error: logs one line, not two, for a detail failure it cannot explain', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    (axios.get as jest.Mock).mockRejectedValue(httpError(500));

    await service.fetchBiostarUserDetail('ZZTEST001', 't0ken', 's3ss10n', 1);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toHaveLength(1);
  });

  it('edge: keeps what it read, marked incomplete, when BioStar lists fewer users than it reports', async () => {
    (axios.get as jest.Mock).mockResolvedValueOnce(
      page(3, [
        { user_id: 'A', card_count: '0' },
        { user_id: 'B', card_count: '1' },
      ]),
    );

    const directory = await service.listUserCardCounts('t0ken', 's3ss10n');

    expect(directory?.complete).toBe(false);
    expect([...(directory?.counts ?? [])]).toEqual([
      ['A', 0],
      ['B', 1],
    ]);
  });

  // 20,000 new students used to print 40,000 WARN lines per sync: "not in
  // BioStar yet" is the normal answer for everyone being enrolled.
  it('regression: says nothing when BioStar does not hold the user (400)', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    (axios.get as jest.Mock).mockRejectedValue(httpError(400));

    await expect(
      service.fetchBiostarUserDetail('ZZTEST001', 't0ken', 's3ss10n', 3),
    ).resolves.toMatchObject({ definitive: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it('happy: maps every listed user to their card count across pages', async () => {
    const first = Array.from({ length: 500 }, (_, i) => ({
      user_id: String(i),
      card_count: '0',
    }));
    (axios.get as jest.Mock)
      .mockResolvedValueOnce(page(501, first))
      .mockResolvedValueOnce(
        page(501, [{ user_id: '91200000', card_count: '2' }]),
      );

    const directory = await service.listUserCardCounts('t0ken', 's3ss10n');

    expect(directory?.complete).toBe(true);
    expect(directory?.counts.size).toBe(501);
    expect(directory?.counts.get('91200000')).toBe(2);
    expect(directory?.counts.get('0')).toBe(0);
    expect((axios.get as jest.Mock).mock.calls[1][1].params).toMatchObject({
      limit: 500,
      offset: 500,
    });
  });
});

describe('BiostarApiService.listAuditPhotoChanges', () => {
  type AuditReader = {
    listAuditPhotoChanges(
      token: string,
      sessionId: string,
      since: Date,
      until: Date,
    ): Promise<Set<string> | null>;
  };
  let reader: AuditReader;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BiostarApiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string) =>
                ({
                  BIOSTAR_API_BASE_URL: 'https://biostar.fake',
                  BIOSTAR_API_LOGIN_ID: 'fake',
                  BIOSTAR_API_PASSWORD: 'fake',
                })[key],
            ),
          },
        },
      ],
    }).compile();
    reader = module.get(BiostarApiService) as unknown as AuditReader;
  });

  const since = new Date('2026-09-23T04:00:00.000Z');
  const until = new Date('2026-09-23T05:00:00.000Z');
  const auditPage = (rows: Record<string, unknown>[]) => ({
    data: { AuditCollection: { rows } },
  });

  it('error: returns null when the audit log cannot be read', async () => {
    (axios.post as jest.Mock).mockRejectedValueOnce(
      new Error('socket hang up'),
    );

    await expect(
      reader.listAuditPhotoChanges('t0ken', 's3ss10n', since, until),
    ).resolves.toBeNull();
  });

  it('edge: reads the user id from the last parentheses, whatever the name holds', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce(
      auditPage([
        { CONTENT: 'audit.user.photo', TARGET: 'Cruz (Jr)(91000001)' },
      ]),
    );

    await expect(
      reader.listAuditPhotoChanges('t0ken', 's3ss10n', since, until),
    ).resolves.toEqual(new Set(['91000001']));
  });

  // Measured live 2026-09-23: our own imports and remark edits share the
  // user menu; only a photo change may send the pull to fetch a detail.
  it('regression: ignores imports and changes that are not photos', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce(
      auditPage([
        { CONTENT: 'audit.user.csv_import', TARGET: 'sync_batch1.csv' },
        {
          CONTENT: 'audit.user.user_custom_fields',
          TARGET: 'Santos Juan(91000003)',
        },
        {
          CONTENT: 'audit.user.photo|audit.user.user_custom_fields',
          TARGET: 'Santos Juan(91000002)',
        },
      ]),
    );

    await expect(
      reader.listAuditPhotoChanges('t0ken', 's3ss10n', since, until),
    ).resolves.toEqual(new Set(['91000002']));
  });

  it('happy: asks for user changes in the window, page by page, in the format BioStar accepts', async () => {
    const first = Array.from({ length: 500 }, (_, i) => ({
      CONTENT: 'audit.user.photo',
      TARGET: `User(${9100000 + i})`,
    }));
    (axios.post as jest.Mock)
      .mockResolvedValueOnce(auditPage(first))
      .mockResolvedValueOnce(
        auditPage([{ CONTENT: 'audit.user.photo', TARGET: 'Last(91200000)' }]),
      );

    const ids = await reader.listAuditPhotoChanges(
      't0ken',
      's3ss10n',
      since,
      until,
    );

    expect(ids?.size).toBe(501);
    const [firstUrl, firstBody] = (axios.post as jest.Mock).mock.calls[0];
    expect(firstUrl).toBe('https://biostar.fake/api/audit/search');
    expect(firstBody.Query.conditions).toEqual([
      { column: 'MENU', operator: 0, values: ['user'] },
      {
        column: 'DATE',
        operator: 3,
        values: ['2026-09-23T04:00:00.00Z', '2026-09-23T05:00:00.00Z'],
      },
    ]);
    expect((axios.post as jest.Mock).mock.calls[1][1].Query.offset).toBe(500);
  });
});
