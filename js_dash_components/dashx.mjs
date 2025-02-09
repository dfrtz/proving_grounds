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
export const dccElements = [];
export const html = [];
export const htmlElements = [];
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

/**
 * Create an HTML element based on Plotly Dash syntax.
 *
 * @param {string} tagName Type of HTML component. Must be found in the namespace. i.e. Div
 * @param {object} propTypes Available component properties and their types.
 * @param {object} props Properties to set on the component.
 * @returns {HTMLElement} Final object usable as a child component on Dash properties.
 */
function toElement(tagName, propTypes, props) {
    const available = Object.keys(propTypes);
    for (const key of Object.keys(props)) {
        if (!available.includes(key)) {
            throw new TypeError(`Property ${key} is not valid for ${name} ${tagName} elements.`);
        }
    }
    const element = document.createElement(tagName.toLowerCase());
    const id = props.id;
    if (id) {
        element.id = typeof id === "string" ? id : JSON.stringify(id);
    }
    if (props.className) {
        element.className = props.className;
    }
    const style = props.style;
    if (style && Object.keys(style).length) {
        Object.assign(element.style, style);
    }
    const children = props.children;
    if (children) {
        element.replaceChildren(...(Array.isArray(children) ? children : [children]));
    }
    for (const [key, value] of Object.entries(props)) {
        if (key === "id" || key === "className" || key === "style" || key === "children") {
            continue;
        }
        element.setAttribute(key, value);
    }
    return element;
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
        htmlElements[key] = (props = {}) => toElement(key, propTypes, props);
    }
    for (const [key, component] of Object.entries(dash_core_components)) {
        const propTypes = component.propTypes;
        if (!propTypes) {
            continue;
        }
        dcc[key] = (props = {}) => toComponent("dash_core_components", key, propTypes, props);
        dccElements[key] = (props = {}) => toElement(key, propTypes, props);
    }
    readyResolve(true);
});

window.Dash = (function (module) {
    // Dash submodules.
    module.dcc = dcc;
    module.dccElements = dccElements;
    module.html = html;
    module.htmlElements = htmlElements;
    module.ready = ready;

    return module;
})(window.Dash || {});
