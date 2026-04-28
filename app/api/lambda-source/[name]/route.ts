import fs from 'node:fs/promises';
import path from 'node:path';

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ name: string }> };

type SourceEntry = {
  path: string;
  text: string;
};

async function walk(dir: string, baseDir: string, out: SourceEntry[]) {
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      await walk(full, baseDir, out);
      continue;
    }
    const rel = path.relative(baseDir, full).replaceAll('\\', '/');
    const text = await fs.readFile(full, 'utf8');
    out.push({ path: rel, text });
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { name } = await context.params;
  const configuredPath = process.env.FLOCI_LOCAL_DATA_PATH?.trim();
  const candidateBasePaths = [
    configuredPath,
    path.resolve(process.cwd(), '../floci/data/lambda-code'),
    '/app/data/lambda-code',
    path.resolve(process.cwd(), '../../floci/data/lambda-code'),
  ].filter((value): value is string => Boolean(value));

  for (const basePath of candidateBasePaths) {
    const functionDir = path.join(basePath, name);
    try {
      const stat = await fs.stat(functionDir);
      if (!stat.isDirectory()) {
        continue;
      }

      const entries: SourceEntry[] = [];
      await walk(functionDir, functionDir, entries);
      entries.sort((a, b) => a.path.localeCompare(b.path));

      return Response.json({ entries, sourcePath: functionDir });
    } catch {
      continue;
    }
  }

  return Response.json(
    {
      error: 'Function source directory not found.',
      searchedBasePaths: candidateBasePaths,
      hint: 'Mount the Floci data directory into the UI container and set FLOCI_LOCAL_DATA_PATH to /app/data/lambda-code.',
    },
    { status: 404 }
  );
}
