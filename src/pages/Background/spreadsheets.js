/** Anything related to reading from Google Spreadsheets */
import { DateTime } from 'luxon/build/cjs-browser/luxon';

// Read Twitter user list from the Google Spreadsheet every X hours
const READ_TWITTER_USERS_PERIOD_HOURS = 24;

const GAPI_URL = 'https://apis.google.com/js/client.js?onload=onGAPILoaded';
// TODO - Enter your Google API key
const API_KEY = 'TODO';
const DISCOVERY_DOCS = [
    'https://sheets.googleapis.com/$discovery/rest?version=v4',
];

// Where to read the Twitter user list from
const TWITTER_SPREADSHEET_ID = '1UVnxr47WAtMNaACW63SfuGCFXnUnc-5kIahzkN9-h9g';
const TWITTER_SPREADSHEET_TAB_NAMES = [
    'Select individuals',
    'Select Groups',
    'Select Academics',
];

const COLUMN_NAME_TWITTER_HANDLE = 'Twitter Handle';
const COLUMN_NAME_DISCLAIMER = 'Final Blurb';
const COLUMN_NAME_URL = 'Landing Page URL';

// Local storage keys
const KEY_TWITTER_USERS = 'twitter_users';
const KEY_LAST_READ_TIME = 'last_twitter_sheet_read_time';

/**
 * Utility function to load an external script
 * @param url
 * @param onLoad
 */
function loadScript(url, onLoad) {
    fetch(url)
        .then((response) => response.text())
        .then((data) => {
            new Function(data)();
            if (onLoad) onLoad();
        });
}

/**
 * Reads a single worksheet (tab) from the specified Google Spreadsheet.
 * Assumes GAPI library is already loaded.
 * @param spreadsheetId spreadsheet ID
 * @param worksheetName name of the worksheet
 */
async function readWorksheet(spreadsheetId, worksheetName) {
    return new Promise((resolve, reject) => {
        window.gapi.client.sheets.spreadsheets.values
            .get({
                spreadsheetId: spreadsheetId,
                range: worksheetName,
            })
            .then(function (response) {
                resolve(response.result.values);
            });
    });
}

/**
 * Parses worksheet data of array of rows (including header row), into a list of
 * objects, according to header row.
 * @param rows
 * @return list of object rows (where keys=header row names)
 */
function parseWorksheet(rows) {
    const header = rows[0];

    return rows
        .slice(1)
        .map((row) =>
            Object.fromEntries(
                row.map((column, index) => [header[index], column])
            )
        );
}

/**
 * Called when the external GAPI library finished loading
 */
function onGAPILoaded() {
    window.gapi.client
        .init({
            apiKey: API_KEY,
            discoveryDocs: DISCOVERY_DOCS,
        })
        .then(async () => {
            console.log('GAPI Loaded');

            const allUserPromises = TWITTER_SPREADSHEET_TAB_NAMES.map(
                async (tabName) => {
                    // Read raw rows for the current worksheet (tab)
                    const rows = await readWorksheet(
                        TWITTER_SPREADSHEET_ID,
                        tabName
                    );
                    // Parse the rows into objects where keys=header column values
                    const parsedRows = parseWorksheet(rows);

                    // Convert into a list of Twitter users that will be saved to storage
                    const twitterUsers = parsedRows.map((row) => [
                        row[COLUMN_NAME_TWITTER_HANDLE].toLowerCase(), // Save Twitter handles lower case
                        {
                            url: row[COLUMN_NAME_URL],
                            disclaimer: row[COLUMN_NAME_DISCLAIMER],
                        },
                    ]);

                    return twitterUsers;
                }
            );

            // Wait for all results to load up (from all sheets)
            Promise.all(allUserPromises).then((allResults) => {
                // Join all results into one array
                const allUsers = [].concat.apply([], allResults);
                const allUsersAsObject = Object.fromEntries(allUsers);

                // Save users into storage (to be accessed by the content script injecting the disclaimers)
                chrome.storage.local.set(
                    {
                        [KEY_TWITTER_USERS]: allUsersAsObject,
                        [KEY_LAST_READ_TIME]: DateTime.now().toMillis(),
                    },
                    () => {
                        console.log('Saved users', allUsers.length);
                    }
                );
            });
        });
}

/**
 * Reads all Twitter users we need to display a disclaimer for - from a public
 * Google Spreadsheet
 */
export function readTwitterUsersFromSpreadsheet() {
    // See if we need to read from the spreadsheet again (if enough time has
    // passed since last read time.
    chrome.storage.local.get([KEY_LAST_READ_TIME], (items) => {
        const lastReadTime = DateTime.fromMillis(
            items[KEY_LAST_READ_TIME] || 0
        );
        const diff = DateTime.now().diff(lastReadTime, 'hours');

        console.log(`Last GSheet read time was ${diff.hours} hours ago`);

        if (diff.hours >= READ_TWITTER_USERS_PERIOD_HOURS) {
            console.log('Loading GAPI');

            // Load up the Google APIs - the onGAPILoaded callback will take care
            // of reading from the spreadsheet.
            window.onGAPILoaded = onGAPILoaded;
            loadScript(GAPI_URL);
        }
    });
}
