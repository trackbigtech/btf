import { readTwitterUsersFromSpreadsheet } from './spreadsheets';

// Read Twitter user list on first initialization
readTwitterUsersFromSpreadsheet();

// See if we need to read from the list once an hour max
setInterval(readTwitterUsersFromSpreadsheet, 60 * 60 * 1000);
