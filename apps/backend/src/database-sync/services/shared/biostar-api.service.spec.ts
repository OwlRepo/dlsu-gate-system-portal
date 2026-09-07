import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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
});
