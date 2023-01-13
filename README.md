# js-libs

Github NPM packages doesn't allow install without TOKEN and so is useless. Use release assets instead (for example https://github.com/gallofeliz/js-libs/releases/download/v0.1.5/gallofeliz-js-libs-0.1.5.tgz).

## Notes

- for the moment, the build is done on installation.
- files are generated in the root directory, I did'nt find how to specify a "require" directory
- each file represents a module that can be exported to independant project (avoid to have a big index.js with big exports)

Please don't use this repository for you. I don't guarantee the futur of this repository, each module should be exported as independant project and fits for my needs, my ideas, my points of view.

## Config

The workflow is :
- The config is read from a file (if provided)
- The config is completed with env variables (prefixed or not)
- The config is not overrided by command line (for the moment)
- The config is converted to the good type (with schema)
- The config is validated (end of user config) with schema
- The config is completed with default values
- The config is finalized (if provided)

## todo

- Update neDB with https://www.npmjs.com/package/@seald-io/nedb or other (LOKI ?)
- See to generate from API openAPI doc
- See jobs/process/others abort(abortController?) on res.close (http), maybe outputStream closes for process ; maybe a mechanism on httpServer for global

## Dev

```
	sudo docker run --rm -it -v $(pwd):/workdir --init --user $UID --workdir /workdir node:lts-alpine npm i
	sudo docker run --rm -it -v $(pwd):/workdir --init --user $UID --workdir /workdir node:lts-alpine npm i --no-save ts-node
	sudo docker run --rm -it -v $(pwd):/workdir --init --workdir /workdir node:lts-alpine node_modules/.bin/ts-node test/process.ts
```
