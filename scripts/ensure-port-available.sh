#!/bin/bash

# This script ensures that port 3000 is available before starting the server
# It will kill any lingering processes using the port

PORT=3000
echo "Checking if port $PORT is in use..."

if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  PID=$(lsof -i :$PORT -t 2>/dev/null)
else
  # Linux
  PID=$(ss -lptn "sport = :$PORT" 2>/dev/null | grep -v "State" | awk '{print $6}' | cut -d"," -f2 | cut -d"=" -f2 | grep -oE '[0-9]+')
fi

if [ -n "$PID" ]; then
  echo "Found process $PID using port $PORT"
  echo "Killing process $PID..."
  kill -15 $PID  # SIGTERM - try graceful shutdown first
  sleep 2
  
  # Check if it's still running
  if kill -0 $PID 2>/dev/null; then
    echo "Process still running, force killing..."
    kill -9 $PID  # SIGKILL - forceful termination
  fi
  
  echo "Process killed, port $PORT is now available"
else
  echo "Port $PORT is already available"
fi

exit 0