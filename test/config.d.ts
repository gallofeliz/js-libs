interface Config {
    machin: {
        truc: {
            bidule: boolean
        }
    }
    envShell?: string
}

// bin/generate-json-schema-from-ts.js test/config.d.ts Config > test/config.schema.json
