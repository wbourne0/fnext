import {
  VariableDeclarator,
  Identifier,
  parseFile,
  print,
  ExportDeclaration,
  Declaration,
  ExportDefaultDeclaration,
  Expression,
  Span,
  ExportSpecifier,
  ExportDefaultSpecifier,
  Argument,
  Pattern,
  ClassExpression,
  FunctionExpression,
} from '@swc/core';
import { PluginData } from './types';
import { inspect } from 'util';
import { extname } from 'path';

function getHMRFunction(
  symbol: string,
  span: Span,
  args: Array<Argument>,
  fallback: Expression = {
    type: 'Identifier',
    value: 'null',
    optional: false,
    span,
  }
): Expression {
  return {
    type: 'ConditionalExpression',
    test: {
      type: 'BinaryExpression',
      operator: '!==',
      left: {
        type: 'UnaryExpression',
        operator: 'typeof',
        argument: {
          type: 'Identifier',
          value: 'window',
          optional: false,
          span,
        },
        span,
      },
      right: {
        type: 'StringLiteral',
        value: 'undefined',
        has_escape: false,
        span,
      },
      span,
    },
    consequent: {
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          optional: false,
          value: 'window',
          span,
        },
        property: {
          type: 'Computed',
          expression: {
            type: 'CallExpression',

            callee: {
              type: 'MemberExpression',
              object: {
                type: 'Identifier',
                value: 'Symbol',
                optional: false,
                span,
              },
              property: {
                type: 'Identifier',
                optional: false,
                value: 'for',

                span,
              },
              span,
            },
            arguments: [
              {
                expression: {
                  type: 'StringLiteral',
                  value: symbol,
                  has_escape: false,
                  span,
                },
              },
            ],
            span,
          },
          span,
        },
        span,
      },
      arguments: args,
      span,
    },

    alternate: fallback,
    span,
  };
}

function wrapExpression(
  path: string,
  expression: Expression,
  span: Span,
  name: string
): Expression {
  return getHMRFunction(
    'fnext.register',
    span,
    [
      {
        expression: {
          type: 'StringLiteral',
          value: path.slice(0, -extname(path).length) + '.mjs',
          has_escape: false,
          span,
        },
      },
      {
        expression: {
          type: 'StringLiteral',
          value: name,
          has_escape: false,
          span,
        },
      },
      {
        expression,
      },
    ],
    expression
  );
}

function handleExportedPattern(
  node: Pattern,
  identifiersToExport: Array<Identifier>
) {
  switch (node.type) {
    case 'ObjectPattern':
      for (const prop of node.properties) {
        switch (prop.type) {
          case 'AssignmentPatternProperty':
            if (prop.value) {
              handleExportedPattern(prop.value, identifiersToExport);
              continue;
            }
            identifiersToExport.push(prop.key);
            break;
          case 'KeyValuePatternProperty':
            if (prop.value) {
              handleExportedPattern(prop.value, identifiersToExport);
              continue;
            }

            if (prop.key.type !== 'Identifier') {
              throw new Error(`invalid variable name: ${inspect(prop.key)}`);
            }
            identifiersToExport.push(prop.key);
            break;
          case 'RestElement':
            handleExportedPattern(prop.argument, identifiersToExport);
        }
      }

      break;
    case 'ArrayPattern':
      for (const prop of node.elements) {
        switch (prop?.type) {
          case 'Identifier':
            identifiersToExport.push(prop);
            break;
          case 'RestElement':
            handleExportedPattern(prop, identifiersToExport);
        }
      }
      break;
    case 'Identifier':
      identifiersToExport.push(node);
      break;
  }
}

function handleExportDeclaration(
  node: ExportDeclaration,
  identifiersToExport: Array<Identifier>,
  path: string
): Declaration {
  const decl = node.declaration;
  switch (decl.type) {
    case 'VariableDeclaration':
      for (const { id } of decl.declarations) {
        handleExportedPattern(id, identifiersToExport);
      }
      break;
    case 'ClassDeclaration':
      identifiersToExport.push(decl.identifier);
      break;
    case 'FunctionDeclaration':
      if (decl.body) identifiersToExport.push(decl.identifier);
      break;
    // there's also ts declarations but esbuild will remove those anyways so we'll just ignore them
  }

  return decl;
}

function handleExportDefaultDeclaration(
  node: ClassExpression | FunctionExpression,
  identifiersToExport: Array<Identifier | (Identifier & { default: true })>
): Declaration {
  switch (node.type) {
    case 'ClassExpression':
      node.identifier ??= {
        span: node.span,
        value: '__fnext_export_default',
        type: 'Identifier',
        optional: false,
      };

      identifiersToExport.push({ ...node.identifier, default: true });

      return {
        ...node,
        declare: false,
        type: 'ClassDeclaration',
      };
    case 'FunctionExpression':
      node.identifier ??= {
        span: node.span,
        value: '__fnext_export_default',
        type: 'Identifier',
        optional: false,
      };

      identifiersToExport.push({ ...node.identifier, default: true });
      return {
        ...node,
        identifier: {
          ...node.identifier,
          value: node.identifier.value,
        },
        declare: false,
        type: 'FunctionDeclaration',
      };
  }
}

export async function transform(
  path: string,
  { isPage, relPath, isJSX, isTS }: PluginData
): Promise<string> {
  const mod = await parseFile(path, {
    comments: true,
    ...(isTS
      ? { tsx: isJSX, syntax: 'typescript' }
      : { jsx: isJSX, syntax: 'ecmascript' }),

    decorators: true,
  });

  const identifiersToExport: Array<Identifier & { default?: true }> = [];

  for (let i = 0; i < mod.body.length; i++) {
    const item = mod.body[i];

    switch (item.type) {
      case 'ExportDeclaration':
        mod.body[i] = handleExportDeclaration(item, identifiersToExport, path);

        break;
      case 'ExportDefaultDeclaration':
        if (item.decl.type !== 'TsInterfaceDeclaration') {
          mod.body[i] = handleExportDefaultDeclaration(
            item.decl,
            identifiersToExport
          );
        }
        break;
      case 'ExportDefaultExpression':
        item.expression = wrapExpression(
          relPath,
          item.expression,
          'span' in item.expression ? item.expression.span : item.span,
          'default'
        );
        break;
      case 'ExportNamedDeclaration':
        if (item.source) {
          break;
        }

        mod.body.push({
          type: 'VariableDeclaration',
          declare: false,
          kind: 'const',
          declarations: item.specifiers.reduce(
            (acc, spec): Array<VariableDeclarator> => {
              let ident: Identifier;

              switch (spec.type) {
                case 'ExportDefaultSpecifier':
                  ident = spec.exported;
                  break;

                case 'ExportSpecifier':
                  if (isPage && spec.exported?.value !== 'default') {
                    return acc;
                  }
                  ident = spec.orig;

                  if (spec.exported === null) {
                    spec.exported = { ...ident };
                  }

                  break;
                case 'ExportNamespaceSpecifier':
                  if (isPage) return acc;
                  ident = spec.name;
              }

              const wrappedAlias = `__fnext_named_${ident.value}`;

              acc.push({
                type: 'VariableDeclarator',
                span: spec.span,
                id: {
                  type: 'Identifier',
                  optional: false,
                  value: wrappedAlias,
                  span: ident.span,
                },
                init: wrapExpression(
                  relPath,
                  { ...ident },
                  ident.span,
                  ident.value
                ),
                definite: true,
              });

              ident.value = wrappedAlias;

              return acc;
            },
            [] as Array<VariableDeclarator>
          ),

          span: item.span,
        });

        break;
    }
  }

  if (identifiersToExport.length > 0) {
    const footerSpan = {
      ...identifiersToExport[0].span,
      end: identifiersToExport[identifiersToExport.length - 1].span.end,
    };

    mod.body.push(
      {
        type: 'VariableDeclaration',
        declare: false,
        span: footerSpan,
        kind: 'const',

        declarations: identifiersToExport.map(
          (ident): VariableDeclarator => ({
            type: 'VariableDeclarator',
            definite: true,
            id: {
              ...ident,
              value: `__fnext_${ident.value}`,
            },
            init: wrapExpression(relPath, ident, ident.span, ident.value),
            span: ident.span,
          })
        ),
      },
      {
        type: 'ExportNamedDeclaration',
        span: footerSpan,
        // @ts-expect-error bad typing
        typeOnly: false,
        specifiers: identifiersToExport.map(
          (ident): ExportSpecifier | ExportDefaultSpecifier => ({
            type: 'ExportSpecifier',
            exported: ident.default
              ? {
                  type: 'Identifier',
                  value: 'default',
                  span: ident.span,
                  optional: false,
                }
              : ident,
            orig: {
              ...ident,
              value: `__fnext_${ident.value}`,
            },

            span: ident.span,
          })
        ),
      }
    );
  }

  const { code } = await print(mod, {
    sourceMaps: 'inline',
    filename: relPath,
  });

  return code;
}
