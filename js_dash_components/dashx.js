/**
 * @file A collection of functions used to create Plotly Dash React components from clientside operations.
 *
 * @summary Plotly Dash component creation library.
 *
 * @version 1.0.0
 *
 * @author David Fritz
 * @copyright 2025 David Fritz
 * @license MIT
 */

export const dcc = [];
export const html = [];
let readyResolve;
export const ready = new Promise(res => readyResolve = res);

/**
 * Create a Plotly Dash component.
 *
 * @param {string} namespace Element namespace corresponding to Dash libraries. i.e. dash_html_components
 * @param {string} type Type of HTML component. Must be found in the namespace. i.e. Div
 * @param {object} propTypes Available component properties and their types.
 * @param {object} props Properties to set on the component.
 * @returns {object} Final object usable as a child component on Dash properties.
 */
function toComponent(namespace, type, propTypes, props) {
    const available = Object.keys(propTypes);
    for (const key of Object.keys(props)) {
        if (!available.includes(key)) {
            throw new TypeError(`Property ${key} is not valid for ${name} ${type} components.`);
        }
    }
    return {
        namespace: namespace,
        type: type,
        props: props,
    };
}

// Populate the component libraries after all Dash libraries have loaded.
// This must be loaded after window load, since Dash libraries are placed in the footer after all client libraries.
window.addEventListener("load", function () {
    if (Object.keys(dcc).length) {
        return;
    }
    for (const [key, component] of Object.entries(dash_html_components)) {
        const propTypes = component.propTypes;
        if (!propTypes) {
            continue;
        }
        html[key] = (props = {}) => toComponent("dash_html_components", key, propTypes, props);
    }
    for (const [key, component] of Object.entries(dash_core_components)) {
        const propTypes = component.propTypes;
        if (!propTypes) {
            continue;
        }
        dcc[key] = (props = {}) => toComponent("dash_core_components", key, propTypes, props);
    }
    readyResolve(true);
});

window.Dash = (function (module) {
    // Dash submodules.
    module.dcc = dcc;
    module.html = html;
    module.ready = ready;

    return module;
})(window.Dash || {});
