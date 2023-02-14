# js-libs

**warning** version < 1 <=> At any moment the contracts change

- Deployed to https://www.npmjs.com/~gallofeliz
- Available here with tags packageName/version

## Operations

- ./test packageName
- ./build packageName
- ./deploy packageName1 packageName2 ...

## Guidelines

- Buildable components, runnable (new Process + run()) + 1 hight level function to build and run (runProcess(), etc)
  - runnable once => run()
  - Start/Stoppable => start() stop()
- Accept AbortSignal in run/start method (and in hight level function)
- No more default export, always named
- Objects configs instead of arguments (ex runProcess({...}) instead of runProcess('x', [], true, false))