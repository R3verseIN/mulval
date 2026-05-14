#!/bin/bash

# Detect --web flag anywhere in the arguments
WEB_MODE=false
for arg in "$@"; do
    if [ "$arg" == "--web" ]; then
        WEB_MODE=true
        break
    fi
done

# Ensure MySQL is running
echo "🗄️ Starting MySQL Service..."
mkdir -p /var/run/mysqld /var/log/mysql
# Clean up stale sockets that might cause "Another process is using unix socket file" error
rm -f /var/run/mysqld/mysqld.sock /var/run/mysqld/mysqld.sock.lock /var/run/mysqld/mysqlx.sock /var/run/mysqld/mysqlx.sock.lock
usermod -d /var/lib/mysql mysql > /dev/null 2>&1
chown -R mysql:mysql /var/lib/mysql /var/run/mysqld /var/log/mysql
/usr/bin/mysqld_safe --user=mysql > /var/log/mysql/mysqld_safe.log 2>&1 &
# Wait for MySQL to be ready
COUNTER=0
until mysqladmin ping -h"localhost" --silent; do
    COUNTER=$((COUNTER+1))
    echo "   ...waiting for MySQL to be ready ($COUNTER)..."
    if [ $COUNTER -gt 15 ]; then
        echo "❌ ERROR: MySQL failed to start. Surfacing error log:"
        cat /var/log/mysql/error.log
        exit 1
    fi
    sleep 2
done

if [ "$WEB_MODE" = true ]; then
    echo "🌐 Starting MulVAL Web Dashboard..."
    echo "Connect to http://localhost:8080"
    
    # We need to run the FastAPI server
    # We assume it's installed via uv in the Dockerfile
    cd /opt/mulval/dashboard/backend
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8080
else
    # CLI MODE (Existing logic)
    INPUT_FILE="$1"
    shift

    if [ -z "$INPUT_FILE" ]; then
        echo "Usage: docker run --rm -v \$(pwd)/testcases:/input -v \$(pwd)/output:/output mulval-ubuntu /input/3host/input.P [options]"
        echo "Or run in web mode: docker run --rm -p 8080:8080 -v \$(pwd)/output:/output mulval-ubuntu --web"
        exit 1
    fi

    cd /output
    echo "--- Starting MulVAL Analysis ---"
    echo "Input: $INPUT_FILE"
    echo "Options: $@"
    echo "--------------------------------"

    graph_gen.sh "$INPUT_FILE" "$@" 2>&1 | tee mulval_console.log

    EXIT_CODE=${PIPESTATUS[0]}

    if [ $EXIT_CODE -ne 0 ]; then
        echo ""
        echo "❌ ERROR: MulVAL analysis failed with exit code $EXIT_CODE."
        exit $EXIT_CODE
    else
        echo ""
        echo "✅ SUCCESS: MulVAL analysis completed."
        echo "Visualizations generated in /output:"
        echo " - AttackGraph.pdf"
        echo " - AttackGraph.svg"
    fi
fi
