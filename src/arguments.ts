import { Dreadcabinet } from "@theunwalked/dreadcabinet";
import * as Cardigantime from '@theunwalked/cardigantime';
import { Command } from "commander";
import { Args, CombinedArgs, DateRange, gmliftConfig, JobArgs, JobConfig } from "types";
import { ALLOWED_SCOPES, DEFAULT_CURRENT_MONTH, DEFAULT_DRY_RUN, DEFAULT_VERBOSE, gmlift_DEFAULTS, PROGRAM_NAME, VERSION } from "./constants";
import { getLogger } from "./logging";
import * as Storage from './util/storage';
import * as Dates from './util/dates';

function clean(obj: any) {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
    );
}

export const configure = async (dreadcabinet: Dreadcabinet, cardigantime: Cardigantime.Cardigantime<any>): Promise<[gmliftConfig, DateRange]> => {
    const logger = getLogger();
    let program = new Command();

    program
        .name(PROGRAM_NAME)
        .summary('Export Gmail messages within a date range to local files')
        .description('Export Gmail messages within a date range to local files')
        .option('--start <date>', 'start date (YYYY-MM-DD). If omitted, defaults to 31 days before end date')
        .option('--end <date>', 'end date (YYYY-MM-DD). If omitted, defaults to current date')
        .option('--current-month', 'export emails from the first day of the current month to today, cannot be used together with either --start or --end options', DEFAULT_CURRENT_MONTH)
        .option('--dry-run', 'perform a dry run without saving files', DEFAULT_DRY_RUN)
        .option('--verbose', 'enable debug logging', DEFAULT_VERBOSE)
        .option('--config <path>', 'Path to configuration file')
        .option('--credentials-file <path>', 'path to credentials file for Gmail API')
        .option('--token-file <path>', 'path to token file for Gmail API')
        .option('--api-scopes [apiScopes...]', 'API scopes (space-separated list of scopes) for Gmail API')
        .version(VERSION);

    await dreadcabinet.configure(program);
    program = await cardigantime.configure(program);
    program.parse();


    const cliCombinedArgs: CombinedArgs = program.opts<CombinedArgs>();
    logger.info('Loaded Command Line Options: %s', JSON.stringify(cliCombinedArgs, null, 2));

    const cliArgs: Args = {
        config: cliCombinedArgs.config,
        credentialsFile: cliCombinedArgs.credentialsFile,
        tokenFile: cliCombinedArgs.tokenFile,
        apiScopes: cliCombinedArgs.apiScopes,
        verbose: cliCombinedArgs.verbose,
        dryRun: cliCombinedArgs.dryRun,
        outputDirectory: cliCombinedArgs.outputDirectory,
        outputStructure: cliCombinedArgs.outputStructure,
        outputFilenameOptions: cliCombinedArgs.outputFilenameOptions,
    } as Args;

    const cliJobArgs: JobArgs = {
        currentMonth: cliCombinedArgs.currentMonth,
        start: cliCombinedArgs.start,
        end: cliCombinedArgs.end,
    };

    // Get values from config file first
    // Validate that the configuration read from the file is valid.
    const fileValues = await cardigantime.read(cliCombinedArgs);
    await cardigantime.validate(fileValues);

    // Read the Raw values from the Dreadcabinet Command Line Arguments
    const dreadcabinetValues = await dreadcabinet.read(cliCombinedArgs);

    let gmliftConfig: gmliftConfig = {
        ...gmlift_DEFAULTS,
        ...fileValues,   // Apply file values (overwrites defaults), ensure object
        ...dreadcabinetValues,              // Apply all CLI args last (highest precedence for all keys, including Dreadcabinet's)
        ...clean(cliArgs),
    } as gmliftConfig;
    await validategmliftConfig(gmliftConfig);

    const jobConfig: JobConfig = {
        ...clean(cliJobArgs),
    } as JobConfig;
    await validateJobConfig(jobConfig);


    gmliftConfig = dreadcabinet.applyDefaults(gmliftConfig) as gmliftConfig;

    const dateRange = createDateRange({
        timezone: gmliftConfig.timezone!,
        currentMonth: jobConfig.currentMonth ?? false,
        start: jobConfig.start ? new Date(jobConfig.start) : undefined,
        end: jobConfig.end ? new Date(jobConfig.end) : undefined,
    });

    return [gmliftConfig, dateRange];
}

export const validategmliftConfig = async (gmliftConfig: gmliftConfig) => {


    await validateConfigDirectory(gmliftConfig.config);

    await validateCredentialsFile(gmliftConfig.credentialsFile);

    await validateTokenFile(gmliftConfig.tokenFile);

    await validateApiScopes(gmliftConfig.apiScopes);

}

export const validateJobConfig = async (jobConfig: JobConfig) => {
    if (!jobConfig.start && !jobConfig.end && !jobConfig.currentMonth) {
        throw new Error('You must specify a date range using --start/--end or use --current-month.');
    }

    if (jobConfig.start && isNaN(new Date(jobConfig.start).getTime())) {
        throw new Error(`Invalid start date format: ${jobConfig.start}. Please use YYYY-MM-DD.`);
    }
    if (jobConfig.end && isNaN(new Date(jobConfig.end).getTime())) {
        throw new Error(`Invalid end date format: ${jobConfig.end}. Please use YYYY-MM-DD.`);
    }

    if (jobConfig.currentMonth && (jobConfig.start || jobConfig.end)) {
        throw new Error('currentMonth cannot be used together with either start or end options');
    }
}

export const validateConfigDirectory = async (configDir: string): Promise<void> => {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.info });
    if (!storage.isDirectoryReadable(configDir)) {
        throw new Error(`Config directory does not exist: ${configDir}`);
    }
}

export const validateCredentialsFile = async (credentialsFile: string): Promise<void> => {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.info });
    if (!storage.isFileReadable(credentialsFile)) {
        throw new Error(`Credentials file does not exist: ${credentialsFile}`);
    }
}

export const validateTokenFile = async (tokenFile: string): Promise<void> => {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.info });
    if (!storage.isFileReadable(tokenFile)) {
        throw new Error(`Token file does not exist: ${tokenFile}`);
    }
}

export const validateApiScopes = async (apiScopes: string[]): Promise<void> => {
    if (apiScopes.length === 0) {
        throw new Error('API scopes are required');
    }
    for (const scope of apiScopes) {
        if (!ALLOWED_SCOPES.includes(scope)) {
            throw new Error(`Invalid API scope: ${scope}`);
        }
    }
}


function createDateRange({ timezone, currentMonth, start, end }: { timezone: string, currentMonth: boolean, start?: Date, end?: Date }): DateRange {
    let startDate: Date;
    let endDate: Date;

    const dateUtility = Dates.create({ timezone });

    if (currentMonth) {
        const today = dateUtility.now();
        startDate = dateUtility.startOfMonth(today);
        endDate = today;
        getLogger().info(`Using current month date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    } else {
        if (end) {
            endDate = dateUtility.date(end);
        } else {
            endDate = dateUtility.now();
            getLogger().info('No end date specified, defaulting to now.');
        }

        if (start) {
            startDate = dateUtility.date(start);
        } else {
            startDate = dateUtility.subDays(endDate, 31);
            getLogger().info('No start date specified, defaulting to 31 days before end date.');
        }
        getLogger().info(`Using specified or default date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    }

    if (dateUtility.isBefore(endDate, startDate)) {
        const errorMsg = `End date (${endDate.toISOString()}) must be on or after start date (${startDate.toISOString()}).`;
        getLogger().error(errorMsg);
        throw new Error(errorMsg);
    }

    return {
        start: startDate,
        end: endDate
    };
}

