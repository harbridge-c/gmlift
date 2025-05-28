import { GaxiosResponse } from 'gaxios';
import { OAuth2Client } from 'google-auth-library';
import { gmail_v1, google } from 'googleapis';
import { getLogger } from '../logging';
import { Instance } from './api.d';

const QUOTA_SLEEP_DURATION_MS = 60_000;
const DEFAULT_QUOTA_RETRY_LIMIT = 3;

function isQuotaExceededError(error: any): boolean {
    const message: string = error?.message || '';
    return message.includes('Quota exceeded');
}

async function executeWithQuotaRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
    const logger = getLogger();
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            if (isQuotaExceededError(error) && attempt < maxRetries) {
                logger.warn(`Quota exceeded detected. Sleeping for 60 seconds before retrying (${attempt + 1}/${maxRetries}).`);
                await new Promise(resolve => setTimeout(resolve, QUOTA_SLEEP_DURATION_MS));
                continue;
            }
            throw error;
        }
    }
}

export const create = (auth: OAuth2Client, maxQuotaRetries: number = DEFAULT_QUOTA_RETRY_LIMIT): Instance => {
    const gmail = google.gmail({ version: 'v1', auth });


    // Add this function to get all labels
    async function listLabels(params: gmail_v1.Params$Resource$Users$Labels$List): Promise<gmail_v1.Schema$Label[]> {
        const logger = getLogger();
        logger.debug('Fetching labels with params: %j', params);
        const response: GaxiosResponse<gmail_v1.Schema$ListLabelsResponse> = await executeWithQuotaRetry(
            () => gmail.users.labels.list(params),
            maxQuotaRetries
        );

        const labels: gmail_v1.Schema$Label[] = response.data.labels || [];
        return labels;
    }


    async function listMessages(params: gmail_v1.Params$Resource$Users$Messages$List, callback: (messages: gmail_v1.Schema$Message[]) => Promise<void>): Promise<void> {
        const logger = getLogger();

        logger.debug('Fetching messages with params: %j', params);
        let nextPageToken: string | undefined;
        do {
            if (nextPageToken) {
                logger.info('Fetching Next Page of Messages with pageToken: %s', nextPageToken);
            }

            const res: GaxiosResponse<gmail_v1.Schema$ListMessagesResponse> = await executeWithQuotaRetry(
                () =>
                    gmail.users.messages.list({
                        ...params,
                        pageToken: nextPageToken
                    }),
                maxQuotaRetries
            );

            const messages = res.data.messages || [];
            logger.info('Found %d messages for params: %j', messages.length, params);

            await callback(messages);

            nextPageToken = res.data.nextPageToken || undefined;
        } while (nextPageToken);
    }

    async function getMessage(params: gmail_v1.Params$Resource$Users$Messages$Get): Promise<gmail_v1.Schema$Message | null> {
        const logger = getLogger();
        logger.debug('Fetching message with params: %j', params);
        const emailResponse: GaxiosResponse<gmail_v1.Schema$Message> = await executeWithQuotaRetry(
            () => gmail.users.messages.get(params),
            maxQuotaRetries
        );

        return emailResponse.data;
    }

    async function getAttachment(params: gmail_v1.Params$Resource$Users$Messages$Attachments$Get): Promise<gmail_v1.Schema$MessagePartBody | null> {
        const logger = getLogger();
        logger.debug('Fetching attachment with params: %j', params);
        const attachmentResponse: GaxiosResponse<gmail_v1.Schema$MessagePartBody> = await executeWithQuotaRetry(
            () => gmail.users.messages.attachments.get(params),
            maxQuotaRetries
        );

        return attachmentResponse.data;
    }

    return {
        listLabels: listLabels,
        listMessages: listMessages,
        getMessage: getMessage,
        getAttachment: getAttachment
    }
}




