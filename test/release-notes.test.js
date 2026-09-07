const assert = require('node:assert/strict');
const test = require('node:test');

const { extractReleaseNotes } = require('../scripts/release-notes');

test('extracts the requested release section only', () => {
  const changelog = '# Changelog\n\n## 1.1.0 — Today\n\nUseful notes.\n\n## 1.0.0\n\nOld notes.\n';
  assert.equal(extractReleaseNotes(changelog, 'v1.1.0'), 'Useful notes.');
});

test('rejects missing or unfinished release notes', () => {
  assert.throws(() => extractReleaseNotes('# Changelog\n', '1.1.0'), /no section/);
  assert.throws(() => extractReleaseNotes('## 1.1.0\n\nTODO', '1.1.0'), /finished release notes/);
});
