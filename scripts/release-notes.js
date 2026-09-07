const fs = require('node:fs');
const path = require('node:path');

function extractReleaseNotes(changelog, requestedVersion) {
  const version = String(requestedVersion || '').trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('A valid release version is required.');
  }

  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^##\\s+v?${escapedVersion}(?:\\s+[^\\r\\n]*)?$`, 'mi');
  const match = heading.exec(changelog);
  if (!match) throw new Error(`CHANGELOG.md has no section for ${version}.`);

  const bodyStart = match.index + match[ 0 ].length;
  const remaining = changelog.slice(bodyStart);
  const nextSection = remaining.search(/^##\s+/m);
  const notes = (nextSection === -1 ? remaining : remaining.slice(0, nextSection)).trim();
  if (!notes || /TODO|describe this release|replace me/i.test(notes)) {
    throw new Error(`CHANGELOG.md section ${version} does not contain finished release notes.`);
  }
  return notes;
}

function main() {
  const version = process.argv[ 2 ];
  const outputFlag = process.argv.indexOf('--output');
  const outputPath = outputFlag === -1 ? null : process.argv[ outputFlag + 1 ];
  if (outputFlag !== -1 && !outputPath) throw new Error('--output requires a file path.');

  const root = path.resolve(__dirname, '..');
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const notes = `${extractReleaseNotes(changelog, version)}\n`;
  if (outputPath) {
    fs.writeFileSync(path.resolve(root, outputPath), notes, 'utf8');
  } else {
    process.stdout.write(notes);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Release notes error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { extractReleaseNotes };
