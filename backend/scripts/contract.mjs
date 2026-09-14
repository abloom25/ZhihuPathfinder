import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const spec = YAML.parse(readFileSync(new URL('../contract/openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const rewrite = value => JSON.parse(JSON.stringify(value).replaceAll('#/components/schemas/', '#/$defs/'));
const definitions = rewrite(spec.components.schemas);
const validators = new Map();
export function assertSchema(name, data) {
  if (!validators.has(name)) validators.set(name, ajv.compile({
    $defs: definitions, $ref: `#/$defs/${name}`,
  }));
  const validate = validators.get(name);
  assert.ok(validate(data), `${name}: ${ajv.errorsText(validate.errors)}`);
}
export function assertResponse(path, method, status, body) {
  const response = spec.paths[path]?.[method.toLowerCase()]?.responses[String(status)];
  assert.ok(response, `Undeclared HTTP status ${method} ${path}: ${status}`);
  const name = response.content['application/json'].schema.$ref.split('/').at(-1);
  assertSchema(name, body);
  return name;
}
