#!/usr/bin/env node
/**
 * Build discord-gateway from public GitHub via Zeabur CICD API.
 * Use when service source is OCI registry and deployFromSpecification fails.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const branch = process.env.ZEABUR_BRANCH ?? 'cursor/p4-1-activity-domain';
const gitUrl = 'https://github.com/HOMZIKx/V2.git';
const dockerfile = process.env.ZEABUR_DOCKERFILE ?? 'Dockerfile.discord-gateway';
const region = process.env.ZEABUR_REGION ?? 'hetzner-fsn1';

function readToken() {
  const fromEnv = process.env.ZEABUR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  return yaml.match(/token:\s*(\S+)/)?.[1];
}

async function gql(token, query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const token = readToken();
const result = await gql(
  token,
  `mutation Build($input: CreateCICDBuildInput!) {
    createCICDBuild(input: $input) { id status }
  }`,
  {
    input: {
      region,
      dockerfile,
      rootDirectory: '/',
      source: {
        git: {
          url: gitUrl,
          ref: branch,
          authentication: { type: 'PUBLIC' },
        },
      },
    },
  },
);
console.log(JSON.stringify(result, null, 2));
