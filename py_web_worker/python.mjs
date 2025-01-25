/**
 * @file Utilities for running Python asynchronously in background workers.
 *
 * @summary Asynchronous background Python worker.
 *
 * @version 0.0.1
 *
 * @author David Fritz
 * @copyright 2025 David Fritz
 * @license MIT
 */

import {BackgroundWorker, BackgroundWorkerRuntime} from "./background.mjs";

const installScript = `
import micropip
for package in packages.to_py():
    await micropip.install(package, keep_going=keep_going)
`;

/**
 * Default background worker to handle direct requests to the module.
 *
 * @type {BackgroundWorker|null}
 */
let worker = null;

/**
 * Initialize the default Python background worker to receive requests.
 */
export function init() {
    if (worker) {
        return;
    }
    worker = new BackgroundWorker(import.meta.url);
}

/**
 * Install a bundle file into the default Python worker environment.
 *
 * @param {string} path Path to a bundle file to extract into the worker environment.
 * @param {string} format The format of the bundle/archive. Should be one of the formats recognized by shutil.unpack_archive().
 * @returns {Promise<{error}>} A future that completes when the installation requests have completed.
 *      Contains any captured errors during installation.
 */
export async function installBundle(
    path,
    {
        format = "gztar",
    } = {}
) {
    if (!worker) {
        await init();
    }
    return await worker.run("installBundle", {path, format});
}

/**
 * Install one or more pip packages into the default Python worker environment.
 *
 * @param {string[]} packages Micropip installable packages.
 * @param {boolean} keep_going Whether to tell micropip to keep going on failures, and list all failures.
 * @returns {Promise<{error}>} A future that completes when all the installation requests have completed.
 *      Contains any captured errors during installation.
 */
export async function installPackages(packages, {keep_going = true} = {}) {
    if (!worker) {
        await init();
    }
    return await worker.run("installPackages", {packages, keep_going});
}

/**
 * Execute Python code in the default background worker.
 *
 * @param {string} code The Python code to execute.
 * @param {object} globals Items to place into the global namespace while running.
 * @param {object} locals Items to place into the local namespace while running.
 * @param {object} load_micropip Tell the worker to load the "micropip" package before running the code.
 * @returns {Promise<{result, error}>} A future with the final result and error from running the code.
 */
export async function execute(
    code,
    {
        globals = {},
        locals = {},
        load_micropip = false,
    } = {}
) {
    if (!worker) {
        await init();
    }
    return await worker.run("execute", {
        code,
        globals,
        locals,
        load_micropip,
    });
}

/**
 * Executor for running Python code in an isolated environment.
 */
export class PythonRuntime extends BackgroundWorkerRuntime {
    /**
     * Initialize the Python runtime in preparation for executing Python code.
     *
     * @param {string} pyodideURL Path to the pyodide module.
     * @param {boolean} logErrors Whether to also log Python errors. Always returned in responses.
     */
    constructor(
        {
            pyodideURL = "https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.mjs",
            logErrors = false,
        } = {}
    ) {
        super();
        this.pyodide = null;
        this.pyodideURL = pyodideURL;
        this.logErrors = logErrors;
    }

    /**
     * Load the main Python wasm module and initialize it.
     *
     * @returns {Promise<void>} A future that completes when Python is ready within the current context.
     */
    async init() {
        if (this.pyodide) {
            return;
        }
        const module = await import(this.pyodideURL);
        this.pyodide = await module.loadPyodide();
    }

    /**
     * Execute Python code.
     *
     * @param {string} code The Python code to execute.
     * @param {object} globals Items to place into the global namespace while running.
     * @param {object} locals Items to place into the local namespace while running.
     * @param {object} load_micropip Whether to load the "micropip" package before running the code.
     * @returns {Promise<{result, error}>} A future with the final result and error from running the code.
     */
    async execute(
        {
            code,
            globals = {},
            locals = {},
            load_micropip = false
        } = {}
    ) {
        if (!this.pyodide) {
            await this.init();
        }
        if (load_micropip) {
            await this.pyodide.loadPackage("micropip");
        }
        const dict = this.pyodide.globals.get("dict");
        const pyGlobals = dict(Object.entries(globals));
        const pyLocals = dict(Object.entries(locals));
        let result = await this.pyodide.runPythonAsync(code, {globals: pyGlobals, locals: pyLocals});
        if (result && result.toJs) {
            result = result.toJs({dict_converter: Object.fromEntries});
        }
        return result;
    }

    /**
     * Extract a remote bundle/archive into the Python environment.
     *
     * @param {string} path Path to a bundle file to extract into the worker environment.
     * @param {string} format The format of the bundle/archive. Should be one of the formats recognized by shutil.unpack_archive().
     * @param {string} extractDir The directory to unpack the archive into. Defaults to the working directory.
     * @returns {Promise<void>} A future that completes when the installation requests have completed.
     */
    async extractRemote({path, format = "gztar", extractDir} = {}) {
        if (!path) {
            return;
        }
        if (!this.pyodide) {
            await this.init();
        }
        const response = await fetch(path);
        const buffer = await response.arrayBuffer();
        await this.pyodide.unpackArchive(buffer, format, {extractDir: extractDir});
    }

    /**
     * Install a bundle file into the Python environment.
     *
     * @param {string} path Bundle path to install into the worker
     * @param {string} format The format of the bundle/archive. Should be one of the formats recognized by shutil.unpack_archive().
     */
    async installBundle(
        {
            path,
            format = "gztar",
        } = {}
    ) {
        await this.extractRemote({
            path,
            format,
            extractDir: "/lib/python3.12/site-packages",
        });
    }

    /**
     * Install one or more pip packages into the Python environment.
     *
     * @param {string[]} packages Micropip installable packages.
     * @param {boolean} keep_going Whether to tell micropip to keep going on failures, and list all failures.
     * @returns {Promise<void>} A future that completes when all the installation requests have completed.
     */
    async installPackages({packages = [], keep_going = true} = {}) {
        if (!packages.length) {
            return;
        }
        await this.execute({
            code: installScript,
            locals: {
                packages: packages,
                keep_going: keep_going,
            },
            load_micropip: true,
        });
    }

    onError(id, method, args, error) {
        if (this.logErrors) {
            console.error("Failed to run Python request", id, method, error);
        }
    }
}

if (typeof window !== "undefined") {
    window.Python = (function (module) {
        // Public variables/classes/functions.
        module.PythonRuntime = PythonRuntime;
        module.init = init;
        module.installBundle = installBundle;
        module.installPackages = installPackages;
        module.execute = execute;

        return module;
    })(window.Python || {});
} else if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
    const runtime = new PythonRuntime();
    self.onmessage = async event => self.postMessage(await runtime.run(event.data));
}
