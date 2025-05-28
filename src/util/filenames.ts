import crypto from 'node:crypto';

/** Replace characters invalid in filenames with dashes */
export function sanitizeFilename(filename: string): string {
    return filename.replace(/[<>:"/\\|?*]/g, '-');
}

/**
 * Sanitize and shorten an email subject for use in filenames.
 * If the sanitized subject exceeds `maxLength`, it is truncated and a short
 * hash of the original subject is appended to help preserve uniqueness.
 */
export function safeSubject(subject: string, maxLength = 100): string {
    const sanitized = sanitizeFilename(subject);
    if (sanitized.length <= maxLength) {
        return sanitized;
    }

    const hash = crypto.createHash('sha1').update(sanitized).digest('hex').slice(0, 8);
    const truncated = sanitized.slice(0, maxLength - 9); // leave space for '-' + hash
    return `${truncated}-${hash}`;
}
