#!/usr/bin/env node

const TJS = require('typescript-json-schema')
const load = require('tsconfig-loader').default

console.log(
    JSON.stringify(
        TJS.generateSchema(
            TJS.getProgramFromFiles(
              [process.argv[2]],
               (((load() || {}).tsConfig || {}).compilerOptions || {})
            ),
            process.argv[3],
            { required: true }
        ),
        null,
        4
    )
)
