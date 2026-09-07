const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const argumentsList = process.argv.slice(2);
const prerelease = argumentsList.includes('--prerelease');
const dryRun = argumentsList.includes('--dry-run');

if (argumentsList.includes('--help')) {
  console.log('Usage: npm run release -- [--prerelease] [--dry-run]');
  console.log('Validates the committed main branch, runs checks, then starts the GitHub Release workflow.');
  process.exit(0);
}

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit'
  });
  return typeof output === 'string' ? output.trim() : '';
}

function capture(command, args) {
  return run(command, args, { capture: true });
}

function runNpm(args) {
  const npmEntryPoint = process.env.npm_execpath;
  if (!npmEntryPoint) {
    fail('run the release helper through npm run release.');
  }
  return run(process.execPath, [npmEntryPoint, ...args]);
}

function fail(message) {
  console.error(`Release stopped: ${message}`);
  process.exit(1);
}

const unknownArguments = argumentsList.filter((argument) => !['--prerelease', '--dry-run'].includes(argument));
if (unknownArguments.length) fail(`unknown option ${unknownArguments[ 0 ]}`);

const version = require(path.join(root, 'package.json')).version;
const tag = `v${version}`;

try {
  if (capture('git', ['branch', '--show-current']) !== 'main') {
    fail('switch to the main branch before publishing.');
  }
  if (capture('git', ['status', '--porcelain'])) {
    fail('commit or stash all changes before publishing.');
  }

  const localCommit = capture('git', ['rev-parse', 'HEAD']);
  const remoteLine = capture('git', ['ls-remote', 'origin', 'refs/heads/main']);
  const remoteCommit = remoteLine.split(/\s+/)[ 0 ];
  if (!remoteCommit || localCommit !== remoteCommit) {
    fail('push the current main branch to origin before publishing.');
  }

  const existing = spawnSync('gh', ['release', 'view', tag], { cwd: root, stdio: 'ignore' });
  if (existing.status === 0) fail(`release ${tag} already exists. Increase the package version first.`);

  run(process.execPath, [path.join(root, 'scripts', 'release-notes.js'), version], { capture: true });

  console.log(`Preparing Flect ${tag}${prerelease ? ' prerelease' : ''}...`);
  runNpm(['run', 'check']);
  runNpm(['test']);

  if (dryRun) {
    console.log(`Dry run passed. ${tag} is ready to publish.`);
    process.exit(0);
  }

  run('gh', [
    'workflow', 'run', 'release.yml', '--ref', 'main',
    '--raw-field', `version=${version}`,
    '--raw-field', `prerelease=${prerelease}`
  ]);
  console.log(`Release workflow started for ${tag}. Follow it with: gh run watch`);
} catch (error) {
  fail(error.message);
}
