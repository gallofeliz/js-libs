// transformer1-module
import * as ts from 'typescript';
import { execSync } from 'child_process'

export default function(program: ts.Program, pluginOptions: {}) {
    const typeChecker = program.getTypeChecker();

    return (ctx: ts.TransformationContext) => {
        return (sourceFile: ts.SourceFile) => {
            function visitor(node: ts.Node): ts.Node | undefined {
                if (ts.isImportDeclaration(node)) {
                    const module = (node.moduleSpecifier as ts.StringLiteral).text;
                    if (module === './transformer-def') {
                        return
                    }
                }

                if (ts.isCallExpression(node)) {
                    const declaration = typeChecker.getResolvedSignature(node)?.declaration;
                    if (declaration && !ts.isJSDocSignature(declaration) && declaration.name?.getText() === 'tsToJsSchema') {

                        const type = node.typeArguments![0].getText()

                        const strSchema = JSON.stringify(JSON.parse(
                            execSync(
                                'ts-json-schema-generator --id '+type+' --expose all --path '+sourceFile.fileName+' --type '+type+' --no-top-ref -f tsconfig.json'
                                , {encoding: 'utf8'})
                        ))

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
