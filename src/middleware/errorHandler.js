import { errorDictionary } from '../utils/errorDictionary.js';

function extractFileAndLine(stack) {
  if (!stack) return 'Unknown file/line';
  const lines = stack.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/at\s+(?:.*\s+\()?([^:]+):(\d+):\d+\)?/);
    if (match) {
      return `File: ${match[1]}, Line: ${match[2]}`;
    }
  }
  return 'Unknown file/line';
}

export function errorHandler(err, req, res, next) {
  console.error('[Error Handler]', err);

  const errorCode = err.code || 'ERR_DEFAULT';
  const errorInfo = errorDictionary[errorCode] || errorDictionary['ERR_DEFAULT'];

  const fileAndLine = extractFileAndLine(err.stack);
  const detailedDescription = `Original Error: ${err.message || 'No message'} - Occurred at: ${fileAndLine}`;

  res.status(errorInfo.status).json({
    "Id": errorCode,
    "short description": errorInfo.short_description,
    "detailed description": detailedDescription
  });
}
