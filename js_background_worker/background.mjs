/**
 * @file Utilities for running operations asynchronously in background workers.
 *
 * @summary Asynchronous background worker.
 *
 * @version 1.0.0
 *
 * @author David Fritz
 * @copyright 2025 David Fritz
 * @license MIT
 */

/**
 * Container for tracking a background worker, and exchanging work requests/results asynchronously.
 */
export class BackgroundWorker {
    /**
     * Initialize the worker to run tasks in the background.
     *
     * @param scriptURL Path to the script to load into the background worker.
     */
    constructor(scriptURL) {
        this.worker = new Worker(scriptURL, {type: "module"});
        this.lastID = 1;
    }

    /**
     * Create a new ID to uniquely identify a request exchanged with the background worker.
     *
     * @returns {number} ID to track a request to a worker, and the response from the worker.
     */
    generateRequestID() {
        if (this.lastID === Number.MAX_SAFE_INTEGER) {
            this.lastID = 1;
        }
        return this.lastID++;
    }

    /**
     * Run a method in the background.
     *
     * @param {string} method The name of the method name to run in the background.
     * @param {Object} args Arguments to send to the method.
     * @returns {Promise<{result, error}>} A future that completes with the result, and any error, from the method.
     */
    run(method, args = {}) {
        let resolve;
        const promise = new Promise(res => resolve = res);
        const requestID = this.generateRequestID();
        const self = this;

        function listener(event) {
            if (event.data?.id !== requestID) {
                return;
            }
            self.worker.removeEventListener("message", listener);
            const {id, ...rest} = event.data;
            resolve(rest);
        }

        this.worker.addEventListener("message", listener);
        this.worker.postMessage({id: requestID, method, args});
        return promise;
    }
}

/**
 * Base for running dynamic requests from a BackgroundWorker.
 */
export class BackgroundWorkerRuntime {
    /**
     * Handle and error before returning the message to the caller.
     *
     * @param {number} id ID of the original request.
     * @param {string} method Name of the method which threw the error.
     * @param {Object} args Arguments sent to the method.
     * @param {Error} error The error that caused the method to exit unexpectedly.
     */
    onError(id, method, args, error) {
        console.error("Failed to run request", id, method, error);
    }

    /**
     * Run a dynamic request and return the response.
     *
     * @param {Object} request Dynamic request body.
     * @param {number} request.id Unique identifier for this request.
     * @param {string} request.method Name of the method to run.
     * @param {Object} request.args Arguments to pass into the method.
     * @returns {Promise<{result, error}>} Final response from the method with the ID if provided in the request.
     */
    async run(request) {
        const {id, method, args} = request;
        const response = {id, result: null, error: null};
        try {
            const runner = this[method];
            if (runner) {
                response.result = (await this[method](args));
            }
        } catch (error) {
            this.onError(id, method, args, error);
            response.error = error.message;
        }
        return response;
    }
}
