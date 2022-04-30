#!/bin/bash

cd $(dirname $0)
while read -r line; do
  echo $line;
  if [ "$line" = "Are we there yet?" ]; then
    echo "All done"
	pkill node
    exit 0
  fi;
done < <(./xkeys-server.js )


