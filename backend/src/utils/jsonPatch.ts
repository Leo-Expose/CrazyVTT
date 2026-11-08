/**
 * JSON Patch Utility (RFC 6902)
 * Applies JSON patches to objects
 */

export interface JsonPatch {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

type PatchValue = string | number | boolean | null | PatchObject | PatchValue[];
interface PatchObject { [key: string]: PatchValue }
type PatchContainer = PatchObject | PatchValue[];
interface PathTarget { parent: PatchContainer; key: string | number; isArray: boolean }

function isPatchObject(value: unknown): value is PatchObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toPatchValue(value: unknown): PatchValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toPatchValue);
  if (isPatchObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toPatchValue(child)]));
  }
  throw new Error('Patch values must contain only JSON data');
}

function getChild(value: PatchValue, key: string): PatchValue | undefined {
  const bracketIndex = key.match(/^(\w+)\[(\d+)\]$/);
  if (bracketIndex) {
    const property = isPatchObject(value) ? value[bracketIndex[1]] : undefined;
    return Array.isArray(property) ? property[Number(bracketIndex[2])] : undefined;
  }
  if (Array.isArray(value) && /^\d+$/.test(key)) return value[Number(key)];
  return isPatchObject(value) ? value[key] : undefined;
}

function readTarget(target: PathTarget): PatchValue | undefined {
  if (target.isArray) {
    return Array.isArray(target.parent) && typeof target.key === 'number'
      ? target.parent[target.key]
      : undefined;
  }
  return isPatchObject(target.parent) && typeof target.key === 'string'
    ? target.parent[target.key]
    : undefined;
}

function insertAtTarget(target: PathTarget, value: PatchValue): void {
  if (target.isArray) {
    if (!Array.isArray(target.parent) || typeof target.key !== 'number') throw new Error('Invalid array target');
    target.parent.splice(Math.min(target.key, target.parent.length), 0, value);
  } else {
    if (!isPatchObject(target.parent) || typeof target.key !== 'string') throw new Error('Invalid object target');
    target.parent[target.key] = value;
  }
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function getParentAndKey(obj: object, path: string): PathTarget | null {
  const keys = path.split('/').filter(Boolean);
  if (keys.length === 0) return null;

  let current: PatchValue = obj as PatchObject;
  for (let i = 0; i < keys.length - 1; i++) {
    current = getChild(current, keys[i]) as PatchValue;
    if (current === undefined || current === null) return null;
  }

  const lastKey = keys[keys.length - 1];
  const arrayMatch = lastKey.match(/^(\w+)\[(\d+)\]$/);
  if (arrayMatch) {
    const parent = isPatchObject(current) ? current[arrayMatch[1]] : undefined;
    return Array.isArray(parent) ? { parent, key: Number(arrayMatch[2]), isArray: true } : null;
  }
  if (Array.isArray(current) && /^\d+$/.test(lastKey)) {
    return { parent: current, key: Number(lastKey), isArray: true };
  }
  return isPatchObject(current) ? { parent: current, key: lastKey, isArray: false } : null;
}

function getValueAtPath(obj: object, path: string): PatchValue | undefined {
  const keys = path.split('/').filter(Boolean);
  let current: PatchValue = obj as PatchObject;
  for (const key of keys) {
    current = getChild(current, key) as PatchValue;
    if (current === undefined) return undefined;
  }
  return current;
}

export function applyPatch(obj: object, patches: JsonPatch[]): object {
  const result = deepClone(obj);

  for (const patch of patches) {
    switch (patch.op) {
      case 'add': {
        const target = getParentAndKey(result, patch.path);
        if (!target) throw new Error(`Cannot add: path ${patch.path} not found`);
        if (patch.value === undefined) throw new Error('Add operation requires a value');
        const value = toPatchValue(patch.value);
        if (target.isArray) {
          const arr = target.parent;
          if (!Array.isArray(arr)) throw new Error(`Target is not an array: ${patch.path}`);
          const index = Math.min(target.key as number, arr.length);
          arr.splice(index, 0, value);
        } else {
          insertAtTarget(target, value);
        }
        break;
      }
      case 'remove': {
        const target = getParentAndKey(result, patch.path);
        if (!target) throw new Error(`Cannot remove: path ${patch.path} not found`);
        if (target.isArray) {
          const arr = target.parent;
          if (!Array.isArray(arr)) throw new Error(`Target is not an array: ${patch.path}`);
          arr.splice(target.key as number, 1);
        } else {
          if (!isPatchObject(target.parent) || typeof target.key !== 'string') throw new Error(`Target is not an object: ${patch.path}`);
          delete target.parent[target.key];
        }
        break;
      }
      case 'replace': {
        const target = getParentAndKey(result, patch.path);
        if (!target) throw new Error(`Cannot replace: path ${patch.path} not found`);
        if (patch.value === undefined) throw new Error('Replace operation requires a value');
        const value = toPatchValue(patch.value);
        if (target.isArray) {
          const arr = target.parent;
          if (!Array.isArray(arr)) throw new Error(`Target is not an array: ${patch.path}`);
          arr[target.key as number] = value;
        } else {
          insertAtTarget(target, value);
        }
        break;
      }
      case 'move': {
        if (!patch.from) throw new Error('Move operation requires "from" path');
        const fromTarget = getParentAndKey(result, patch.from);
        const toTarget = getParentAndKey(result, patch.path);
        if (!fromTarget || !toTarget) throw new Error(`Move path not found: ${patch.from} -> ${patch.path}`);
        const value = fromTarget.isArray
          ? Array.isArray(fromTarget.parent) && typeof fromTarget.key === 'number'
            ? fromTarget.parent.splice(fromTarget.key, 1)[0]
            : undefined
          : (() => {
            const v = readTarget(fromTarget);
            if (isPatchObject(fromTarget.parent) && typeof fromTarget.key === 'string') delete fromTarget.parent[fromTarget.key];
            return v;
          })();
        if (value === undefined) throw new Error(`Move source not found: ${patch.from}`);
        if (toTarget.isArray) {
          const arr = toTarget.parent;
          if (!Array.isArray(arr)) throw new Error(`Target is not an array: ${patch.path}`);
          const index = Math.min(toTarget.key as number, arr.length);
          arr.splice(index, 0, value);
        } else {
          insertAtTarget(toTarget, value);
        }
        break;
      }
      case 'copy': {
        if (!patch.from) throw new Error('Copy operation requires "from" path');
        const fromTarget = getParentAndKey(result, patch.from);
        const toTarget = getParentAndKey(result, patch.path);
        if (!fromTarget || !toTarget) throw new Error(`Copy path not found: ${patch.from} -> ${patch.path}`);
        const sourceValue = readTarget(fromTarget);
        if (sourceValue === undefined) throw new Error(`Copy source not found: ${patch.from}`);
        const value = deepClone(sourceValue);
        if (toTarget.isArray) {
          const arr = toTarget.parent;
          if (!Array.isArray(arr)) throw new Error(`Target is not an array: ${patch.path}`);
          const index = Math.min(toTarget.key as number, arr.length);
          arr.splice(index, 0, value);
        } else {
          insertAtTarget(toTarget, value);
        }
        break;
      }
      case 'test': {
        const value = getValueAtPath(result, patch.path);
        if (JSON.stringify(value) !== JSON.stringify(patch.value)) {
          throw new Error(`Test failed at path ${patch.path}`);
        }
        break;
      }
    }
  }

  return result;
}

export function generatePatch(oldObj: object, newObj: object): JsonPatch[] {
  const patches: JsonPatch[] = [];
  generatePatchRecursive(oldObj, newObj, '', patches);
  return patches;
}

function generatePatchRecursive(
  oldVal: unknown,
  newVal: unknown,
  path: string,
  patches: JsonPatch[]
): void {
  if (oldVal === newVal) return;

  if (oldVal === undefined || oldVal === null) {
    if (newVal !== undefined && newVal !== null) {
      patches.push({ op: 'add', path: path || '/', value: toPatchValue(newVal) });
    }
    return;
  }

  if (newVal === undefined || newVal === null) {
    patches.push({ op: 'remove', path: path || '/' });
    return;
  }

  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    // Simple array diff - replace entire array for now
    // A more sophisticated implementation would do LCS
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      patches.push({ op: 'replace', path: path || '/', value: toPatchValue(newVal) });
    }
    return;
  }

  if (typeof oldVal === 'object' && typeof newVal === 'object') {
    if (!isPatchObject(oldVal) || !isPatchObject(newVal)) {
      patches.push({ op: 'replace', path: path || '/', value: newVal as PatchValue });
      return;
    }
    const oldKeys = new Set(Object.keys(oldVal));
    const newKeys = new Set(Object.keys(newVal));
    const allKeys = new Set([...oldKeys, ...newKeys]);

    for (const key of allKeys) {
      const newPath = path ? `${path}/${key}` : `/${key}`;
      if (!oldKeys.has(key)) {
        patches.push({ op: 'add', path: newPath, value: toPatchValue(newVal[key]) });
      } else if (!newKeys.has(key)) {
        patches.push({ op: 'remove', path: newPath });
      } else {
        generatePatchRecursive(oldVal[key], newVal[key], newPath, patches);
      }
    }
    return;
  }

  // Primitive values
  patches.push({ op: 'replace', path: path || '/', value: toPatchValue(newVal) });
}
