/**
 * @file Utilities for creating, downloading, and loading Python web snapshots.
 *
 * @summary Python web snapshot creator.
 *
 * @version 0.0.1
 *
 * @author David Fritz
 * @copyright 2025 David Fritz
 * @license MIT
 */

import {BackgroundWorker, BackgroundWorkerRuntime} from "./background.mjs";
import * as Python from "./python.mjs";

/**
 * Compress an array of bytes.
 *
 * @param {Uint8Array} data Original data to compress.
 * @param {CompressionFormat} format Compression format to use while writing.
 * @returns {Promise<Uint8Array>} Final bytes after compression.
 */
async function compress(data, format = "gzip") {
    const stream = new Response(
        data.buffer
    ).body.pipeThrough(
        new CompressionStream(format)
    );
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decompress an array of bytes.
 *
 * @param {Uint8Array} data Original data to decompress.
 * @param {CompressionFormat} format Compression format to use while reading.
 * @returns {Promise<Uint8Array>} Final bytes after decompression.
 */
export async function decompress(data, format = "gzip") {
    const stream = new Response(
        data.buffer
    ).body.pipeThrough(
        new DecompressionStream(format)
    );
    return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Create and save a file from raw bytes.
 *
 * @param {Uint8Array} data Raw bytes to save to the file.
 * @param {string} file Recommended name to save the file as.
 */
export function download(data, file) {
    const blob = new Blob([data], {type: "application/octet-stream"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", file);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Install packages into an isolated runtime, compress, and return the bundle.
 *
 * @param {string[]} packages Packages to install before collecting.
 * @returns {Promise<Uint8Array|null>} A compressed tarball of the packages installed into site-packages.
 */
async function getSitePackages(packages) {
    const runtime = new Python.PythonRuntime();
    await runtime.init();
    await runtime.installPackages({packages: packages});
    await runtime.execute({
        code: `
    import os
    import tarfile
    directory = "/lib/python3.12/site-packages"
    with tarfile.open("/tmp/site-packages.tgz", "w:gz") as tar:
        tar.add(directory, arcname="")
    `
    });
    return await runtime.readFile({path: "/tmp/site-packages.tgz"});
}

/**
 * Create a snapshot of a Python runtime environment.
 *
 * @param {string[]} packages Packages to install into the environment before snapshot.
 * @param {string} snapPrepScript Additional actions to perform, such as imports, in the environment before snapshot.
 * @param {string} validationScript Actions to run after reloading the snapshot to verify success.
 * @param {function} statusUpdate Where to send status updates representing each step of the snapshot process.
 * @returns {Promise<Uint8Array>} Compressed snapshot that can be reloaded on Python initialization.
 */
export async function makeSnapshot(
    {
        packages = [],
        snapPrepScript = "import sys;",
        validationScript = "import sys;print('sys.version');",
        statusUpdate = console.log,
    } = {},
) {
    const startTime = performance.now();
    let pkgs;
    if (packages && packages.length) {
        statusUpdate("Generating site-packages tarball in isolated runtime for snapshot");
        pkgs = await getSitePackages(packages);
        statusUpdate(`Generated site-packages tarball size ${pkgs.length}`);
    }
    statusUpdate("Creating fresh runtime for snapshot");
    const prepRuntime = new Python.PythonRuntime();
    await prepRuntime.init({_makeSnapshot: true});
    statusUpdate("Created runtime");
    if (pkgs) {
        statusUpdate("Installing site-packages into fresh runtime for snapshot");
        await prepRuntime.extract({data: pkgs, extractDir: "/lib/python3.12/site-packages"});
        statusUpdate("Installed site-packages");
    }
    statusUpdate("Executing preparation script before snapshot");
    await prepRuntime.execute({code: snapPrepScript});
    statusUpdate("Executed preparation script");
    statusUpdate("Capturing snapshot of runtime");
    const snap = prepRuntime.pyodide.makeMemorySnapshot();
    statusUpdate(`Captured snapshot size ${snap.length}`);
    statusUpdate("Compressing snapshot");
    const compressed = await compress(snap);
    statusUpdate(`Compressed snapshot size ${compressed.length}`);
    statusUpdate("Testing validity of snapshot");
    const snapshotRuntime = new Python.PythonRuntime();
    await snapshotRuntime.init({_loadSnapshot: decompress(compressed)});
    await snapshotRuntime.execute({code: validationScript});
    statusUpdate("Tested validity");
    statusUpdate(`Snapshot ready in ${(performance.now() - startTime) / 1000} seconds`);
    return compressed;
}

/**
 * Create a snapshot of a Python runtime environment in a background thread.
 *
 * @param {Object} args Arguments to pass to the background worker. See `makeSnapshot` for full options.
 * @returns {Promise<Uint8Array>} Compressed snapshot that can be reloaded on Python initialization.
 */
export async function makeSnapshotBackground(args = {}) {
    const worker = new BackgroundWorker(import.meta.url);
    return await worker.run("makeSnapshot", args);
}

/**
 * Executor for creating Python snapshots in an isolated environment.
 */
export class PythonSnapshotRuntime extends BackgroundWorkerRuntime {
    /**
     * Create a snapshot of a Python runtime environment.
     *
     * @param {boolean} withStatusUpdate Whether to display status updates for each step of the snapshot process.
     * @param {Object} args Arguments to pass to the background worker. See `makeSnapshot` for full options.
     * @returns {Promise<Uint8Array>} Compressed snapshot that can be reloaded on Python initialization.
     */
    async makeSnapshot({withStatusUpdate = false, ...args} = {}) {
        return await makeSnapshot({
            ...args,
            statusUpdate: withStatusUpdate ? console.log : (msg) => null,
        });
    }
}

if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
    const runtime = new PythonSnapshotRuntime();
    self.onmessage = async event => self.postMessage(await runtime.run(event.data));
}
