import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const forbiddenInfrastructureDependencies =
  /(?:@nestjs(?:\/|$)|nestjs(?:\/|$)|fastify|typeorm|rabbitmq|redis|discord)/i;
const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g;

function collectSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === 'dist'
        ? []
        : collectSourceFiles(entryPath);
    }

    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function ownerFor(filePath: string): string | undefined {
  const relativePath = path.relative(repositoryRoot, filePath);
  const [topLevel, owner] = relativePath.split(path.sep);

  if ((topLevel === 'apps' || topLevel === 'services') && owner !== undefined) {
    return `${topLevel}/${owner}`;
  }

  return undefined;
}

function importsFrom(contents: string): string[] {
  return [...contents.matchAll(importPattern)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined);
}

describe('architecture boundaries', () => {
  const sourceFiles = [
    ...collectSourceFiles(path.join(repositoryRoot, 'apps')),
    ...collectSourceFiles(path.join(repositoryRoot, 'services')),
  ];

  it('prevents applications and services from importing each other', () => {
    const violations: string[] = [];

    for (const sourceFile of sourceFiles) {
      const owner = ownerFor(sourceFile);
      if (owner === undefined) {
        continue;
      }

      for (const specifier of importsFrom(readFileSync(sourceFile, 'utf8'))) {
        const target = specifier.startsWith('.')
          ? path.resolve(path.dirname(sourceFile), specifier)
          : path.resolve(repositoryRoot, specifier);
        const targetOwner = ownerFor(target);

        if (targetOwner !== undefined && targetOwner !== owner) {
          violations.push(`${path.relative(repositoryRoot, sourceFile)} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps domain and application layers framework-free', () => {
    const violations = sourceFiles.flatMap((sourceFile) => {
      const normalizedPath = sourceFile.replaceAll('\\', '/');
      const isCoreLayer =
        normalizedPath.includes('/domain/') || normalizedPath.includes('/application/');

      return isCoreLayer &&
        forbiddenInfrastructureDependencies.test(readFileSync(sourceFile, 'utf8'))
        ? [path.relative(repositoryRoot, sourceFile)]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
