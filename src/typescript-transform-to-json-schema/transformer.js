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
// transformer1-module
const ts = __importStar(require("typescript"));
const child_process_1 = require("child_process");
function default_1(program, pluginOptions) {
    const typeChecker = program.getTypeChecker();
    return (ctx) => {
        return (sourceFile) => {
            function visitor(node) {
                var _a, _b;
                if (ts.isImportDeclaration(node)) {
                    const module = node.moduleSpecifier.text;
                    if (module === './transformer-def') {
                        return;
                    }
                }
                if (ts.isCallExpression(node)) {
                    const declaration = (_a = typeChecker.getResolvedSignature(node)) === null || _a === void 0 ? void 0 : _a.declaration;
                    if (declaration && !ts.isJSDocSignature(declaration) && ((_b = declaration.name) === null || _b === void 0 ? void 0 : _b.getText()) === 'tsToJsSchema') {
                        const type = node.typeArguments[0].getText();
                        const strSchema = JSON.stringify(JSON.parse((0, child_process_1.execSync)('ts-json-schema-generator --id ' + type + ' --expose all --path ' + sourceFile.fileName + ' --type ' + type + ' --no-top-ref -f tsconfig.json', { encoding: 'utf8' })));
                        return ts.factory.createCallExpression(ts.factory.createRegularExpressionLiteral('JSON.parse'), [ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral('string'))], [ts.factory.createStringLiteral(strSchema)]);
                    }
                }
                // if (ts.isCallExpression(node)) {
                //     return ts.createLiteral('call');
                // }
                return ts.visitEachChild(node, visitor, ctx);
            }
            return ts.visitEachChild(sourceFile, visitor, ctx);
        };
    };
}
exports.default = default_1;
