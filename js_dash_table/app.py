"""Example application to demonstrate table creation and callback initialization."""

import dash
from dash import MATCH
from dash import Input
from dash import Output
from dash import State
from dash import dcc
from dash import html


def get_table(index: int, data: list[dict], columns: list[dict]) -> html.Div:
    """Create a table to track stateful information for sorting, filtering, selections, etc."""
    prefix = "info"
    index = str(index)
    config = {
        "id_prefix": prefix,
        "columns": columns,
        "format_namespace": "cool_namespace",
        "format": "string",
        "filter_namespace": "cool_namespace",
    }

    return html.Div(
        id={"type": f"{prefix}-root", "index": index},
        children=html.Div(
            children=[
                html.Div(
                    children=[
                        dcc.Input(id={"type": f"{prefix}-loader", "index": index}, type="hidden", value=True),
                        dcc.Store(id={"type": f"{prefix}-config", "index": index}, data=config),
                        dcc.Store(id={"type": f"{prefix}-data", "index": index}, data={"original": data}),
                        html.Table(
                            className=f"{prefix}-table",
                            children=[
                                html.Thead(
                                    children=html.Th(
                                        colSpan=len(config["columns"]) + 1,
                                        children=[
                                            html.Span("My Cool Table"),
                                            html.Span(className=f"{prefix}-current-count"),
                                            html.Span(className=f"{prefix}-total-count"),
                                            html.Button("<", className=f"{prefix}-prev-btn"),
                                            html.Button(">", className=f"{prefix}-next-btn"),
                                        ],
                                    )
                                ),
                                html.Thead(
                                    children=html.Tr(id={"type": f"{prefix}-heading", "index": index}),
                                ),
                                html.Thead(
                                    children=html.Tr(
                                        children=[
                                            html.Th(
                                                colSpan=len(config["columns"]) + 1,
                                                children=dcc.Input(
                                                    className=f"{prefix}-filter",
                                                    placeholder="Filter...",
                                                    type="search",
                                                ),
                                            )
                                        ],
                                    )
                                ),
                                html.Tbody(id={"type": f"{prefix}-body", "index": index}),
                            ],
                        ),
                    ],
                ),
            ],
        ),
    )


app = dash.Dash(__name__)
app.layout = html.Div(
    get_table(
        0,
        columns=[
            {"id": "Name", "selectable": False},
            {"id": "Percentage", "selectable": True, "format": "percentage"},
        ],
        data=[
            {"row_index": 0, "Name": "a", "Percentage": 0.5},
            {"row_index": 1, "Name": "b", "Percentage": 0.99},
        ],
    )
)
app.clientside_callback(
    """
    function initTable(loader, config, data) {
        new DashTable.TableState(config, data);
        // Return no update to prevent duplicate config callback. Any required updates will be triggered manually.
        return dash_clientside.no_update;
    }""",
    Output({"type": "info-config", "index": MATCH}, "data"),
    Input({"type": "info-loader", "index": MATCH}, "value"),
    State({"type": "info-config", "index": MATCH}, "data"),
    State({"type": "info-data", "index": MATCH}, "data"),
    prevent_initial_call=False,
)

if __name__ == "__main__":
    app.run_server(
        debug=True,
        # Required to hide warnings about using checkbox type for inputs while in debug mode.
        dev_tools_props_check=False,
    )
