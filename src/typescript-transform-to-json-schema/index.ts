import * as ts from 'typescript';
import { execSync } from 'child_process'

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

                        const schema = JSON.parse(
                            execSync(
                                'npx ts-json-schema-generator --id '+type+' --expose all --path '+sourceFile.fileName+' --type '+type+' --no-top-ref -f tsconfig.json'
                                , {encoding: 'utf8'})
                        )

                        // if (schema.$ref) {
                        //     const key = schema.$ref.replace('')
                        // }

                        const strSchema = JSON.stringify(schema)

                        return ts.factory.createCallExpression(
                            ts.factory.createRegularExpressionLiteral('JSON.parse'),
                            [ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral('string'))],
                            [ts.factory.createStringLiteral(strSchema)]
                        )

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
