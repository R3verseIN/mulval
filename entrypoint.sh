#!/bin/bash
set -e

# The first argument is the input file
INPUT_FILE="$1"
shift

if [ -z "$INPUT_FILE" ]; then
    echo "Usage: docker run --rm -v \$(pwd)/testcases:/input -v \$(pwd)/output:/output mulval-alpine /input/3host/input.P [options]"
    exit 1
fi

# Go to output directory so all generated files stay there
cd /output

# Run MulVAL graph generator
# The rest of the arguments are passed as options (e.g., -v, -p)
graph_gen.sh "$INPUT_FILE" "$@"
