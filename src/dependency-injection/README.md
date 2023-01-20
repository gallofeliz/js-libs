# SIMPLE-DIJS

Simple Javascript Dependency Injection Container (DI) like Pimple, well tested browser/node - ES6 Arrow Functions compatible

## Installation

```bash
    npm install --save simple-dijs
```

## Integration

```javascript
    // NodeJs
    var Di = require('simple-dijs');
    // Web (just an example)
    ln -s node_modules/simple-dijs/dist/di.js public/lib/di.js
    // And minified : Only 4 K !
    ln -s node_modules/simple-dijs/dist/di.min.js public/lib/di.min.js
```

```html
    <!-- Available global or ADM (requirejs), thanks to Browserify -->
    <script src="lib/di.js" type="text/javascript"></script>
    <!-- Exists di.min.js -->
    <script src="lib/di.min.js" type="text/javascript"></script>
```

## Examples to use

```javascript
    // Simple instanciation
    var di = new Di();
    // Also instanciation with services
    new Di({
        'database': function () { ... },
        'userCollection': function (di) { ... }
    });

    di.set('database', function () {
        return new Database();
    });

    di.set('userCollection', function (di) {
        return new UserCollection(di.get('database'));
    });

    // Or multiple services
    di.batchSet({ ..same than construct.. });

    // So, ...
    di.get('userCollection').find(1); // UserCollection instanciated now !
    di.get('userCollection').find(1); // The same UserCollection instance

    // If you want to factory instead of return the same object :
    di.set('userCollection', di.factory(function (di) {
        return new UserCollection(di.get('database'));
    }));

    // So, ...
    di.get('userCollection').find(1); // UserCollection instanciated now !
    di.get('userCollection').find(1); // Other UserCollection instance now, instanciated now !

    // You can store raw values
    di.set('port', 80);
    di.get('port'); // 80

    // Protect function you want to register raw :
    di.set('math.add', di.protected(function (a, b) {
        return a + b;
    }));

    // New feature in v2 ! You can inject your dependencies in arguments

    di.set('database', function (config, logger) { // You have declared config and logger
        return new Database(config.database, logger);
    });

    // Or with ES6 Arrow Functions

    di.set('database', (config, logger) => new Database(config.database, logger) );

    // You cannot use callbacks anymore. Please see version 1.x

    // You can use promise (native or not)

    di.set('async', function () {
        return new Promise(/*Blabla*/);
    });

    di.get('async').then(function () {
        // ...
    });

    // You can chain the methods calls
    (new Di()).set(...).set(...);
```