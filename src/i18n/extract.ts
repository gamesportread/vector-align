/**
 * Node-only: collects every English UI string that the app passes through the
 * translation layer (t(zh, en) calls, { zh, en } objects, xxxEn fields and
 * [zh, en] tuples). Used by i18n.test.ts to verify catalog coverage.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export interface ExtractResult { keys: Set<string>; dynamic: string[] }

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (name !== 'i18n') walk(path, out); }
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && !path.includes('/testing/')) out.push(path);
  }
  return out;
}

const literal = (node: ts.Node | undefined): string | undefined =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;

const propName = (p: ts.ObjectLiteralElementLike) =>
  ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined;

export function extractKeys(root = join(process.cwd(), 'src')): ExtractResult {
  const keys = new Set<string>(); const dynamic: string[] = [];
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const where = (n: ts.Node) => `${file.slice(root.length + 1)}:${source.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    const add = (node: ts.Node | undefined) => {
      if (!node) return;
      const value = literal(node);
      if (value !== undefined) { if (value.trim()) keys.add(value); }
      else if (ts.isConditionalExpression(node)) { add(node.whenTrue); add(node.whenFalse); }
      else if (ts.isParenthesizedExpression(node)) add(node.expression);
      else if (ts.isTemplateExpression(node)) dynamic.push(where(node));
    };
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const fn = node.expression.text;
        if (fn === 't' && node.arguments.length >= 2) add(node.arguments[1]);
        if (fn === 'translate' && node.arguments.length >= 2) add(node.arguments[1]);
      }
      if (ts.isObjectLiteralExpression(node)) {
        const names = node.properties.map(propName);
        node.properties.forEach((p, i) => {
          const name = names[i];
          if (!name || !ts.isPropertyAssignment(p)) return;
          if (name === 'en' && names.includes('zh')) add(p.initializer);
          else if (/[a-z]En$/.test(name) && names.includes(name.slice(0, -2) + 'Zh')) add(p.initializer);
        });
      }
      if (ts.isPropertyAssignment(node) && ts.isArrayLiteralExpression(node.initializer) && node.initializer.elements.length === 2 && node.initializer.elements.every(e => literal(e) !== undefined)) {
        const parent = node.parent.parent;
        if (ts.isVariableDeclaration(parent) && parent.type && /\[string, string\]/.test(parent.type.getText())) add(node.initializer.elements[1]);
      }
      if (ts.isVariableDeclaration(node) && node.type && node.type.getText() === '[string, string]' && node.initializer && ts.isArrayLiteralExpression(node.initializer)) add(node.initializer.elements[1]);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { keys, dynamic };
}
