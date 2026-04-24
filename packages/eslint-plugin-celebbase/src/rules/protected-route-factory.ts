import type { Rule } from 'eslint';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

const PROTECTED_PATH_RE = /\/app\/api\/(users|meal-plans|ws-ticket)\//;

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require createProtectedRoute wrapper for all HTTP method exports in protected BFF routes.',
      recommended: true,
    },
    messages: {
      missingWrapper:
        'Exported HTTP method "{{ name }}" must be wrapped with createProtectedRoute(). ' +
        'Public routes must use createPublicRoute() instead.',
      missingImport:
        'File exports HTTP method "{{ name }}" but does not import createProtectedRoute from _lib/session.',
    },
    schema: [],
  },

  create(context): Rule.RuleListener {
    const filename: string =
      typeof context.getFilename === 'function'
        ? context.getFilename()
        : (context as unknown as { filename: string }).filename;

    if (!PROTECTED_PATH_RE.test(filename)) {
      return {};
    }

    let hasProtectedImport = false;
    const unprotectedExports: Array<{ node: Rule.Node; name: string }> = [];

    return {
      ImportDeclaration(node) {
        const source = node.source.value as string;
        if (source.includes('_lib/session')) {
          const hasSpecifier = node.specifiers.some(
            (s) =>
              s.type === 'ImportSpecifier' &&
              (s as import('estree').ImportSpecifier).imported.type === 'Identifier' &&
              ((s as import('estree').ImportSpecifier).imported as import('estree').Identifier).name ===
                'createProtectedRoute',
          );
          if (hasSpecifier) hasProtectedImport = true;
        }
      },

      ExportNamedDeclaration(node) {
        if (!node.declaration) return;
        if (node.declaration.type !== 'VariableDeclaration') return;

        for (const declarator of node.declaration.declarations) {
          if (declarator.id.type !== 'Identifier') continue;
          const exportName = (declarator.id as import('estree').Identifier).name;
          if (!HTTP_METHODS.has(exportName)) continue;

          const init = declarator.init;
          const isWrapped =
            init !== null &&
            init !== undefined &&
            init.type === 'CallExpression' &&
            init.callee.type === 'Identifier' &&
            ((init.callee as import('estree').Identifier).name === 'createProtectedRoute' ||
              (init.callee as import('estree').Identifier).name === 'createPublicRoute');

          if (!isWrapped) {
            unprotectedExports.push({ node: declarator as unknown as Rule.Node, name: exportName });
          }
        }
      },

      'Program:exit'() {
        for (const { node, name } of unprotectedExports) {
          context.report({
            node,
            messageId: hasProtectedImport ? 'missingWrapper' : 'missingImport',
            data: { name },
          });
        }
      },
    };
  },
};

export default rule;
