#!/usr/bin/env bash

# Create a custom minified plotly.js patched with ability to run custom formatters.

# Ensure the whole script exits on failures.
set -e

# Pull out user args to modify default behavior.
plotly_version=''
while [[ $# -gt 0 ]]; do
  case $1 in
    --plotly)
      if [ -z "$2" ]; then echo "Must provide Plotly version. Example: --plotly 3.0.0"; exit 1; fi
      plotly_version=$2
      shift
    ;;
  esac
  shift
done

if [ -z "${plotly_version}" ]; then
  echo "No Plotly version specified. Please provide an Plotly version as <major>.<minor>.<maintenance> to continue. Example: --plotly 3.0.0"
  exit 1
fi

# Force execution in docker to ensure reproducibility.
if [ ! -f /.dockerenv ]; then
  echo "Running in docker."
  docker run --rm -it -v `pwd`:/mnt/app node bash -c "/mnt/app/build_plotly.sh --plotly ${plotly_version}"
  exit 0
fi

# Turn on command echoing to show all commands as they run.
set -x

plotly_file="plotly-${plotly_version}.js"

# Pull unminified plotly.js to simplify search and replace.
curl -k "https://cdn.plot.ly/${plotly_file}" -o "${plotly_file}"

# Add new option(s) to exponent formats.
# Original line: values: ["none", "e", "E", "power", "SI", "B"]
sed -i 's/"E", "power", "SI", "B"/"E", "power", "SI", "B", "IEC"/g' "${plotly_file}"

# Add override to top of number formatter function.
# Place below line: function numFormat(v, ax, fmtoverride, hover)
sed -i -e '/function numFormat(/a\' -e '        const customResult = Plotly.numFormatOverride?.(v, ax, fmtoverride, hover);\n        if (customResult != null) return customResult;' "${plotly_file}"

# Minify patched file.
minified_file="plotly-${plotly_version}.min.js"
npm install uglify-js -g
uglifyjs --mangle -o "${minified_file}" -- "${plotly_file}"

project_root="$(dirname "$(dirname "$(readlink -f "$0")")")"
mv "${minified_file}" "${project_root}/app/${minified_file}"
echo "Plotly ${plotly_version} can be found on host at <mounted volume>/${minified_file}"
