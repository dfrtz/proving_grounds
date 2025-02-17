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
  - [Plolty JS Custom Formatters](#plotly-js-custom-formatters)
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
(and more) without any Typescript (uses JS only for React component). The tree can be created in Python or JavaScript,
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
  - Plotly Dash >= 2.18.2 for best performance.
- `dash-table.mjs` installed in `assets` application folder
- [JS Dash Components](js_dash_components) example installed
- JavaScript Module (`.mjs`) support added to `Dash` App
  - Refer to `app.py` example for details on enabling in renderer
- `TableStateContainer` from JavaScript or Python wrapping all child components
  - `{"type": prefix, "index": index}` style ID
  - May contain up to 3 keys for the various `data` configs: original, filtered, and virtual
- Child components within the root for the following (any order, both "id" and "className" attributes required as listed)
  <details>
  <summary>Child component details</summary>

  - Root component, such as a `Div`, with `{"type": f"{prefix}-root", "index": index}` style ID
    - Contains all child elements to allow querying by `className`
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
  - `html.Tr(className=f"{prefix}-heading")`
    - Automatically populates with column titles, selection checkboxes, and sorting icons
  - `dcc.Input(className=f"{prefix}-filter")`
    - Applies text input as a data filter
  - `html.Tbody(className=f"{prefix}-body")`
    - Automatically populates with formatted data and selection checkboxes
  </details>

### Examples

<details>
<summary>Custom Table Formatter</summary>

```javascript
// Place in any JS library loaded with the app.
// Autoload the customizations after all supplemental libraries have loaded.
window.addEventListener("load", function () {
    if (window.dash_table_state.TABLE_FORMATTERS.cool_namespace) {
        return;
    }
    window.dash_table_state.TABLE_FORMATTERS.cool_namespace = {
        default: window.dash_table_state.TABLE_FORMATTERS.default,
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
    if (window.dash_table_state.TABLE_FILTERS.cool_namespace) {
        return;
    }
    window.dash_table_state.TABLE_FILTERS.cool_namespace = {
        default: function (filter, data) {
            try {
                if (filter.trim()) {
                    alasql.tables.data = {data: data};
                    data = alasql(filter);
                }
            } catch {
                // Fallback to basic functionality as a last resort.
                data = window.dash_table_state.TABLE_FILTERS.default(filter, data);
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


### Plotly JS Custom Formatters

#### Overview

Add the ability to use custom number formatters to Plotly graphs.
- **Language(s)**: JavaScript, Bash (helper script to patch Plotly JS)
- **Location**: [JS Plotly Formatter](js_plotly_formatter)

#### Requirements

- Plotly JS compatible browser.
- Docker (to run the patch script, steps can also be followed manually).
  - Add new option(s) to exponent format options.
  - Add override into top of `numFormat`.
- Set `Plotly.numFormatOverride` with custom formatter.

#### Examples

<details>
<summary>Add binary bytes (IEC) formatter</summary>

1. Run the `build_plotly.sh` script to generate a patched `plotly.min.js` (or follow steps in script to patch manually).
```bash
./build_plotly.sh --plotly 3.0.0
```

2. Add format override to any script loaded with window.
```javascript
function formatBinaryBytes(bytes, {precision = 2} = {}) {
  if (bytes === 0) {
    return "0 B";
  }
  const wholeUnit = 1024;
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(wholeUnit));
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  return parseFloat((bytes / Math.pow(wholeUnit, unitIndex)).toFixed(precision)) + " " + units[unitIndex];
}

window.Plotly.numFormatOverride = function (v, ax, fmtoverride, hover) {
  const exponentFormat = fmtoverride || ax.exponentformat || "B";
  if (exponentFormat === "IEC") {
    return formatBinaryBytes(v);
  }
  return null;
};
```

> Full example with IEC formatter can be found at `example.html`. Must generate patched `plotly.js` file to use.
</details>

#### Other Resources

- [Plotly JavaScript](https://plotly.com/javascript/)


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
