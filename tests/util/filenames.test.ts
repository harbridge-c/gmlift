import { describe, test, expect } from '@jest/globals';
import { safeSubject, sanitizeFilename } from '../../src/util/filenames.js';

describe('filename utilities', () => {
    test('sanitizeFilename replaces invalid characters', () => {
        expect(sanitizeFilename('a/b:c*?')).toBe('a-b-c--');
    });

    test('safeSubject truncates long subjects and appends hash', () => {
        const long = 'a'.repeat(150);
        const result = safeSubject(long, 50);
        expect(result.length).toBeLessThanOrEqual(50);
        // should end with dash followed by 8 hex chars
        expect(/-[0-9a-f]{8}$/.test(result)).toBe(true);
    });

    test('safeSubject returns sanitized subject when short', () => {
        const result = safeSubject('Short Subject');
        expect(result).toBe('Short Subject');
    });
});
