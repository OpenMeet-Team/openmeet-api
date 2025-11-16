import { sanitizeQuery, generateQueryFingerprint } from './data-source';

describe('Query Sanitization', () => {
  describe('sanitizeQuery', () => {
    it('should replace string literals with placeholders', () => {
      const query = "SELECT * FROM users WHERE email = 'user@example.com'";
      const result = sanitizeQuery(query);
      expect(result).toBe('SELECT * FROM users WHERE email = ?');
    });

    it('should replace numeric literals with placeholders', () => {
      const query = 'SELECT * FROM users WHERE id = 123';
      const result = sanitizeQuery(query);
      expect(result).toBe('SELECT * FROM users WHERE id = ?');
    });

    it('should sanitize sensitive data in INSERT statements', () => {
      const query =
        "INSERT INTO users (email, password) VALUES ('user@example.com', 'secret123')";
      const result = sanitizeQuery(query);
      expect(result).toBe('INSERT INTO users (email, password) VALUES (?)');
    });

    it('should sanitize UPDATE statements with sensitive values', () => {
      const query = "UPDATE users SET password = 'newsecret' WHERE id = 456";
      const result = sanitizeQuery(query);
      expect(result).toBe('UPDATE users SET password = ? WHERE id = ?');
    });

    it('should sanitize DELETE statements', () => {
      const query =
        "DELETE FROM sessions WHERE user_id = 789 AND token = 'abc123xyz'";
      const result = sanitizeQuery(query);
      expect(result).toBe(
        'DELETE FROM sessions WHERE user_id = ? AND token = ?',
      );
    });

    it('should collapse IN clause with multiple values', () => {
      const query = 'SELECT * FROM events WHERE id IN (1, 2, 3, 4, 5)';
      const result = sanitizeQuery(query);
      expect(result).toBe('SELECT * FROM events WHERE id IN (?)');
    });

    it('should handle complex queries with multiple sensitive values', () => {
      const query =
        "SELECT * FROM users WHERE email = 'test@example.com' AND age > 18 AND status = 'active'";
      const result = sanitizeQuery(query);
      expect(result).toBe(
        'SELECT * FROM users WHERE email = ? AND age > ? AND status = ?',
      );
    });

    it('should handle queries with no sensitive data', () => {
      const query = 'SELECT * FROM users';
      const result = sanitizeQuery(query);
      expect(result).toBe('SELECT * FROM users');
    });

    it('should handle empty query', () => {
      const query = '';
      const result = sanitizeQuery(query);
      expect(result).toBe('');
    });
  });

  describe('generateQueryFingerprint', () => {
    it('should generate consistent fingerprints for identical queries', () => {
      const query1 = 'SELECT * FROM users WHERE id = ?';
      const query2 = 'SELECT * FROM users WHERE id = ?';
      const fp1 = generateQueryFingerprint(query1);
      const fp2 = generateQueryFingerprint(query2);
      expect(fp1).toBe(fp2);
    });

    it('should generate consistent fingerprints regardless of whitespace', () => {
      const query1 = 'SELECT * FROM users WHERE id = ?';
      const query2 = 'SELECT  *  FROM  users  WHERE  id  =  ?';
      const fp1 = generateQueryFingerprint(query1);
      const fp2 = generateQueryFingerprint(query2);
      expect(fp1).toBe(fp2);
    });

    it('should generate consistent fingerprints regardless of case', () => {
      const query1 = 'SELECT * FROM users WHERE id = ?';
      const query2 = 'select * from users where id = ?';
      const fp1 = generateQueryFingerprint(query1);
      const fp2 = generateQueryFingerprint(query2);
      expect(fp1).toBe(fp2);
    });

    it('should generate different fingerprints for different queries', () => {
      const query1 = 'SELECT * FROM users WHERE id = ?';
      const query2 = 'SELECT * FROM events WHERE id = ?';
      const fp1 = generateQueryFingerprint(query1);
      const fp2 = generateQueryFingerprint(query2);
      expect(fp1).not.toBe(fp2);
    });

    it('should generate 12-character fingerprints', () => {
      const query = 'SELECT * FROM users WHERE id = ?';
      const fingerprint = generateQueryFingerprint(query);
      expect(fingerprint).toHaveLength(12);
      expect(fingerprint).toMatch(/^[a-f0-9]{12}$/);
    });

    it('should handle empty query', () => {
      const query = '';
      const fingerprint = generateQueryFingerprint(query);
      expect(fingerprint).toHaveLength(12);
      expect(fingerprint).toMatch(/^[a-f0-9]{12}$/);
    });
  });

  describe('Integration: sanitize + fingerprint', () => {
    it('should group similar queries with different values', () => {
      const queries = [
        "SELECT * FROM users WHERE email = 'user1@example.com'",
        "SELECT * FROM users WHERE email = 'user2@example.com'",
        "SELECT * FROM users WHERE email = 'admin@company.com'",
      ];

      const sanitized = queries.map(sanitizeQuery);
      const fingerprints = sanitized.map(generateQueryFingerprint);

      // All fingerprints should be identical
      expect(fingerprints[0]).toBe(fingerprints[1]);
      expect(fingerprints[1]).toBe(fingerprints[2]);

      // All sanitized queries should be identical
      expect(sanitized[0]).toBe(sanitized[1]);
      expect(sanitized[1]).toBe(sanitized[2]);
    });

    it('should differentiate queries with different structures', () => {
      const queries = [
        'SELECT * FROM users WHERE id = 1',
        'SELECT * FROM events WHERE id = 1',
        "UPDATE users SET name = 'test' WHERE id = 1",
      ];

      const sanitized = queries.map(sanitizeQuery);
      const fingerprints = sanitized.map(generateQueryFingerprint);

      // All fingerprints should be different
      expect(fingerprints[0]).not.toBe(fingerprints[1]);
      expect(fingerprints[1]).not.toBe(fingerprints[2]);
      expect(fingerprints[0]).not.toBe(fingerprints[2]);
    });
  });
});
