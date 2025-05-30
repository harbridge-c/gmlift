#!/usr/bin/env node
import * as Dreadcabinet from '@theunwalked/dreadcabinet';
import * as Cardigantime from '@theunwalked/cardigantime';
import * as Arguments from './arguments';
import { ALLOWED_OUTPUT_FILENAME_OPTIONS, ALLOWED_OUTPUT_STRUCTURES, DEFAULT_CONFIG_DIR, DEFAULT_OUTPUT_DIRECTORY, DEFAULT_OUTPUT_FILENAME_OPTIONS, DEFAULT_OUTPUT_STRUCTURE, DEFAULT_TIMEZONE, PROGRAM_NAME, VERSION } from './constants';
import { Instance as GmailExportInstance } from './gmailExport.d';
import { getLogger, setLogLevel } from './logging';
import { connect, ExitError, exportEmails } from './phases';
import { DateRange, gmliftConfig, gmliftConfigSchema } from './types';
import { z } from 'zod';

export async function main() {

    // eslint-disable-next-line no-console
    console.info(`Starting ${PROGRAM_NAME}: ${VERSION}`);

    const dreadcabinet = Dreadcabinet.create({
        defaults: {
            timezone: DEFAULT_TIMEZONE,
            outputStructure: DEFAULT_OUTPUT_STRUCTURE,
            outputFilenameOptions: DEFAULT_OUTPUT_FILENAME_OPTIONS,
            outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
        },
        allowed: {
            outputStructures: ALLOWED_OUTPUT_STRUCTURES,
            outputFilenameOptions: ALLOWED_OUTPUT_FILENAME_OPTIONS,
        },
        features: ['output', 'structured-output'],
        addDefaults: false,
    });

    const mergedShapeProperties = {
        ...gmliftConfigSchema.partial().shape,
        ...Dreadcabinet.ConfigSchema.partial().shape
    };

    const combinedShape = z.object(mergedShapeProperties);

    const cardigantime: Cardigantime.Cardigantime<any> = Cardigantime.create({
        defaults: {
            configDirectory: DEFAULT_CONFIG_DIR,
        },
        configShape: combinedShape.shape,
    });


    const [gmliftConfig, dateRange]: [gmliftConfig, DateRange] = await Arguments.configure(dreadcabinet, cardigantime);


    // Set log level based on verbose flag
    if (gmliftConfig.verbose) {
        setLogLevel('debug');
    }
    const logger = getLogger();

    try {
        const operator = await dreadcabinet.operate(gmliftConfig); // Create the operator
        const gmail: GmailExportInstance = await connect(gmliftConfig, operator); // Pass operator to connect
        await exportEmails(gmail, gmliftConfig, dateRange);

    } catch (error: any) {
        if (error instanceof ExitError) {
            logger.error('Exiting due to Error');
        } else {
            logger.error('Exiting due to Error: %s', error.message);
        }
        process.exit(1);
    }
}