# js-libs

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
