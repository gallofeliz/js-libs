# Run Tests

mocha + istanbul + typescript + Typemock

## Use

`npx run-tests -c 50`

Options:
- `-c X` to precise the coverage threshold

## Next

- Ability to run subpart of app, with tests pattern (ex : src/lib1/ and/or src/lib1/*.test.ts) and coverage pattern (src/lib1 or src/lib1/*.ts)
- Ability to precise coverage threshold for files, functions, etc