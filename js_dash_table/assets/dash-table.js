/**
 * @file Utilities for creating interactive tables with native Plotly Dash components.
 *
 * @summary State for interactive tables.
 *
 * @version 1.0.0
 *
 * @author David Fritz
 * @copyright 2025 David Fritz
 * @license MIT
 */

var DashTable = (function (module) {
    const TABLE_FILTERS = {
        default: async function (filter, data) {
            const splits = filter.match(/"[^"]*"|\S+/g);
            if (splits.length < 3) {
                throw new Error("Filter must have a key, operation, and value.");
            } else if (splits.length > 3) {
                throw new Error("Filter must only contain a key, operation, and value.");
            }
            let [key, operation, value] = splits;
            key = key.replace(/^["']|["']$/g, '')
            return data.filter((item) => {
                switch (operation) {
                    case ">":
                        return item[key] > value;
                    case ">=":
                        return item[key] >= value;
                    case "<":
                        return item[key] < value;
                    case "<=":
                        return item[key] <= value;
                    case "=":
                    case "==":
                        return item[key] === value;
                    case "!=":
                    case "!==":
                        return item[key] !== value;
                    default:
                        throw new Error(`Unknown operation: ${operation}`);
                }
            });
        }
    };
    const TABLE_FORMATTERS = {
        default: function (raw, {} = {}) {
            return String(raw);
        }
    };

    /**
     * State for displaying information, and tracking user interactions, with native JavaScript and HTML tables.
     *
     * Similar to a custom React component with the "state" and "props", but leverages native component trees using
     * standard Plotly Dash components.
     */
    class TableState {
        /**
         * Initialize the interactive table state.
         *
         * @param {object} config Configuration for the table, including columns and selections.
         *      See defaults for full list of available options.
         * @param {object} data Collection of datasets used by the table.
         * @param {object} data.original Original data before any views are made.
         *      Reused when filter changes, and cached as `filtered`.
         * @param {object|null} data.filtered Initial data representing a filtered view of the original data.
         *      Reused when sorting order changes, and stored as `virtual`.
         * @param {object|null} data.virtual Initial data representing the final filtered/sorted view of the original data.
         *      Reused when pages change. No additional views should be made from this data.
         */
        constructor(config, data) {
            // Update and store config and data as objects to ensure changes are able to sent to property callbacks.
            // Preserve snake_case names for maximum Python cross-compatibility and consistency.
            const defaults = {
                id_prefix: "info-table",
                page: 0,
                page_size: 10,
                sort_by: [],
                sort_mode: "single",
                row_selectable: "multi",
                row_index_key: "row_index",
                selected_rows: [],
                column_selectable: "multi",
                selected_columns: [],
                filter_namespace: "default",
                filter_action: "native",
                format_namespace: "default",
                format: "default",
                columns: {},
                column_sort_icon: "⏶",
                verbosity: 0,
            };
            this.config = {...defaults, ...config};
            if (Array.isArray(this.config.columns)) {
                const columns = this.config.columns;
                this.config.columns = {
                    original: columns,
                    filtered: columns.slice(),
                    virtual: columns.slice(),
                };
            }
            for (const columns of Object.values(this.config.columns)) {
                for (const column of columns) {
                    if (column["name"] === undefined) {
                        column["name"] = column["id"];
                    }
                    if (column["visible"] === undefined) {
                        column["visible"] = true;
                    }
                    if (column["selectable"] === undefined) {
                        column["selectable"] = Boolean(this.config.column_selectable);
                    }
                }
            }
            // Populate any missing datasets in place to ensure their values are visible to callbacks.
            this.data = data;
            data.original = data.original || [];
            data.filtered = data.filtered || [];
            data.virtual = data.virtual || [];

            // The remainder of state values are only stored locally, and never exchanged with servers or callbacks.
            const prefix = this.config.id_prefix;
            const tableIndex = dash_clientside.callback_context.inputs_list[0].id.index;
            this.root = document.getElementById(`{"index":"${tableIndex}","type":"${prefix}-root"}`);
            this.table = this.root.getElementsByClassName(`${prefix}-table`)[0];
            this.table.state = this; // Attach this object to the HTML element to tie their lifecycles together.
            this.tableIndex = tableIndex;
            this.filter = this.root.getElementsByClassName(`${prefix}-filter`)[0];
            this.prevBtn = this.root.getElementsByClassName(`${prefix}-prev-btn`)[0];
            this.nextBtn = this.root.getElementsByClassName(`${prefix}-next-btn`)[0];
            this.currentCount = this.root.getElementsByClassName(`${prefix}-current-count`)[0]
            this.totalCount = this.root.getElementsByClassName(`${prefix}-total-count`)[0]
            this.lastVirtualization = [];
            this.pendingConfigChange = true;
            this.pendingHeaderChange = true;

            // Update the initial layout for the table.
            this.update();

            // Add callbacks for the interactive elements to update the contents.
            this.root.onclick = (event) => this.onClick(event);
            this.filter.addEventListener("input", (event) => this.onFilterChange(event));
        }

        /**
         * Update table configurations and elements based on user buttons presses, such as next and previous buttons.
         *
         * @param {Event} event Click event that occurred within the table on a button.
         */
        clickButton(event) {
            const prefix = this.config.id_prefix;
            let page = this.config.page;
            if (event.target.classList.contains(`${prefix}-prev-btn`) && page > 0) {
                page--;
            } else if (event.target.classList.contains(`${prefix}-next-btn`) && page < this.getLastPage()) {
                page++;
            }
            if (page !== this.config.page) {
                this.config.page = page;
                this.pendingConfigChange = true;
            }
        }

        /**
         * Update table configurations and elements based on user checkbox toggles, such as row and column selections.
         *
         * @param {Event} event Click event that occurred within the table on a checkbox.
         */
        clickCheckbox(event) {
            const prefix = this.config.id_prefix;
            const fullID = JSON.parse(event.target.id);
            const type = fullID["type"];
            const index = parseInt(fullID["index"].split(/[^0-9]+/).pop());
            if (type === `${prefix}-column-check`) {
                this.updateSelections(
                    this.config.selected_columns,
                    index,
                    {mode: this.config.column_selectable}
                );
                this.pendingConfigChange = true;
            } else if (type === `${prefix}-row-check`) {
                this.updateSelections(
                    this.config.selected_rows,
                    this.getPaginatedItem(index)[this.config.row_index_key],
                    {mode: this.config.row_selectable}
                );
                this.pendingConfigChange = true;
            }
        }

        /**
         * Update table configurations and elements based on user column header clicks.
         *
         * @param {Event} event Click event that occurred within the table on a table column header.
         */
        clickColumn(event) {
            const fullID = JSON.parse(event.target.id);
            const index = parseInt(fullID["index"].split(/[^0-9]+/).pop());
            const key = this.config.columns.virtual[index]["name"];
            const sortBy = this.config.sort_by || [];
            const includes = sortBy.findIndex(sorter => sorter["key"] === key);
            if (includes !== -1) {
                const sorter = sortBy[includes];
                if (sorter["order"] === "desc") {
                    sortBy.splice(sortBy.indexOf(includes), 1);
                } else {
                    sorter["order"] = "desc";
                }
            } else {
                if (this.config.sort_mode === "single") {
                    sortBy.splice(0, sortBy.length);
                }
                sortBy.push({"key": key, "order": "asc"});
            }
            this.pendingConfigChange = true;
            this.pendingHeaderChange = true;
        }

        /**
         * Create the column headers summarizing the table contents
         *
         * @returns {object[]} Components to place into the header row of the table.
         */
        getColumns() {
            const prefix = this.config.id_prefix;
            const rowSelectable = Boolean(this.config.row_selectable);
            const columnSelectable = Boolean(this.config.column_selectable);
            const sortBy = this.config.sort_by;
            const columnHeaders = [
                Dash.html.Th({className: rowSelectable ? null : "hidden"})
            ];
            for (const [colIndex, col] of this.config.columns.virtual.entries()) {
                const index = `${this.tableIndex}-${colIndex}`;
                const sortIncludes = sortBy.findIndex(sorter => sorter["key"] === col["name"]);
                let sortClasses = "";
                if (sortIncludes !== -1) {
                    sortClasses += " is-sorted";
                    if (sortBy[sortIncludes]["order"] === "desc") {
                        sortClasses += " is-sorted-desc";
                    }
                }
                columnHeaders.push(
                    Dash.html.Th({
                        id: {"type": `${prefix}-column-sort`, "index": index},
                        className: "is-sortable" + sortClasses,
                        children: Dash.html.Div({
                            id: {"type": `${prefix}-columns`, "index": index},
                            className: `${prefix}-columns` + (rowSelectable ? "" : " row-selection-disabled"),
                            style: {"display": "flex", "userSelect": "none"},
                            children: [
                                Dash.dcc.Input({
                                    id: {"type": `${prefix}-column-check`, "index": index},
                                    className: `${prefix}-column-check` +
                                        (col["selectable"] && columnSelectable ? "" : " hidden"),
                                    type: "checkbox",
                                }),
                                Dash.html.Div({
                                    style: {"pointerEvents": "none"},
                                    children: [
                                        Dash.html.Span({
                                            className: `${prefix}-column-title`,
                                            children: col["name"].toString()
                                        }),
                                        Dash.html.Div({
                                            className: "sort-icon-container",
                                            style: {"display": "inline-block"},
                                            children: this.config.column_sort_icon,
                                        })
                                    ]
                                })
                            ]
                        }),
                    })
                );
            }
            return columnHeaders;
        }

        /**
         * Create the rows containing the full table details.
         *
         * @returns {object[]} Components to place into the body of the table, representing all rows.
         */
        getRows() {
            // Select only the items that should be visible for the current page.
            const page = this.config.page || 0;
            const pageSize = this.config.page_size || 10;
            const firstRow = page * pageSize;
            const viewableData = this.data.virtual.slice(firstRow, firstRow + pageSize);

            const prefix = this.config.id_prefix;
            const columns = this.config.columns.virtual || [];
            const rows = [];
            const rowSelectable = Boolean(this.config.row_selectable);

            const defaultNamespace = TABLE_FORMATTERS[this.config.format_namespace] || {};
            const formatters = {
                default: defaultNamespace[this.config.format] || defaultNamespace.default || TABLE_FORMATTERS.default,
            };
            const formatterArgs = {};
            for (const column of columns) {
                const columnName = column["name"];
                const namespace = TABLE_FORMATTERS[column["format_namespace"]] || formatters;
                formatters[columnName] = namespace[column["format"]] || namespace.default;
                formatterArgs[columnName] = {...(column["format_args"] || {}), verbosity: this.config.verbosity};
            }

            for (const [rowIndex, values] of viewableData.entries()) {
                const index = `${this.tableIndex}-${rowIndex}`;
                const cells = [];
                for (const column of columns) {
                    if (!column["visible"]) {
                        continue;
                    }
                    const name = column["name"];
                    let value = values[name];
                    try {
                        value = (formatters[name] || formatters.default)(values[name], (formatterArgs[name] || {}));
                        value = value.toString().split(/\n/g);
                        if (value.length > 1) {
                            value = value.flatMap((value, index, array) =>
                                array.length - 1 !== index ? [value, Dash.html.Br()] : value
                            );
                        }
                    } catch {
                        console.error(`Failed to apply value formatting, showing raw value: ${name} ${rowIndex} ${value}`);
                        value = String(value);
                    }
                    cells.push(
                        Dash.html.Td({
                            className: (rowSelectable ? "" : "row-selection-disabled ") + (column["align"] || "left"),
                            children: Dash.html.Span({className: "data-cell", children: value}),
                        }),
                    );
                }
                rows.push(
                    Dash.html.Tr({
                        className: "data-row",
                        children: [
                            Dash.html.Td({
                                className: rowSelectable ? "" : "hidden",
                                children: Dash.dcc.Input({
                                    id: {"type": `${prefix}-row-check`, "index": index},
                                    className: `${prefix}-row-check`,
                                    type: "checkbox",
                                }),
                            }),
                            ...cells,
                        ],
                    })
                );
            }
            return rows;
        }

        /**
         * Find the last available page for display to users.
         *
         * @returns {number} The index of the last available page from the virtual data.
         */
        getLastPage() {
            const pageSize = this.config.page_size;
            const data = this.data.virtual
            let pageCount = data.length === pageSize ? 1 : data.length / pageSize | 0;
            if (data.length % pageSize !== 0) {
                pageCount++;
            }
            return pageCount - 1;
        }

        /**
         * Find the item representing a specific index in the visible table.
         *
         * @param {number} index Position of a visible row.
         * @returns {number} The item from the virtual data representing the selected row on the current page.
         */
        getPaginatedItem(index) {
            return this.data.virtual[this.config.page * this.config.page_size + index];
        }

        /**
         * Update table configurations and elements based on user clicks on interactive elements.
         *
         * @param {Event} event Click event that occurred within a table.
         */
        onClick(event) {
            if (event.target.type === "checkbox") {
                this.clickCheckbox(event);
            } else if (event.target.classList.contains(`${this.config.id_prefix}-columns`)) {
                this.clickColumn(event);
            } else if (event.target.type === "submit") {
                this.clickButton(event);
            }
            if (this.pendingConfigChange || this.pendingHeaderChange) {
                this.update();
            }
        }

        /**
         * Update table configurations and elements based on user input.
         *
         * @param {Event} event Input update event that occurred on the filter component.
         */
        onFilterChange(event) {
            this.config.filter = event.target.value;
            this.pendingConfigChange = true;
            this.update();
        }

        /**
         * Sort table data in-place by one or more keys, and ascending or descending order.
         *
         * @param {object[]} sortBy One or more configurations to sort data by.
         * @param {object[]} sortBy.key Key from the object to sort values by.
         * @param {object[]} sortBy.order Order to sort on the key by. e.g., "asc" or "desc".
         */
        sortData(sortBy) {
            this.data.virtual.sort((first, second) => {
                for (const sorter of sortBy) {
                    const key = sorter.key;
                    const order = sorter.order || "asc";
                    if (first[key] < second[key]) {
                        return order === "asc" ? -1 : 1;
                    } else if (first[key] > second[key]) {
                        return order === "asc" ? 1 : -1;
                    }
                }
                return 0;
            });
        }

        /**
         * Update the React properties and rendered elements using the latest configration state.
         */
        async update() {
            await Dash.ready;
            const prefix = this.config.id_prefix;
            await this.updateData();
            if (this.pendingConfigChange) {
                this.pendingConfigChange = false;
                dash_clientside.set_props(
                    {"index": this.tableIndex, "type": `${prefix}-config`},
                    {"data": this.config}
                );
            }
            if (this.pendingHeaderChange) {
                this.pendingHeaderChange = false;
                dash_clientside.set_props(
                    {"index": this.tableIndex, "type": `${prefix}-heading`},
                    {"children": this.getColumns()},
                );
            }
            dash_clientside.set_props(
                {"index": this.tableIndex, "type": `${prefix}-body`},
                {"children": this.getRows()},
            );
            this.updatePageIndicator();
            this.updateHighlights();
        }

        /**
         * Update the available columns before display based on the current configuration and dataset.
         *
         * @param {boolean} original Whether the original dataset was used to create the virtual dataset.
         */
        updateColumns(original) {
            // Clone columns, instead of shallow copy, to prevent mutating originals on visibility changes.
            const originalColumns = this.config.columns.virtual.map(column => column["name"]);
            this.config.columns.virtual = [];
            let indexPreserved = false;
            if (original) {
                for (const column of this.config.columns.original) {
                    this.config.columns.virtual.push({...column});
                }
                indexPreserved = true;
            } else {
                const columnsByName = Object.fromEntries(
                    this.config.columns.original.map(col => [col["name"], col])
                )
                const newColumns = [];
                const rowIndexKey = this.config.row_index_key;
                for (const [index, item] of this.data.filtered.entries()) {
                    if (index === 0) {
                        // N.B. Starting in ES6, the order of columns can be guaranteed with ".keys()".
                        // All filtered data is expected to have the same set of keys.
                        newColumns.push(...Object.keys(item));
                        indexPreserved = item[rowIndexKey] !== undefined;
                        if (indexPreserved) {
                            break;
                        }
                    }
                    item[rowIndexKey] = index;
                }
                if (!newColumns.length) {
                    // Fallback to original columns if the new data has no columns, for visual consistency.
                    newColumns.push(...this.config.columns.original.map(col => col["name"]));
                }
                this.config.columns.virtual = [];
                for (const columnName of newColumns) {
                    // Hide the row index from dynamic visible columns.
                    if (columnName === rowIndexKey) {
                        continue;
                    }
                    this.config.columns.virtual.push(columnsByName[columnName] || {
                        "id": columnName,
                        "name": columnName,
                        "visible": true,
                        "selectable": true,
                        "format_namespace": this.config.format_namespace,
                        "format": this.config.format,
                    });
                }
            }

            const finalColumns = this.config.columns.virtual.map(column => column["name"]);
            for (const columnIndex of this.config.selected_columns.slice()) {
                if (finalColumns.includes(originalColumns[columnIndex])) {
                    continue;
                }
                this.config.selected_columns.splice(this.config.selected_columns.indexOf(columnIndex), 1);
                this.pendingHeaderChange = true;
            }
            if (originalColumns.toString() !== finalColumns.toString()) {
                this.pendingHeaderChange = true;
            }
            if (!indexPreserved) {
                // Reset selected rows because the index was not preserved by the filter.
                this.config.selected_rows = [];
                this.pendingConfigChange = true;
            }
        }

        /**
         * Update the filtered and virtual datasets before display based on the current configuration.
         */
        async updateData() {
            const newVirtualization = [
                this.config.filter || "",
                // Convert items to list for idempotent comparisons.
                (this.config.sort_by || []).map((sorter) => [sorter["key"], sorter["order"]]),
            ];
            if (this.lastVirtualization !== newVirtualization) {
                const originalLength = this.data.filtered.length;
                const filter = (newVirtualization[0] || "").trim();
                if (this.lastVirtualization[0] !== filter) {
                    let original = false;
                    if (!filter) {
                        this.data.filtered = this.data.original.slice();
                        original = true;
                        this.filter.classList.remove("invalid");
                    } else {
                        const namespace = TABLE_FILTERS[this.config.filter_namespace] || {};
                        const filterFunc = namespace[this.config.filter_action] || namespace.default || TABLE_FILTERS.default;
                        try {
                            this.data.filtered = await filterFunc(filter, this.data.original);
                            newVirtualization[0] = filter;
                            this.filter.classList.remove("invalid");
                        } catch {
                            // Fallback to original data without any filters, and provide hint to user that query is invalid.
                            // It is common to run partial queries with live filtering, never allow catastrophic failures.
                            this.data.filtered = this.data.original.slice();
                            original = true;
                            this.filter.classList.add("invalid");
                            newVirtualization[0] = "";
                        }
                    }
                    this.updateColumns(original);
                    if (originalLength !== this.data.filtered.length) {
                        // Reset page back to 0 to ensure that any filter changes that reduce size start at the beginning.
                        this.config.page = 0;
                        this.pendingConfigChange = true;
                    }
                    this.lastVirtualization = newVirtualization;
                }
                // Copy filtered data to prevent modifications due to sorting (and allow reuse).
                this.data.virtual = this.data.filtered.slice();
                if (this.config.sort_by.length) {
                    this.sortData(this.config.sort_by);
                }
            }
        }

        /**
         * Update table highlights without reloading contents.
         */
        updateHighlights() {
            const prefix = this.config.id_prefix;
            const rows = this.table.getElementsByClassName("data-row");
            const rowIndexKey = this.config.row_index_key;
            const selectedRows = this.config.selected_rows;
            const selectedColumns = this.config.selected_columns;
            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const item = this.getPaginatedItem(rowIndex);
                const index = item ? item[rowIndexKey] : null;
                const row = rows[rowIndex];
                const rowCheck = row.getElementsByClassName(`${prefix}-row-check`)[0];
                if (selectedRows.includes(index)) {
                    rowCheck.checked = true;
                    row.classList.add("row-highlight");
                } else {
                    rowCheck.checked = false;
                    row.classList.remove("row-highlight");
                }
                // Skip first column, it is the checkbox, even if selection is disabled.
                for (let columnIndex = 1; columnIndex < row.children.length; columnIndex++) {
                    const correctedIndex = columnIndex - 1;
                    const column = row.children[columnIndex];
                    if (selectedColumns.includes(correctedIndex)) {
                        column.classList.add("column-highlight");
                    } else {
                        column.classList.remove("column-highlight");
                    }
                }
            }
            const columnChecks = this.table.getElementsByClassName(`${prefix}-column-check`);
            for (let columnIndex = 0; columnIndex < columnChecks.length; columnIndex++) {
                columnChecks[columnIndex].checked = selectedColumns.includes(columnIndex);
            }
        }

        /**
         * Update page indicator without reloading contents.
         */
        updatePageIndicator() {
            const page = this.config.page;
            const pageSize = this.config.page_size;
            const data = this.data.virtual;
            const first = page * pageSize + 1;
            const last = Math.min(first + pageSize - 1, data.length);

            this.prevBtn.disabled = page === 0;
            this.nextBtn.disabled = page === this.getLastPage();
            this.currentCount.textContent = `${first}-${last}`;
            this.totalCount.textContent = `of ${data.length}`;
        }

        /**
         * Update a list of selections in-place.
         *
         * @param {number[]} selected Currently selected items.
         * @param {number} index Row or column index to toggle selection for.
         * @param {string} mode Selection mode to control how many items are allowed at once.
         *      e.g. "single", "multi", or empty for no selection
         */
        updateSelections(selected, index, {mode = "multi"} = {}) {
            const includes = selected.indexOf(index);
            if (includes !== -1) {
                selected.splice(includes, 1);
            } else {
                if (mode !== "multi") {
                    selected.splice(0, selected.length);
                }
                if (["single", "multi"].includes(mode)) {
                    selected.push(index);
                }
            }
            selected.sort();
        }
    }

    // Public variables/classes/functions.
    module.TABLE_FILTERS = TABLE_FILTERS;
    module.TABLE_FORMATTERS = TABLE_FORMATTERS;
    module.TableState = TableState;

    return module;
})(DashTable || {});