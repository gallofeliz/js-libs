import { tsToJsSchema } from './transformer-def';
import { Ext } from './types'

interface MyObject {
  id: string;
  name: string;
  age: number;
}
const schema = tsToJsSchema<MyObject>();
const schema2 = tsToJsSchema<Ext>();
console.log(schema, schema2);