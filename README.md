# js-libs

**warning** version < 1 <=> At any moment the contracts change

## Operations

- `make test lib=xxx`
- `make build lib=xxx`
- `make deploy lib=xxx`

## Notes

- for the moment, the build is done on installation.
- files are generated in the root directory, I did'nt find how to specify a "require" directory
- each file represents a module that can be exported to independant project (avoid to have a big index.js with big exports)

## todo

- Update neDB with https://www.npmjs.com/package/@seald-io/nedb or other (LOKI ?)
- See to generate from API openAPI doc (exclude internal routes, generate an enpoint with json/yaml openAPI and one with UI)
- Add uid on logs for example for process 
- Better mapping with json schema for config and env (for example DOOR_OPENVALUE should match door.openValue)
- http server : special public role replaces required auth ?
