"""Python package loader with support for zip/tar files and directories."""

import os
import tarfile
import zipfile
from importlib.abc import MetaPathFinder
from importlib.abc import SourceLoader
from importlib.machinery import ModuleSpec
from importlib.util import spec_from_loader
from types import ModuleType
from typing import override


class BundleFinder(MetaPathFinder):
    """Finder that locates modules from a local directory or directory bundled into a single file/object."""

    def __init__(
        self,
        path: str | bytes | dict[str, bytes],
        path_type: str | None = None,
    ) -> None:
        """Set up the module finder with a bundle path or bundle content.

        Args:
            path: The package root, such as a directory/zip/tar, bytes representing a zip/tar, or preloaded data.
            path_type: Optional override to specify a path content type when using raw bytes.
        """
        super().__init__()
        self._loader = BundleLoader(path, path_type)

    @override
    def find_spec(
        # Maintain compatibility with Finder base. pylint: disable=unused-argument
        self,
        fullname: str,
        path: str | None,
        target: ModuleType | None = None,
    ) -> ModuleSpec | None:
        """Find a module spec if the module exists in the loaded package content."""
        return self._loader.find_spec(fullname)

    @property
    def modules(self) -> dict[str, str]:
        """All modules found in the loaded data and their file names."""
        return self._loader.modules.copy()

    @property
    def packages(self) -> list[str]:
        """All packages found in the loaded data."""
        return sorted(self._loader.packages)


class BundleLoader(SourceLoader):  # pylint: disable=too-many-ancestors
    """Container for manually loading modules from a local directory or directory bundled into a single file/object."""

    def __init__(
        self,
        path: str | bytes | dict[str, bytes],
        path_type: str | None = None,
    ) -> None:
        """Set up the module loader with a bundle path or bundle content.

        Args:
            path: The package root, such as a directory/zip/tar, bytes representing a zip/tar, or preloaded data.
            path_type: Optional override to specify a path content type when using raw bytes.
        """
        self._path = path
        self._path_type = path_type
        self._file = path if isinstance(path, str) else "memory"
        self._file_data = {}
        if self._path_type is None:
            if isinstance(self._path, bytes):
                raise ValueError("A path type must be provided with raw bytes")
            if isinstance(self._path, str):
                if self._file.endswith(".zip"):
                    self._path_type = "zip"
                elif self._file.endswith((".tar", ".tar.gz", ".tar.zst", ".tgz")):
                    self._path_type = "tar"
                elif os.path.isdir(self._file):
                    self._path_type = "dir"
                else:
                    raise ValueError("Invalid path type")
            else:
                self._path_type = "memory"
        self._modules = None
        self._packages = set()

    def _load(self) -> dict[str, bytes]:
        """Load all python files based on the path type."""
        files = {}
        if self._path_type == "memory":
            files = self._path
        elif self._path_type == "dir":
            files = self._load_dir()
        elif self._path_type == "tar":
            files = self._load_tar()
        elif self._path_type == "zip":
            files = self._load_zip()
        return files

    def _load_dir(self) -> dict[str, bytes]:
        """Load all python files from a zip file."""
        files = {}
        for root, _, dir_files in os.walk(self._file):
            new_root = root.replace(self._file, "")
            for dir_file in dir_files:
                if not dir_file.endswith(".py") or "." in os.path.basename(dir_file).removesuffix(".py"):
                    continue
                with open(os.path.join(root, dir_file), "rb") as file:
                    files[os.path.join(new_root, dir_file).strip(os.path.sep)] = file.read()
        return files

    def _load_tar(self) -> dict[str, bytes]:
        """Load all python files from a tar file."""
        files = {}
        if self._file.endswith((".zst", ".zstd")):
            import zstandard  # pylint: disable=import-outside-toplevel

            with zstandard.open(self._path) as zst_file, tarfile.open(mode="r|", fileobj=zst_file) as file:
                files = self._load_tar_file(file)
        else:
            mode = "r"
            if self._file.endswith((".gz", ".tgz")):
                mode = f"{mode}|gz"
            with tarfile.open(self._path, mode) as file:
                files = self._load_tar_file(file)
        return files

    @staticmethod
    def _load_tar_file(file: tarfile.TarFile) -> dict[str, bytes]:
        """Load all python files from a tar file."""
        files = {}
        for member in file:
            name = member.name
            if not name.endswith(".py") or "." in os.path.basename(name).removesuffix(".py") or not member.isfile():
                continue
            files[name] = file.extractfile(member).read()
        return files

    def _load_zip(self) -> dict[str, bytes]:
        """Load all python files from a zip file."""
        files = {}
        with zipfile.ZipFile(self._path) as archive:
            for name in archive.namelist():
                if not name.endswith(".py") or "." in os.path.basename(name).removesuffix(".py"):
                    continue
                files[name] = archive.read(name)
        return files

    def find_spec(self, fullname: str) -> ModuleSpec | None:
        """Find a module spec if the module exists in the provided data.

        Args:
            fullname: Full module names, such as from MetaPathFinder.find_spec.

        Returns:
            A spec if the named module exists in the loaded data, otherwise None.
        """
        spec = None
        modules = self.modules.keys()
        if fullname in modules:
            spec = spec_from_loader(fullname, self)
            # If this module has submodules, it is also a package.
            if any(name.startswith(fullname + ".") for name in modules):
                spec.submodule_search_locations = spec.submodule_search_locations or []
        elif fullname in self._packages:
            # No __init__.py file (implicit package).
            spec = ModuleSpec(fullname, self, is_package=True)
            spec.submodule_search_locations = spec.submodule_search_locations or []
        return spec

    @override
    def get_data(self, path: str) -> bytes:
        """Provide the python bytes for the specified path."""
        return self._file_data.get(path, b"")

    @override
    def get_filename(self, fullname: str) -> str:
        """Provide the value that __file__ is to be set to."""
        filename = self._modules.get(fullname)
        if not filename and fullname in self._packages:
            # No __init__.py file (implicit package).
            filename = fullname.replace(".", os.path.sep)
            filename = os.path.join(self._file, filename) if self._path_type == "dir" else f"{self._file}:{filename}"
        if not filename:
            raise ImportError(f"cannot import name '{fullname}'")
        return filename

    @property
    def modules(self) -> dict[str, str]:
        """All modules found in the loaded data and their file names."""
        if self._modules is None:
            self._modules = {}
            for file, data in self._load().items():
                module_root = os.path.dirname(file).replace(os.path.sep, ".")
                module_name = os.path.basename(file).removesuffix(".py")
                if module_name == "__init__":
                    full_module_name = module_root
                else:
                    full_module_name = f"{module_root}.{module_name}" if module_root else module_name
                filename = os.path.join(self._file, file) if self._path_type == "dir" else f"{self._file}:{file}"
                self._modules[full_module_name] = filename
                self._file_data[filename] = data
            # Register all packages, explicit (with __init__.py) or implicit (without __init__.py but with nested .py).
            for module in self._modules:
                # Only the path up to the final section should be registered as a package.
                # mypackage.lib.stuff -> mypackage, mypackage.lib
                parts = module.split(".")
                for part in range(1, len(parts)):
                    self._packages.add(".".join(parts[:part]))
        return self._modules

    @property
    def packages(self) -> list[str]:
        """All packages found in the loaded data."""
        if self._modules is None:
            # Module cache must be loaded for the package list to be available.
            _ = self.modules
        return sorted(self._packages)
