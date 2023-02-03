#!/usr/bin/env bash

set -e

SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )

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

npx nyc --nycrc-path /tmp/nyc.json mocha -r $DIR/../tts-node.js '**/*test.ts' --ignore 'node_modules/**'
