/**
 * @file Utilities for running Pandas queries against a Javascript dataset.
 *
 * @summary Pandas query utilities.
 *
 * @version 1.0.0
 *
 * @author David Fritz
 * @copyright 2025 David Fritz
 * @license MIT
 */

import * as Python from "./python.mjs";

/**
 * Script to run in Python to perform the query with Pandas.
 *
 * @type {string}
 */
const queryScript = `
import pandas
def _query(
    data: pandas.DataFrame,
    query: str,
    local_vars: dict | None = None,
) -> pandas.DataFrame:
    local_vars = local_vars or {'_': None}
    frame = data.query(
        query,
        engine='python',
        local_dict=local_vars,
        global_dict=local_vars,
    )
    return frame
_query(pandas.DataFrame(data.to_py()), query).to_dict('records')
`;

/**
 * Run a query against a dataset using Pandas.
 *
 * @param {string} query The Pandas statement to run against the table.
 * @param {object[]} data The rows to insert into the DataFrame.
 * @returns {object[]} The new results after the query is run.
 */
export async function query(query, data) {
    const {result, error} = await Python.execute(queryScript, {locals: {data, query}});
    if (error) {
        throw Error(error);
    }
    return result;
}

window.Pandas = (function (module) {
    // Public variables/classes/functions.
    module.query = query;

    return module;
})(window.Pandas || {});

/**
 * If using with the DashX interactive table example, add this to a library loaded with the Dash application.
 */
// window.addEventListener("load", async function () {
//     await Python.init();
//     await Python.installPackages(["pandas"]);
//     await Python.execute("import pandas");
//     DashTable.TABLE_FILTERS.default = query;
// });
