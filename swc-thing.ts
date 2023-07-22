
function registerExport(moduleID: number, ident: Identifier): CallExpression {
  const span = ident.span;
  return {
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      object: {
        type: 'Identifier',
        optional: false,
        value: '/* @__PURE__ */ window',
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
                value: 'fnext.hot-reload',
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
    arguments: [
      {
        expression: {
          type: 'NumericLiteral',
          value: moduleID,
          span,
        },
      },
      {
        expression: { ...ident },
      },
    ],
    span,
  };
}

function postProcess(isPage: boolean, moduleID: number, str: string) {
  return transform(str, {
    sourceMaps: 'inline',
    inlineSourcesContent: true,

    plugin(mod) {
      let newItems: Array<[idx: number, node: ModuleItem | Statement]> = [];

      for (let i = 0; i < mod.body.length; i++) {
        const item = mod.body[i];
        switch (item.type) {
          case 'ExportNamedDeclaration':
            newItems.push([
              i,
              {
                type: 'VariableDeclaration',
                declare: false,
                kind: 'const',
                declarations: item.specifiers.reduce(
                  (acc, spec): Array<VariableDeclarator> => {
                    let ident: Identifier;

                    switch (spec.type) {
                      case 'ExportDefaultSpecifier':
                        ident = spec.exported;
                        console.log('default', ident.value);
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

                    const wrappedAlias = `__fnext_${ident.value}`;

                    acc.push({
                      type: 'VariableDeclarator',
                      span: spec.span,
                      id: {
                        type: 'Identifier',
                        optional: false,
                        value: wrappedAlias,
                        span: ident.span,
                      },
                      init: registerExport(moduleID, ident),
                      definite: true,
                    });

                    ident.value = wrappedAlias;

                    return acc;
                  },
                  [] as Array<VariableDeclarator>
                ),

                span: item.span,
              },
            ]);

          // case 'ExportDefaultDeclaration':
          //   if (item.decl.type !== 'TsInterfaceDeclaration') {
          //     mod.body[i] = {
          //       type: 'ExpressionStatement',
          //       expression: {
          //         type: 'CallExpression',
          //         callee: {
          //           type: 'Identifier',
          //           value: 'hello',
          //           optional: false,
          //           span: item.span,
          //         },
          //         arguments: [item.decl],
          //       },
          //     };
          //   }
        }
      }

      for (
        let nextToInsert = newItems.pop();
        nextToInsert;
        nextToInsert = newItems.pop()
      ) {
        mod.body.splice(nextToInsert[0], 0, nextToInsert[1]);
      }

      return mod;
    },
  });
}
