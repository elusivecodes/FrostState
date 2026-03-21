/**
 * Checks whether a value is a plain object constructed by `Object`.
 * Values with a null prototype and class instances return `false`.
 * @param {*} value The value to test.
 * @returns {boolean} Whether the value is a plain object.
 */
export function isPlainObject(value) {
    return value?.constructor === Object;
};
