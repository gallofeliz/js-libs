"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tsToJsSchema = void 0;
const ts = __importStar(require("typescript"));
const tsjson = __importStar(require("ts-json-schema-generator"));
function tsToJsSchema() {
    throw new Error('tsToJsSchema<>() not compiled. Do you use ttypescript and have you added in your tsconfig.json `"plugins": [ { "transform": "@gallofeliz/typescript-transform-to-json-schema" } ] ?`');
}
exports.tsToJsSchema = tsToJsSchema;
function default_1(program, pluginOptions) {
    const typeChecker = program.getTypeChecker();
    return (ctx) => {
        return (sourceFile) => {
            function visitor(node) {
                var _a, _b;
                if (ts.isImportDeclaration(node)) {
                    const module = node.moduleSpecifier.text;
                    if (module === '@gallofeliz/typescript-transform-to-json-schema') {
                        return;
                    }
                }
                if (ts.isCallExpression(node)) {
                    const declaration = (_a = typeChecker.getResolvedSignature(node)) === null || _a === void 0 ? void 0 : _a.declaration;
                    if (declaration && !ts.isJSDocSignature(declaration) && ((_b = declaration.name) === null || _b === void 0 ? void 0 : _b.getText()) === 'tsToJsSchema') {
                        const type = node.typeArguments[0].getText();

                        let schema
                        switch(type) {
                            case 'string':
                            case 'number':
                            case 'boolean':
                            case 'null':
                                schema = {type: type}
                                break
                            // case 'Date':
                            //     schema = {type: 'string', format: 'date-time'}
                            //     break
                            default:
                                const config = {
                                    topRef: false,
                                    schemaId: type,
                                    expose: 'all',
                                    path: sourceFile.fileName
                                }

                                const generator = new tsjson.SchemaGenerator(
                                    program,
                                    tsjson.createParser(program, config),
                                    tsjson.createFormatter(config),
                                    config
                                )
                                schema = generator.createSchema(type)

                                if (schema.$ref && Object.keys(schema.definitions || {}).length === 1) {
                                    delete schema.$ref
                                    schema = {
                                        ...schema,
                                        ...Object.values(schema.definitions)[0]
                                    }
                                    delete schema.definitions
                                }
                        }
                        const strSchema = JSON.stringify(schema)
                        return ts.factory.createCallExpression(ts.factory.createRegularExpressionLiteral('JSON.parse'), [ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral('string'))], [ts.factory.createStringLiteral(strSchema)]);
                    }
                }
                return ts.visitEachChild(node, visitor, ctx);
            }
            return ts.visitEachChild(sourceFile, visitor, ctx);
        };
    };
}
exports.default = default_1;
