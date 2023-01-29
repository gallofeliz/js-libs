while getopts ":c:" o; do
    case "${o}" in
        c)
            coverage=${OPTARG}
            ;;
    esac
done

if [ -z "$coverage" ]; then
	coverage='100'
fi

echo '{"temp-dir": "/tmp/nyc-report", "check-coverage": true, "branches": '$coverage', "lines": '$coverage', "functions": '$coverage', "statements": '$coverage'}' > /tmp/nyc.json

npx nyc --nycrc-path /tmp/nyc.json mocha -r ts-node/register '**/*.test.ts' --ignore 'node_modules/**'