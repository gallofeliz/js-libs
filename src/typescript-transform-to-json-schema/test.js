"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const transformer_def_1 = require("./transformer-def");
const schema = (0, transformer_def_1.tsToJsSchema)();
const schema2 = (0, transformer_def_1.tsToJsSchema)();
console.log(schema, schema2);
