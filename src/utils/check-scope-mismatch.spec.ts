import { checkScopeMismatch } from './check-scope-mismatch';

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
