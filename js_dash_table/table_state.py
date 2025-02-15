"""Container for wrapping a native HTML table with interactivity."""

from dash.development.base_component import Component


class TableStateContainer(Component):
    """Element container for tracking user interactions with native Javascript and HTML table."""

    _namespace = "dash_table_state"
    _type = "TableStateContainer"

    def __init__(
        self,
        id: str | dict | None = None,
        config: dict | None = None,
        data: dict | None = None,
        children: Component | list[Component] | None = None,
    ) -> None:
        """Set up the component defaults."""
        config = config or {}
        data = data or {}
        self._prop_names = ["id", "config", "data", "children"]
        self._valid_wildcard_attributes = []
        self.available_properties = self._prop_names
        self.available_wildcard_properties = []
        args = {name: value for name, value in locals().items() if name in self._prop_names}
        if not args["id"]:
            args.pop("id")
        super().__init__(**args)
