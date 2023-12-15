const { sortBy } = require('lodash')
const memwatch = require('@airbnb/node-memwatch')

let hd

exports.mochaHooks = {
  beforeEach() {
     hd = new memwatch.HeapDiff();
  },
  afterEach() {
    var diff = hd.end();

    //console.log('potential memory leak', diff.change.size.toUpperCase())

    console.table(
        sortBy(diff.change.details.filter((d) => d.size_bytes > 0), 'size_bytes').reverse().slice(0, 3)
    )
  }
};
