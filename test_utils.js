const fs = require('fs');
const assert = require('assert');

function fixJsonControlCharsOriginal(str) {
  if (!/[\x00-\x1F]/.test(str)) return str;

  return str.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    return match.replace(/[\x00-\x1F]/g, (c) => {
      if (c === '\n') return '\\n'
      if (c === '\r') return '\\r'
      if (c === '\t') return '\\t'
      return `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
    })
  })
}

function fixJsonControlCharsNew(str) {
  if (!/[\x00-\x1F]/.test(str)) return str;

  let result = '';
  let lastIndex = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const char = str[i];

    if (!inString) {
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    // We are inside a string
    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = false;
      continue;
    }

    if (code <= 0x1F) {
      // Append unmodified chunk
      result += str.slice(lastIndex, i);
      lastIndex = i + 1;

      // Append escaped character
      if (char === '\n') result += '\\n';
      else if (char === '\r') result += '\\r';
      else if (char === '\t') result += '\\t';
      else result += `\\u${code.toString(16).padStart(4, '0')}`;
    }
  }

  result += str.slice(lastIndex);
  return result;
}

const testCases = [
  '{"key": "value"}',
  '{"key": "val\nue"}',
  '{"key": "val\rue"}',
  '{"key": "val\tue"}',
  '{"key": "val\x00ue"}',
  '{"key": "val\\"ue\n"}',
  '{"key": "value", "key2": "\n"}',
  'Outside string \n {"key": "\n"} \t',
];

for (const tc of testCases) {
  const orig = fixJsonControlCharsOriginal(tc);
  const repl = fixJsonControlCharsNew(tc);
  if (orig !== repl) {
    console.log("MISMATCH!");
    console.log("Original:", JSON.stringify(orig));
    console.log("New:", JSON.stringify(repl));
  } else {
    console.log("MATCH:", JSON.stringify(orig));
  }
}
