# Proving Grounds: Experiments and Examples

A combination of lightweight experiments, examples, and more. Too small for their own project,
but big enough to benefit from more than a gist. Use as is, or expand to meet advanced use cases.

> **Note**: "Projects" within this codebase do not provide guarantees around new features being added
> or bugs being fixed. Bugs and features are addressed on best effort basis.

### Table Of Contents

- [Experiments vs Examples](#experiments-vs-examples)  
- [Projects](#projects)
  - [Background Web Worker Wrapper](#background-web-worker-wrapper)
  - [Dash Clientside Components](#dash-clientside-components)
  - [Dash Customizable Table](#dash-customizable-table)
  - [Pandas Web Query](#pandas-web-query)
  - [Pandas Web Snapshots](#python-web-snapshots)
  - [Python Web Worker](#python-web-worker)

## Experiments vs Examples

- If the project version is < 1.0.0, it is considered an "experiment". It is subject to large, breaking, changes.
- If a version is >= 1.0.0, it is considered "stable". The contracts are guaranteed within the major version branch.


## Projects

### Background Web Worker Wrapper

#### Overview

Simple wrapper for containerizing JS scripts as background as web workers.
- **Language(s)**: JavaScript
- **Location**: [JS Background Worker](js_background_worker)

#### Requirements

- Browser compatible with web workers.
- Browser compatible with whatever code is run in the web worker.

#### Examples

<details>
<summary>Self-contained Background Library</summary>

1. Create a script that:
   - If loaded as a module by the window, creates a worker with: `new BackgroundWorker(import.meta.url);`
   - Or if loaded in a web worker, starts up the runtime event handling with `self.onmessage = async event => self.postMessage(await runtime.run(event.data));`
2. Has a worker runtime subclass of `BackgroundWorkerRuntime` with the available methods to run.

**myscript.mjs**
```javascript
import {BackgroundWorker, BackgroundWorkerRuntime} from "./background.mjs";

let worker = null;

async function bgRun(count) {
    if (!worker) {
        worker = new BackgroundWorker(import.meta.url);
    }
    const total = document.getElementById("total");
    const result = await worker.run("expensive", {count});
    total.innerHTML = result.result;
}

export class Runtime extends BackgroundWorkerRuntime {
    async expensive({count = 10} = {}) {
        console.log(`Starting cumulative count to ${count} in background`)
        let total = 0;
        for (let i = 0; i < count; i++) {
            total += i;
        }
        console.log(`Finished cumulative count to ${count} in background`)
        return total;
    }
}

if (typeof window !== "undefined") {
    window.bgRun = bgRun
} else if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
    const runtime = new Runtime();
    self.onmessage = async event => self.postMessage(await runtime.run(event.data));
}
```

**index.html**:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <script src="/background.mjs" type="module"></script>
    <script src="/myscript.mjs" type="module"></script>
</head>
<body>
<button onclick="bgRun(1000000000)">Cumulative Count to 1 Billion</button>
<br/>
<div id="total"></div>
</body>
</html>
```
</details>


### Dash Clientside Components

#### Overview

Create Plotly Dash components in JavaScript instead of Python. Supports `dash.html` and `dash.dcc`,
but can be expanded to support any Dash namespace.
- **Language(s)**: JavaScript
- **Location**: [JS Dash Components](js_dash_components)

#### Requirements

- Plotly Dash application
- `dashx.mjs` installed in `assets` application folder

#### Examples

<details>
<summary>Python App w/ Clientside Callback</summary>

**app.py**
```python
import dash
from dash import Input
from dash import Output
from dash import html

app = dash.Dash(__name__)

app.layout = html.Div(
    [
        html.Button("Press to load JS component", id="button"),
        html.Div("Hello World From Python!", id="container"),
    ]
)

app.clientside_callback(
    """
    function press(nClicks) {
        return Dash.html.Div({children: `Hello World From JS! ${nClicks} Clicks.`});
    }""",
    Output("container", "children"),
    Input("button", "n_clicks"),
    prevent_initial_call=True,
)

if __name__ == "__main__":
    app.run_server(debug=True)
```
</details>

<details>
<summary>JS Function w/ Wait For Ready</summary>

**app.py**
```javascript
async function onLoad() {
    // Wait on instantly run JS code to ensure Dash libraries have loaded.
    await Dash.ready;
    return Dash.html.Div({children: "Dash JS libraries ready."});
}
```
</details>

#### Other Resources

- [Plotly Dash](https://dash.plotly.com/)
- [Original gist](https://gist.github.com/dfrtz/b7787e8cafc6329fcab627de4f88d03b)


### Dash Customizable Table

100% JS alternative to Plotly Dash DataTable, with full control over filtering and formatting.

Uses standard HTML component trees, `MATCH` based callbacks, and `dash_clientside` to perform the same behaviors
(and more) without any Typescript or custom React components. The tree can be created in Python or JavaScript,
as long as the required components are added.

Also provides a general example for other custom "State" type classes that can be used to make JavaScript
based components without an NPM setup.

- **Language(s)**: JavaScript
- **Location**: [JS Dash Table](js_dash_table)

**Supports**
- Pagination
- Filtering
- Sorting (asc, desc, and multi)
- Row selection (single, multi)
- Column selection (single, multi)
- Callbacks on selection/filtering changes

#### Requirements

- Plotly Dash application (example included as `app.py`)
- `dash-table.mjs` installed in `assets` application folder
- [JS Dash Components](js_dash_components) example installed
- Per table
  - 1x clientside callback to register the table state
  - 1x root component with `{"type": f"{prefix}-root", "index": index}` style ID
- Child components within the root for the following (any order, both "id" and "className" required as listed)
  <details>
  <summary>Child component details</summary>

  - `dcc.Input(id={"type": f"{prefix}-loader", "index": index}, type="hidden", value=True)`
    - Triggers initial clientside callback to registry table state
    - Should not be used for any other purpose than initial callback to set up
  - `dcc.Store(id={"type": f"{prefix}-config", "index": index}, data=config)`
    - Stores the full configuration to set up the table, and detect changes
  - `dcc.Store(id={"type": f"{prefix}-data", "index": index}, data={"original": data})`
    - Stores the full data to set up the table, and detect changes
    - Contains 3 keys for the various states: original, filtered, and virtual
  - `html.Span(className=f"{prefix}-current-count")`
    - Auto-updates the currently visible range of items
  - `html.Span(className=f"{prefix}-total-count")`
    - Auto-updates the total available items
  - `html.Button(className=f"{prefix}-prev-btn")`
    - Triggers previous page of items
  - `html.Button(className=f"{prefix}-next-btn")`
    - Triggers next page of items
  - `html.Table(className=f"{prefix}-table")`
    - Updates selection checkboxes and highlights on user interaction
  - `html.Tr(id={"type": f"{prefix}-heading", "index": index})`
    - Automatically populates with column titles, selection checkboxes, and sorting icons
  - `dcc.Input(className=f"{prefix}-filter")`
    - Applies text input as a data filter
  - `html.Tbody(id={"type": f"{prefix}-body", "index": index})`
    - Automatically populates with formatted data and selection checkboxes
  </details>

### Examples

<details>
<summary>Custom Table Formatter</summary>

```javascript
// Place in any JS library loaded with the app.
// Autoload the customizations after all supplemental libraries have loaded.
window.addEventListener("load", function () {
    if (DashTable.TABLE_FORMATTERS.cool_namespace) {
        return;
    }
    DashTable.TABLE_FORMATTERS.cool_namespace = {
        default: DashTable.TABLE_FORMATTERS.default,
        percentage: (raw) => `${(raw * 100).toFixed(2)}%`,
    };
});
```
</details>

<details>
<summary>Custom Table Filter</summary>

```javascript
// Place in any JS library loaded with the app.
// Include "alasql.js" from https://github.com/AlaSQL/alasql in app assets for this filtering example.
// Autoload the customizations after all supplemental libraries have loaded.
window.addEventListener("load", function () {
    if (DashTable.TABLE_FILTERS.cool_namespace) {
        return;
    }
    DashTable.TABLE_FILTERS.cool_namespace = {
        default: function (filter, data) {
            try {
                if (filter.trim()) {
                    alasql.tables.data = {data: data};
                    data = alasql(filter);
                }
            } catch {
                // Fallback to basic functionality as a last resort.
                data = DashTable.TABLE_FILTERS.default(filter, data);
            }
            return data;
        }
    };
});
```
</details>

#### Other Resources

- [Plotly Dash](https://dash.plotly.com/)
- [Original gist](https://gist.github.com/dfrtz/5b94dc6df48b80bed87ff257b114e173)


### DuckDB Web Query

#### Overview

Use DuckDB to filter JavaScript arrays.
- **Language(s)**: JavaScript
- **Location**: [JS DuckDB](js_duckdb)

#### Requirements

- Browser compatible with DuckDB WASM.

#### Examples

<details>
<summary>DuckDB Query Execution</summary>

```javascript
import {query} from "./duckdb.mjs";

console.log(
    await query(
        'select * from data where percentage > .6',
        [
            {"Name": "a", "Percentage": 0.5},
            {"Name": "b", "Percentage": 0.99},
        ]
    )
);
```
</details>

#### Other Resources

- [DuckDB](https://duckdb.org/docs/sql/introduction.html)
- [Original gist](https://gist.github.com/dfrtz/7a72a36bc4d88535a00e2da0ee0635e7)


### Pandas Web Query

#### Overview

Use Pandas to filter JavaScript arrays.
- **Language(s)**: JavaScript, Python
- **Location**: [JS Pandas](js_pandas)

#### Requirements

- [Background Web Worker Wrapper](#background-web-worker-wrapper) example installed.
- [Python Web Worker](#python-web-worker) example installed.

#### Examples

<details>
<summary>Pandas Query Execution</summary>

```javascript
import {query} from "./pandas.mjs";

console.log(
    await query(
        'Name == "a"',
        [
            {"Name": "a", "Percentage": 0.5},
            {"Name": "b", "Percentage": 0.99},
        ]
    )
);
```
</details>

#### Other Resources

- [Pandas](https://pandas.pydata.org/docs/user_guide/index.html)
- [Original gist](https://gist.github.com/dfrtz/4f90f77dd8046c299f62b59a6638517e)


### Python Web Snapshots

#### Overview

Create Python web snapshots to optimize loading, reuse, and consistency across user environments.
- **Language(s)**: JavaScript, Python
- **Location**: [Python Web Snapshot](py_web_snapshot)

#### Requirements

- [Background Web Worker Wrapper](#background-web-worker-wrapper) example installed.
- [Python Web Worker](#python-web-worker) example installed.

#### Examples

<details>
<summary>Use the example wizard</summary>

1. Serve the page locally: `python -m http.server`
2. Visit and follow the steps from: http://127.0.0.1:8000/wizard.html
</details>

<details>
<summary>Create and download a snapshot manually</summary>

```javascript
import {download, makeSnapshotBackground} from "./python-snapshot.mjs";

const {result, error} = await makeSnapshotBackground({
    packages: ["pandas"],
    snapPrepScript: "import pandas",
    validationScript: "import pandas;print(pandas.__version__)",
});
download(result, "snapshot.bin.gz");
```
</details>

<details>
<summary>Load a snapshot</summary>

```javascript
import * as Python from "./python.mjs";
import {decompress} from "./python-snapshot.mjs";

const response = await fetch("./snapshot.bin.gz");
const arrayBuffer = await response.arrayBuffer();
const uint8Array = new Uint8Array(arrayBuffer);
const snapshot = decompress(uint8Array);
const runtime = new Python.PythonRuntime();
await runtime.init({_loadSnapshot: snapshot});
```
</details>

#### Other Resources

- [Pyodide](https://pyodide.org/)


### Python Web Worker

#### Overview

Run python code in a background web worker.
- **Language(s)**: JavaScript, Python
- **Location**: [Python Web Worker](py_web_worker)

#### Requirements

- [Background Web Worker Wrapper](#background-web-worker-wrapper) example installed.
- Browser compatible with Pyodide WASM.

#### Examples

<details>
<summary>Python Setup and Execution</summary>

**myscript.mjs**
```javascript
import * as Python from "./python.mjs";

async function main() {
    Python.init();
    const result = await Python.execute(`
    import sys
    print('Initialized Python:', sys.version)
    sys.version
    `);
    const msg = document.getElementById("msg");
    msg.innerHTML = `Initialized Python: ${result.result}`;
}

await main();
```

**index.html**:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <script src="/background.mjs" type="module"></script>
    <script src="/experiments.mjs" type="module"></script>
</head>
<body>
<div id="msg"></div>
</body>
</html>
```
</details>

#### Other Resources

- [Pyodide](https://pyodide.org/)
- [Original gist](https://gist.github.com/dfrtz/0cd04ab201677f390c09fd952d15df00)
