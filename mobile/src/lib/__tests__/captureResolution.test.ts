import { resolveCapturedExercise } from '../captureResolution';

describe('resolveCapturedExercise (the capture resolution order)', () => {
  const aliasHit = jest.fn(async () => 'alias-id');
  const aliasMiss = jest.fn(async () => null);
  const aliasThrow = jest.fn(async () => {
    throw new Error('network');
  });

  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it('rung 1: an alias hit links immediately and outranks the model match', async () => {
    const res = await resolveCapturedExercise('Pullups', 'model-id', aliasHit);
    expect(res).toEqual({ kind: 'linked', exerciseId: 'alias-id', via: 'alias' });
    expect(aliasHit).toHaveBeenCalledWith('Pullups');
  });

  it('rung 2: alias miss falls through to the validated library match', async () => {
    const res = await resolveCapturedExercise('Pullups', 'model-id', aliasMiss);
    expect(res).toEqual({ kind: 'linked', exerciseId: 'model-id', via: 'model' });
  });

  it('rung 3: nothing matched — review, never an auto-create', async () => {
    const res = await resolveCapturedExercise('Flying Widget Press', null, aliasMiss);
    expect(res).toEqual({ kind: 'review' });
  });

  it('a broken alias lookup degrades to the model match instead of failing', async () => {
    const res = await resolveCapturedExercise('Pullups', 'model-id', aliasThrow);
    expect(res).toEqual({ kind: 'linked', exerciseId: 'model-id', via: 'model' });
    expect(consoleError).toHaveBeenCalled();
  });

  it('a broken alias lookup with no model match still lands in review', async () => {
    const res = await resolveCapturedExercise('Pullups', null, aliasThrow);
    expect(res).toEqual({ kind: 'review' });
  });
});
