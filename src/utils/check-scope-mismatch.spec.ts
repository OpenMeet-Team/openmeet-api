import {
  checkScopeMismatch,
  getRequiredScopesForIdentity,
} from './check-scope-mismatch';

describe('checkScopeMismatch', () => {
  it('should return empty array when scopes are the same', () => {
    expect(
      checkScopeMismatch('atproto account:email', 'atproto account:email'),
    ).toEqual([]);
  });

  it('should return empty array when granted has extra scopes', () => {
    expect(
      checkScopeMismatch(
        'atproto account:email',
        'atproto account:email rpc:app.bsky.actor.getProfile',
      ),
    ).toEqual([]);
  });

  it('should return missing scope when one is absent from granted', () => {
    expect(checkScopeMismatch('atproto account:email', 'atproto')).toEqual([
      'account:email',
    ]);
  });

  it('should return all missing scopes when multiple are absent', () => {
    const result = checkScopeMismatch(
      'atproto account:email rpc:app.bsky.actor.getProfile',
      'atproto',
    );
    expect(result).toEqual(
      expect.arrayContaining([
        'account:email',
        'rpc:app.bsky.actor.getProfile',
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('should return empty array when configured is empty', () => {
    expect(checkScopeMismatch('', 'atproto account:email')).toEqual([]);
  });

  it('should return all configured scopes when granted is empty', () => {
    const result = checkScopeMismatch('atproto account:email', '');
    expect(result).toEqual(
      expect.arrayContaining(['atproto', 'account:email']),
    );
    expect(result).toHaveLength(2);
  });

  it('should handle extra whitespace in inputs', () => {
    expect(
      checkScopeMismatch(
        '  atproto   account:email  ',
        '  atproto   account:email  ',
      ),
    ).toEqual([]);
  });

  it('should handle duplicate scopes in input', () => {
    expect(
      checkScopeMismatch(
        'atproto atproto account:email',
        'atproto account:email',
      ),
    ).toEqual([]);
  });

  it('should return empty array when same scopes are in different order', () => {
    expect(
      checkScopeMismatch('account:email atproto', 'atproto account:email'),
    ).toEqual([]);
  });
});

describe('getRequiredScopesForIdentity', () => {
  const configured = 'atproto account:email identity:handle repo:x.y.event';

  it('should require identity:handle for an identity on our PDS', () => {
    expect(
      getRequiredScopesForIdentity(configured, { isOurPds: true }),
    ).toEqual('atproto account:email identity:handle repo:x.y.event');
  });

  it('should not require identity:handle for an external PDS identity', () => {
    expect(
      getRequiredScopesForIdentity(configured, { isOurPds: false }),
    ).toEqual('atproto account:email repo:x.y.event');
  });

  it('should keep every other scope for an external PDS identity', () => {
    const required = getRequiredScopesForIdentity(configured, {
      isOurPds: false,
    }).split(' ');
    expect(required).toEqual(
      expect.arrayContaining(['atproto', 'account:email', 'repo:x.y.event']),
    );
    expect(required).toHaveLength(3);
  });

  it('should preserve the configured order', () => {
    expect(
      getRequiredScopesForIdentity('identity:handle atproto', {
        isOurPds: true,
      }),
    ).toEqual('identity:handle atproto');
  });

  it('should tolerate extra whitespace in the configured list', () => {
    expect(
      getRequiredScopesForIdentity('  atproto   identity:handle  ', {
        isOurPds: false,
      }),
    ).toEqual('atproto');
  });

  it('should return an empty string when nothing is configured', () => {
    expect(getRequiredScopesForIdentity('', { isOurPds: true })).toEqual('');
  });

  it('should feed checkScopeMismatch so an external identity has no gap', () => {
    // The session was granted under the scope list that predates
    // identity:handle. Our PDS still needs it; an external PDS does not.
    const granted = 'atproto account:email repo:x.y.event';

    expect(
      checkScopeMismatch(
        getRequiredScopesForIdentity(configured, { isOurPds: true }),
        granted,
      ),
    ).toEqual(['identity:handle']);

    expect(
      checkScopeMismatch(
        getRequiredScopesForIdentity(configured, { isOurPds: false }),
        granted,
      ),
    ).toEqual([]);
  });
});
