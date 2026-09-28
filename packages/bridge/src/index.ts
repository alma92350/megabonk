/**
 * BROWSER-SAFE entry point. Client helpers only.
 *
 * The server lives behind `@megabonk/bridge/server` and is NOT re-exported here
 * on purpose: it imports node:http, and a browser bundle that pulls this module
 * would fail at load with "node:http has been externalized". That is not a
 * theoretical concern — it is exactly what happened when index re-exported both,
 * and it took the whole page down rather than degrading.
 *
 * Rule: anything importable by packages/client belongs in this file.
 */
export * from './client.js';
