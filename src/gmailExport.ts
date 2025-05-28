import { Operator as DreadcabinetOperator } from '@theunwalked/dreadcabinet';
import { gmail_v1 } from 'googleapis';
import * as path from 'path';
import { DEFAULT_CHARACTER_ENCODING } from './constants';
import * as Filter from './filter';
import { Instance as GmailApiInstance } from './gmail/api.d';
import MessageWrapper from './gmail/MessageWrapper';
import { createQuery } from './gmail/query';
import { Instance } from './gmailExport.d';
import { getLogger } from './logging';
import { DateRange, gmliftConfig } from 'types';
import * as Dates from './util/dates';
import * as Storage from './util/storage';


async function getEmailFilePath(
    operator: DreadcabinetOperator,
    messageId: string,
    dateHeader: string,
    subject: string,
    timezone: string,
): Promise<string> {
    const dates = Dates.create({ timezone });
    const storage = Storage.create({});

    const date = dates.date(dateHeader);

    const dirPath = await operator.constructOutputDirectory(date);
    const baseFilename = await operator.constructFilename(date, 'email', messageId, { subject });

    await storage.createDirectory(dirPath);

    return path.join(dirPath, `${baseFilename}.eml`);
}

function foldHeaderLine(name: string, value: string): string {
    const maxLength = 78;
    const indent = ' '; // Standard space for folded lines

    // Initial line has format "Name: Value"
    let result = `${name}: ${value}`;

    // If the line is already short enough, return as is
    if (result.length <= maxLength) {
        return result;
    }

    // Calculate available space for first line (accounting for "Name: ")
    const firstLineMax = maxLength - name.length - 2;
    result = `${name}: ${value.substring(0, firstLineMax)}`;
    let remainingValue = value.substring(firstLineMax);

    // Fold remaining content
    while (remainingValue.length > 0) {
        const chunk = remainingValue.substring(0, maxLength - indent.length);
        result += `\r\n${indent}${chunk}`;
        remainingValue = remainingValue.substring(chunk.length);
    }

    return result;
}

export const create = (gmliftConfig: gmliftConfig, api: GmailApiInstance, operator: DreadcabinetOperator): Instance => {
    const logger = getLogger();
    const filter = Filter.create(gmliftConfig);
    const userId = 'me';
    const storage = Storage.create({});

    let processedCount = 0;
    let skippedCount = 0;
    let filteredCount = 0;
    let errorCount = 0;

    async function processMessage(message: gmail_v1.Schema$Message): Promise<void> {
        const messageId = message.id;

        const messageMetadata = await api.getMessage({
            userId,
            id: messageId!,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date', 'Message-ID', 'Delivered-To', 'Reply-To', 'Content-Type', 'Cc', 'Bcc']
        });

        if (!messageMetadata) {
            logger.error('Skipping message with no metadata: %s', messageId);
            errorCount++;
            return;
        }

        // Ensure the message contains a From header before continuing
        const hasFrom = messageMetadata.payload?.headers?.some(h => h.name === 'From');
        if (!hasFrom) {
            logger.warn('Skipping message %s due to missing From header', messageId);
            errorCount++;
            return;
        }

        try {
            // Wrap the message metadata in a wrapper class to reduce the amount of code needed to access the message metadata
            const wrappedMessage = new MessageWrapper(messageMetadata);

            // Check if email should be skipped
            const skipCheck = filter.shouldSkipEmail(wrappedMessage);
            if (skipCheck.skip) {
                filteredCount++;
                logger.debug('Filtered email: %s %j', skipCheck.reason, wrappedMessage);
                return;
            }

            const filePath = await getEmailFilePath(
                operator,
                messageId!,
                wrappedMessage.date,
                wrappedMessage.subject || 'No Subject',
                gmliftConfig.timezone,
            );

            // Skip if file already exists
            if (await storage.exists(filePath)) {
                logger.debug('Skipping existing file: %s', filePath);
                skippedCount++;
                return;
            }

            const messageRaw: gmail_v1.Schema$Message | null = await api.getMessage({ userId, id: messageId!, format: 'raw' });
            if (!messageRaw) {
                logger.error('Skipping raw export for message with no data: %s', messageId);
                errorCount++;
                return;
            }

            const gmliftHeaders: string = [
                foldHeaderLine('gmlift-Id', messageId!),
                foldHeaderLine('gmlift-LabelIds', messageRaw.labelIds?.join(',') || ''),
                foldHeaderLine('gmlift-ThreadId', messageRaw.threadId || ''),
                foldHeaderLine('gmlift-Snippet', messageRaw.snippet || ''),
                foldHeaderLine('gmlift-SizeEstimate', String(messageRaw.sizeEstimate || '')),
                foldHeaderLine('gmlift-HistoryId', String(messageRaw.historyId || '')),
                foldHeaderLine('gmlift-InternalDate', String(messageRaw.internalDate || ''))
            ].join('\n');

            const rowMessage = Buffer.from(messageRaw.raw!, 'base64').toString('utf-8');
            await storage.writeFile(filePath, gmliftHeaders + '\n' + rowMessage, DEFAULT_CHARACTER_ENCODING);
            logger.info('Exported email: %s', filePath);
            processedCount++;
        } catch (error) {
            logger.error('Error processing message %s: %s', messageId, error);
            errorCount++;
        }
    }

    async function exportEmails(dateRange: DateRange): Promise<void> {
        try {
            const query = createQuery(dateRange, gmliftConfig, gmliftConfig.timezone);
            await api.listMessages({ userId, q: query }, async (messageBatch) => {
                logger.info('Processing %d messages', messageBatch.length);
                // Process all messages in the batch concurrently
                await Promise.all(messageBatch.map((message: gmail_v1.Schema$Message) => processMessage(message)));
            });

            printExportSummary();

            if (gmliftConfig.dryRun) {
                logger.info('This was a dry run. No files were actually saved.');
            }
        } catch (error: any) {
            logger.error('Error fetching emails: %s %s', error.message, error.stack);
            throw error;
        }
    }

    function printExportSummary() {
        logger.info('Export Summary:');
        logger.info(`\tTotal messages found: ${processedCount + skippedCount + filteredCount + errorCount}`);
        logger.info(`\tSuccessfully processed: ${processedCount}`);
        logger.info(`\tSkipped (already exists): ${skippedCount}`);
        logger.info(`\tFiltered out: ${filteredCount}`);
        logger.info(`\tErrors: ${errorCount}`);
        logger.info(`\tDry run mode: ${gmliftConfig.dryRun ? 'Yes' : 'No'}`);
    }

    return {
        exportEmails: exportEmails,

        // Note that I dislike exporting these, but it's for testing purposes
        printExportSummary: printExportSummary,
    };
}