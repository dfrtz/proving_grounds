"""Example application to demonstrate table creation and callback initialization."""

import dash
from dash import dcc
from dash import html

from table_state import TableStateContainer


class Dash(dash.Dash):
    """Dash extension to allow JavaScript module support."""

    def interpolate_index(
        self,
        metas: str = "",
        title: str = "",
        css: str = "",
        config: str = "",
        scripts: str = "",
        app_entry: str = "",
        favicon: str = "",
        renderer: str = "",
    ) -> str:
        # Overrides the default behavior of Dash.interpolate_index() to allow JavaScript module support.
        renderer = renderer.replace('type="application/javascript"', 'type="module"')
        return super().interpolate_index(metas, title, css, config, scripts, app_entry, favicon, renderer)


def get_table(index: int, data: list[dict], columns: list[dict]) -> TableStateContainer:
    """Create a table to track stateful information for sorting, filtering, selections, etc."""
    prefix = "info"
    index = str(index)
    config = {
        "columns": columns,
        "format_namespace": "adv_namespace",
        "format": "string",
        "filter_namespace": "adv_namespace",
    }

    return TableStateContainer(
        id={"type": prefix, "index": index},
        config=config,
        data={"original": data},
        children=html.Div(
            id={"type": f"{prefix}-root", "index": index},
            children=html.Div(
                children=[
                    html.Div(
                        children=[
                            html.Table(
                                className=f"{prefix}-table",
                                children=[
                                    html.Thead(
                                        children=html.Th(
                                            colSpan=len(config["columns"]) + 1,
                                            children=[
                                                html.Span("Advanced Info Table"),
                                                html.Span(className=f"{prefix}-current-count"),
                                                html.Span(className=f"{prefix}-total-count"),
                                                html.Button("<", className=f"{prefix}-prev-btn"),
                                                html.Button(">", className=f"{prefix}-next-btn"),
                                            ],
                                        )
                                    ),
                                    html.Thead(
                                        children=html.Tr(className=f"{prefix}-heading"),
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
                                    html.Tbody(className=f"{prefix}-body"),
                                ],
                            ),
                        ],
                    ),
                ],
            ),
        ),
    )


app = Dash(__name__)
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

if __name__ == "__main__":
    app.run_server(
        debug=True,
        # Required to hide warnings about using checkbox type for inputs while in debug mode.
        dev_tools_props_check=False,
    )
