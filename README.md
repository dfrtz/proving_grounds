# Proving Grounds: Experiments and Examples

A combination of lightweight experiments, examples, and more. Too small for their own project,
but big enough to benefit from more than a gist. Use as is, or expand to meet advanced use cases.

> **Note**: "Projects" within this codebase do not provide guarantees around new features being added
or bugs being fixed. Bugs and features are addressed on best effort basis.

### Table Of Contents

- [Experiments vs Examples](#experiments-vs-examples)  
- [Projects](#projects)
  - [Background Web Worker Wrapper](#background-web-worker-wrapper)
  - [Dash Clientside Components](#dash-clientside-components)
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

Create Plotly Dash components in Javascript instead of Python. Supports `dash.html` and `dash.dcc`,
but can be expanded to support any Dash namespace
- **Language(s)**: JavaScript
- **Location**: [JS Dash Components](js_dash_components)

#### Requirements
- Plotly Dash application

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