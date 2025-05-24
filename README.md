# GMail Lift

A command-line utility to export emails from GMail to markdown files.

## Installation

You can run this utility directly using npx:

```bash
npx @vortiq/gmlift
```

Or install it globally:

```bash
npm install -g @vortiq/gmlift
```

## Usage

The utility requires a configuration file (default: `config.yaml`) and an output directory (default: `./exports`).

Basic usage:
```bash
npx @vortiq/gmlift
```

With custom config and output:
```bash
npx @vortiq/gmlift --config ./my-config.yaml --output ./my-exports
```

### Command Line Options

- `--config <path>`: Path to configuration file (default: ./config.yaml)
- `--output <path>`: Output directory for exported emails (default: ./exports)
- `--start <date>`: Start date in YYYY-MM-DD format
- `--end <date>`: End date in YYYY-MM-DD format
- `--current-month`: Export emails from the current month
- `--dry-run`: Show what would be exported without actually exporting
- `--output-structure <type>`: Output directory structure (year/month/day)
- `--filename-options <options>`: Filename format options (comma-separated list of: date,time,subject)

### Filename Options

The `--filename-options` parameter allows you to customize the format of exported email filenames. You can specify multiple options separated by commas:

- `date`: Adds a date identifier to the start of the filename. The format depends on the `--output-structure` option:
  - If `--output-structure` is "year": Uses "MM-DD" format
  - If `--output-structure` is "month": Uses "DD" format
  - If `--output-structure` is "day": Cannot be used (will throw an error)
- `time`: Adds hour and minute (HHMM) between the date and message ID
- `subject`: Adds a filesystem-safe abbreviation of the email subject at the end of the filename

Examples:
```bash
# Filename format: DD-HHMM-messageId.eml
npx @vortiq/gmlift --filename-options date,time

# Filename format: DD-messageId.eml
npx @vortiq/gmlift --filename-options date

# Filename format: DD-HHMM-messageId-SUBJECT.eml
npx @vortiq/gmlift --filename-options date,time,subject
```

## Configuration

Create a `config.yaml` file with your GMail API credentials:

```yaml
client_id: "your-client-id"
client_secret: "your-client-secret"
redirect_uri: "http://localhost:3000/oauth2callback"
```

## Email Format

The exported emails follow the RFC2822 message format standard, with additional Gmail-specific information preserved in custom headers. These custom headers are prefixed with `gmlift-` to comply with RFC6648 (which deprecates the use of "X-" prefix for custom headers). The following Gmail-specific information is included:

- `gmlift-Id`: Gmail's unique message identifier
- `gmlift-LabelIds`: List of Gmail labels associated with the message
- `gmlift-ThreadId`: Gmail's thread identifier
- `gmlift-Snippet`: Gmail's message snippet (truncated preview of the message content)
- `gmlift-SizeEstimate`: Estimated size of the message in bytes
- `gmlift-HistoryId`: Gmail's history identifier for tracking changes
- `gmlift-InternalDate`: Gmail's internal timestamp (Unix timestamp in milliseconds)

Example headers:
```txt
gmlift-Id: 195d3c7f4a842ecd
gmlift-LabelIds: Label_115,IMPORTANT,CATEGORY_FORUMS
gmlift-ThreadId: 195d3c7f4a842ecd
gmlift-Snippet: hi Orpheon Good auditions on the chant solos last night! Som...
gmlift-SizeEstimate: 12855
gmlift-HistoryId: 59343913
gmlift-InternalDate: 1743014808000
```

The export preserves all original email headers (such as Delivered-To, Received, etc.) while adding these Gmail-specific headers to ensure no metadata is lost during the export process.

TEST

## License

Apache-2.0
