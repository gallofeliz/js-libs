#!/usr/bin/env bash

set -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

while getopts ":c:" o; do
    case "${o}" in
        c)
            coverage=${OPTARG}
            ;;
    esac
done

shift $((OPTIND -1))
PATHH=${1:-'./'}

if [ -z "$coverage" ]; then
	coverage='100'
fi

cd $PATHH

echo '{"exclude": ["**/tts-node.js", "**/*test.ts"], "temp-dir": "/tmp/nyc-report", "check-coverage": true, "branches": '$coverage', "lines": '$coverage', "functions": '$coverage', "statements": '$coverage'}' > /tmp/nyc.json

npx nyc --nycrc-path /tmp/nyc.json mocha -r $SCRIPT_DIR/../tts-node.js '**/*test.ts' --ignore 'node_modules/**'
