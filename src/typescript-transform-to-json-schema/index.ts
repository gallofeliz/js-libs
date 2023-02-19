import * as ts from 'typescript';
import { execSync } from 'child_process'
import * as tsjson from 'ts-json-schema-generator'

export function tsToJsSchema<T extends any>(): Record<string, any> {
    throw new Error('tsToJsSchema<>() not compiled. Do you use ttypescript and have you added in your tsconfig.json `"plugins": [ { "transform": "@gallofeliz/typescript-transform-to-json-schema" } ] ?`')
}

// @internal
export default function(program: ts.Program, pluginOptions: {}) {
    const typeChecker = program.getTypeChecker();

    return (ctx: ts.TransformationContext) => {
        return (sourceFile: ts.SourceFile) => {
            function visitor(node: ts.Node): ts.Node | undefined {
                if (ts.isImportDeclaration(node)) {
                    const module = (node.moduleSpecifier as ts.StringLiteral).text;
                    if (module === '@gallofeliz/typescript-transform-to-json-schema') {
                        return
                    }
                }

                if (ts.isCallExpression(node)) {
                    const declaration = typeChecker.getResolvedSignature(node)?.declaration;
                    if (declaration && !ts.isJSDocSignature(declaration) && declaration.name?.getText() === 'tsToJsSchema') {

                        const type = node.typeArguments![0].getText()

                        const generator = new tsjson.SchemaGenerator(
                            program,
                            tsjson.createParser(program, {}),
                            tsjson.createFormatter({})
                        )
                        const schema = generator.createSchema(type)
                        const strSchema = JSON.stringify(schema)

                        return ts.factory.createCallExpression(
                            ts.factory.createRegularExpressionLiteral('JSON.parse'),
                            [ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral('string'))],
                            [ts.factory.createStringLiteral(strSchema)]
                        )

                    }
                }
                return ts.visitEachChild(node, visitor, ctx);
            }
            return ts.visitEachChild(sourceFile, visitor, ctx);
        };
    };
}
