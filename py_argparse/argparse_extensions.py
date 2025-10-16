"""Argparse parser with fuzzy argument support."""

import argparse
import difflib
from typing import Any
from typing import override


class FuzzyArgumentParser(argparse.ArgumentParser):
    """Object for parsing command line strings into Python objects with fuzzy argument recommendations."""

    def __init__(self, *args: Any, fuzzy_max: int = 3, fuzzy_cutoff: float = 0.65, **kwargs: Any) -> None:
        """Initialize the parser with default fuzzy settings."""
        super().__init__(*args, **kwargs)
        self.fuzzy_max = fuzzy_max
        self.fuzzy_cutoff = fuzzy_cutoff

    @override
    def _parse_optional(self, arg_string: str) -> tuple[argparse.Action | None, str, str | None] | None:
        result = super()._parse_optional(arg_string)
        if result and result[0][0] is None:
            fuzzy_opts = []
            matches = []
            chars = self.prefix_chars
            if arg_string[0] in chars and arg_string[1] in chars:
                # Follow standard argparse behavior for abbrev checking while collecting all possible fuzzy matches.
                opt = arg_string.split("=", 1)[0] if "=" in arg_string else arg_string
                for opt_string in self._option_string_actions:
                    fuzzy_opts.append(opt_string)
                    if opt_string.startswith(opt):
                        matches.append(opt_string)
                # Only display fuzzy recommendations if there were no abbrev compatible matches.
                if not matches and fuzzy_opts:
                    choices = difflib.get_close_matches(opt, fuzzy_opts, n=self.fuzzy_max, cutoff=self.fuzzy_cutoff)
                    if choices:
                        raise argparse.ArgumentError(
                            None,
                            f"unrecognized argument: {opt} (did you mean {', '.join(repr(fuzz) for fuzz in choices)})",
                        )
        return result
