function fixJsonControlCharsRegex(str) {
  if (!/[\x00-\x1F]/.test(str)) return str

  return str.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    return match.replace(/[\x00-\x1F]/g, (c) => {
      if (c === '\n') return '\\n'
      if (c === '\r') return '\\r'
      if (c === '\t') return '\\t'
      return `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
    })
  })
}

function fixJsonControlCharsSM(str) {
  if (!/[\x00-\x1F]/.test(str)) return str;

  let result = '';
  let inString = false;
  let isEscaped = false;
  let lastIndex = 0;

  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (charCode === 92) { // '\\'
        isEscaped = true;
      } else if (charCode === 34) { // '"'
        inString = false;
      } else if (charCode <= 0x1F) {
        result += str.slice(lastIndex, i);
        if (charCode === 10) result += '\\n';
        else if (charCode === 13) result += '\\r';
        else if (charCode === 9) result += '\\t';
        else result += '\\u' + charCode.toString(16).padStart(4, '0');
        lastIndex = i + 1;
      }
    } else {
      if (charCode === 34) { // '"'
        inString = true;
      }
    }
  }

  result += str.slice(lastIndex);
  return result;
}

const test1 = '{"key": "value\\n"}';
console.log(fixJsonControlCharsRegex(test1) === fixJsonControlCharsSM(test1));

const test2 = '{"key": "value\n"}';
console.log(fixJsonControlCharsRegex(test2) === fixJsonControlCharsSM(test2));

const test3 = '{"key": "value\n", "key2": "other\r\t\x01"}';
console.log(fixJsonControlCharsRegex(test3) === fixJsonControlCharsSM(test3));
