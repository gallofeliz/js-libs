import * as ts from 'typescript';
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

                        let schema: any

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
                                const config: any = {
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
                                        ...Object.values(schema.definitions as object)[0]
                                    }
                                    delete schema.definitions
                                }

                        }
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
