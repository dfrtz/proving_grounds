/**
 * @file Utilities for running DuckDB queries against a JavaScript dataset.
 *
 * @summary DuckDB query utilities.
 *
 * @version 1.0.0
 *
 * @author David Fritz
 * @copyright 2025 David Fritz
 * @license MIT
 */

// Arrow format must match the version used by duckdb-wasm, or table creation will not work.
// To see the arrow version, open duckdb in a browser, and check the import.
import {tableFromJSON} from "https://cdn.jsdelivr.net/npm/apache-arrow@17.0.0/+esm";
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";

// EOS signal according to Arrow IPC streaming format
// See https://arrow.apache.org/docs/format/Columnar.html#ipc-streaming-format
const EOS = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 0]);

const duckdbReadyPromise = initDuckDB();

/**
 * Initialize the DuckDB database instance.
 *
 * @returns {Promise<duckdb.AsyncDuckDB>}
 */
async function initDuckDB() {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    const worker_url = URL.createObjectURL(
        new Blob(
            // Disable console logging in worker due to invalid queries being logged as standard messages.
            // During live filtering, this floods the console while users are typing out messages.
            [`console.log = function() {}; importScripts("${bundle.mainWorker}");`],
            {type: "text/javascript"},
        )
    );
    const worker = new Worker(worker_url);
    // Use VoidLogger, ConsoleLogger is very noisy for basic operations, even with console.log squashed in the worker.
    const logger = new duckdb.VoidLogger();
    const database = new duckdb.AsyncDuckDB(logger, worker);
    await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);
    return database;
}

/**
 * Run a query against a dataset using DuckDB.
 *
 * @param {string} query The SQL statement to run against the table.
 * @param {object[]} data The rows to insert into the database.
 * @param {any[]} params Optional parameters to insert into the statement.
 * @returns {object[]} The new results after the query is run.
 */
export async function query(query, data, params = null) {
    const duckdb = await duckdbReadyPromise;
    const conn = await duckdb.connect();

    // Use Apache Arrow as the backend table, instead of DuckDB native inserts, to preserve column ordering.
    const arrowTable = tableFromJSON(data);

    let results = [];
    try {
        await conn.insertArrowTable(arrowTable, {name: "data"});
        await conn.insertArrowTable(EOS, {name: "data"});
        const stmt = await conn.prepare(query)
        results = (await stmt.query(...(params || []))).toArray().map(row => row.toJSON());
    } finally {
        await conn.query("DROP TABLE data")
        await conn.close();
    }
    return results;
}

window.DuckDB = (function (module) {
    // Public variables/classes/functions.
    module.query = query;

    return module;
})(window.DuckDB || {});

/**
 * If using with the TableStateContainer interactive table example, add this to a library loaded with the Dash application.
 */
// window.addEventListener("load", async function () {
//     window.dash_table_state.TABLE_FILTERS.default = query;
// });
