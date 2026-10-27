import { Student } from '../../students/entities/student.entity';
import { isMainStudentChanged } from './database-sync-main-path.service';

// TypeORM returns bigint as a string; the source feed hex-parses the card to a number.
type Existing = Pick<
  Student,
  | 'Name'
  | 'Lived_Name'
  | 'Remarks'
  | 'Photo'
  | 'Campus_Entry'
  | 'isArchived'
  | 'group'
> & { Unique_ID: string | null };
type Next = Omit<Existing, 'Unique_ID'> & { Unique_ID: number | null };

const baseExisting = (overrides: Partial<Existing> = {}): Existing => ({
  Name: 'Juan Dela Cruz',
  Lived_Name: 'Juan',
  Remarks: 'remark',
  Photo: 'photo-1',
  Campus_Entry: 'Y',
  Unique_ID: '291',
  isArchived: false,
  group: 'Student',
  ...overrides,
});

const baseNext = (overrides: Partial<Next> = {}): Next => ({
  Name: 'Juan Dela Cruz',
  Lived_Name: 'Juan',
  Remarks: 'remark',
  Photo: 'photo-1',
  Campus_Entry: 'Y',
  Unique_ID: 291,
  isArchived: false,
  group: 'Student',
  ...overrides,
});

describe('isMainStudentChanged', () => {
  it('error: a stored bigint string and an incoming number with the same card are unchanged', () => {
    expect(
      isMainStudentChanged(
        baseExisting({ Unique_ID: '291' }),
        baseNext({ Unique_ID: 291 }),
      ),
    ).toBe(false);
  });

  it('edge: a null stored card and a null incoming card are unchanged', () => {
    expect(
      isMainStudentChanged(
        baseExisting({ Unique_ID: null }),
        baseNext({ Unique_ID: null }),
      ),
    ).toBe(false);
  });

  it('edge: a null stored card and an incoming card are changed', () => {
    expect(
      isMainStudentChanged(
        baseExisting({ Unique_ID: null }),
        baseNext({ Unique_ID: 291 }),
      ),
    ).toBe(true);
  });

  it('edge: a stored card and a null incoming card are changed (card cleared)', () => {
    expect(
      isMainStudentChanged(
        baseExisting({ Unique_ID: '291' }),
        baseNext({ Unique_ID: null }),
      ),
    ).toBe(true);
  });

  it('edge: surrounding spaces on the stored card are unchanged', () => {
    expect(
      isMainStudentChanged(
        baseExisting({ Unique_ID: ' 291 ' }),
        baseNext({ Unique_ID: 291 }),
      ),
    ).toBe(false);
  });

  it('edge: a card above 2^53 matches the text PostgreSQL stored for it', () => {
    expect(
      isMainStudentChanged(
        baseExisting({ Unique_ID: '18014398509481984' }),
        baseNext({ Unique_ID: 2 ** 54 }),
      ),
    ).toBe(false);
  });

  it('regression: a different incoming card is changed', () => {
    expect(
      isMainStudentChanged(
        baseExisting({ Unique_ID: '291' }),
        baseNext({ Unique_ID: 292 }),
      ),
    ).toBe(true);
  });

  it.each<[string, Partial<Next>]>([
    ['Name', { Name: 'Juan D. Cruz' }],
    ['Lived_Name', { Lived_Name: 'Johnny' }],
    ['Remarks', { Remarks: 'other' }],
    ['Photo', { Photo: 'photo-2' }],
    ['Campus_Entry', { Campus_Entry: 'N' }],
    ['isArchived', { isArchived: true }],
    ['group', { group: 'Employee' }],
  ])('happy: a differing %s is changed', (_field, override) => {
    expect(isMainStudentChanged(baseExisting(), baseNext(override))).toBe(true);
  });

  it('happy: an identical row is unchanged', () => {
    expect(isMainStudentChanged(baseExisting(), baseNext())).toBe(false);
  });
});
