export { createElement } from 'react';
export { renderToString, renderToStaticMarkup } from 'react-dom/server';
export { __setRouterData } from 'fnext/router';

const kSerializeCustom = Symbol.for('fnext.serialize.custom');

const errRecursive = Symbol('error-recursive');
const errNotSerializable = Symbol('error-not-serializable');

function _serializeValue(
  val: unknown,
  parents: Array<object>
):
  | string
  | {
      path: Array<string>;
      error: typeof errRecursive | typeof errNotSerializable;
    } {
  switch (typeof val) {
    case 'string':
      return JSON.stringify(val);
    case 'number':
    case 'bigint':
    case 'boolean':
    case 'undefined':
      return String(val);
    case 'object':
      if (val === null) {
        return 'null';
      }

      if (Reflect.has(val, kSerializeCustom)) {
        return Reflect.get(val, kSerializeCustom)();
      }

      if (val instanceof Date) {
        return `new Date(${val.getTime()})`;
      }

      if (Array.isArray(val)) {
        let strs = Array(val.length);

        for (let i = 0; i < val.length; i++) {
          const item = val[i];

          if (parents.includes(item)) {
            return { error: errRecursive, path: [`[${i}]`] };
          }

          const ret = _serializeValue(item, [...parents, item]);

          if (typeof ret === 'object') {
            return {
              error: ret.error,
              path: ret.path.concat(`[${i}]`),
            };
          }

          strs[i] = ret;
        }

        return `[${strs.join(',')}]`;
      }

      if (Reflect.getPrototypeOf(val) !== Object.prototype) {
        throw new TypeError('Unable to serialize value: ' + val);
      }

      const entries = Object.entries(val);
      const entryStrings = Array<string>(entries.length);

      for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i];

        if (parents.includes(value)) {
          return {
            error: errRecursive,
            path: [`.${key}`],
          };
        }

        const ret = _serializeValue(value, [...parents, value]);

        // Checks if a key is a valid literal for an object key.
        // (that is: a number or identifier)
        if (/^\d+$|^[a-z_$][0-9a-z_$]*$/i.test(key)) {
          if (typeof ret === 'object') {
            return {
              error: ret.error,
              path: ret.path.concat(`.${i}`),
            };
          }

          entryStrings[i] = key;
        } else {
          if (typeof ret === 'object') {
            return {
              error: ret.error,
              path: ret.path.concat(`[${i}]`),
            };
          }

          entryStrings[i] = JSON.stringify(key);
        }

        entryStrings[i] += ':' + ret;
      }

      return `{${entryStrings.join(',')}}`;
    default:
      // functions
      throw new TypeError('Unable to serialize type: ' + typeof val);
  }
}

export function serializeValue(value: unknown): string {
  const result = _serializeValue(
    value,
    typeof value === 'object' && value ? [value] : []
  );

  if (typeof result === 'object') {
    const path = result.path.reverse().join('');

    switch (result.error) {
      case errNotSerializable:
        throw new TypeError('Unable to serialize value at: {input}' + path);
      case errRecursive:
        throw new TypeError(
          'Unable to serialize recursive field at: {input}' + path
        );
    }
  }

  return result;
}
