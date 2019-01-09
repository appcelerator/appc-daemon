/* eslint max-depth: ['warn', 7] */
/* eslint-disable promise/no-nesting */

/* istanbul ignore if */
if (!Error.prepareStackTrace) {
	require('source-map-support/register');
}

import appcdLogger from 'appcd-logger';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import pluralize from 'pluralize';
import progress from 'progress';
import request from 'appcd-request';
import tar from 'tar-stream';
import tmp from 'tmp';
import yauzl from 'yauzl';
import zlib from 'zlib';

import { execSync, spawn, spawnSync } from 'child_process';
import { isDir, isFile } from 'appcd-fs';
import { arch as getArch, formatNumber, sleep } from 'appcd-util';
import { STATUS_CODES } from 'http';

const logger = appcdLogger('appcd:nodejs');
const { highlight } = appcdLogger.styles;

/**
 * A regular expression to match archive filenames.
 * @type {RegExp}
 */
const archiveRegExp = /\.(zip|pkg|tar\.gz)$/;

/**
 * Determines the platform specific Node.js executable.
 *
 * @returns {String}
 */
export function getNodeFilename() {
	const platform = process.env.APPCD_TEST_PLATFORM || process.platform;
	return platform === 'win32' ? 'node.exe' : 'node';
}

/**
 * Ensures the correct Node.js version is installed and ready to go. If the
 * required Node.js version is not installed, initiate the download.
 *
 * @param {Object} params - Various parameters.
 * @param {String} params.arch - The compiled machine architecture.
 * @param {String} params.nodeHome - The path to where downloaded Node.js
 * binaries are stored.
 * @param {String} params.version - The Node.js version to ensure is installed.
 * @returns {Promise} Resolves the path to the requested Node.js binary.
 */
export function prepareNode({ arch, nodeHome, version } = {}) {
	if (!arch) {
		arch = getArch();
	}
	if (arch !== 'x86' && arch !== 'x64') {
		throw new Error('Expected arch to be "x86" or "x64"');
	}

	if (!nodeHome || typeof nodeHome !== 'string') {
		throw new TypeError('Expected Node home to be a non-empty string');
	}

	if (!version || typeof version !== 'string') {
		throw new TypeError('Expected version to be a non-empty string');
	}

	if (version[0] !== 'v') {
		version = `v${version}`;
	}

	const platform = process.env.APPCD_TEST_PLATFORM || process.platform;
	const binaryPath = path.join(nodeHome, version, platform, arch);
	const binary = path.join(binaryPath, getNodeFilename());

	logger.log('Checking %s', highlight(binary));

	if (isFile(binary) && spawnSync(binary, [ '--version' ], { encoding: 'utf8' }).stdout.trim() === version) {
		logger.log(`Node.js ${version} ready`);
		return Promise.resolve(binary);
	}

	// delete the existing path just in case
	fs.removeSync(binaryPath);

	return downloadNode({ arch, nodeHome, version });
}

/**
 * Downloads a Node.js version. The archive is extracted to the specified Node
 * home path.
 *
 * @param {Object} params - Various parameters.
 * @param {String} params.arch - The compiled machine architecture.
 * @param {String} params.nodeHome - The path to where downloaded Node.js
 * binary should be extracted to.
 * @param {String} params.version - The Node.js version to download.
 * @returns {Promise}
 */
export async function downloadNode({ arch, nodeHome, version } = {}) {
	if (version[0] !== 'v') {
		version = `v${version}`;
	}

	const platform = process.env.APPCD_TEST_PLATFORM || process.platform;

	let filename;
	if (platform === 'darwin') {
		filename = `node-${version}.pkg`;
	} else if (platform === 'win32') {
		filename = `node-${version}-win-${arch}.zip`;
	} else {
		filename = `node-${version}-${platform}-${arch}.tar.gz`;
	}

	const url = `https://nodejs.org/dist/${version}/${filename}`;
	const outFile = path.join(os.tmpdir(), filename);
	const out = fs.createWriteStream(outFile);

	try {
		logger.log('Downloading %s => %s', highlight(url), highlight(outFile));

		// download node
		const req = await request({ url });

		return await new Promise((resolve, reject) => {
			req.on('response', response => {
				if (response.statusCode !== 200) {
					return reject(new Error(`Failed to download Node.js: ${response.statusCode} - ${STATUS_CODES[response.statusCode]}`));
				}

				const len = parseInt(response.headers['content-length']);

				if (logger.enabled) {
					const bar = new progress('  [:bar] :percent :etas', {
						clear: true,
						complete: '=',
						incomplete: ' ',
						width: 50,
						total: len
					});

					response.on('data', chunk => bar.tick(chunk.length));
				}

				response.once('end', async () => {
					try {
						logger.log(`Downloaded ${formatNumber(len)} bytes`);
						resolve(await extractNode({
							archive: outFile,
							dest: path.join(nodeHome, version, platform, arch)
						}));
					} catch (err) {
						reject(err);
					}
				});
			});

			req.once('error', reject);
			req.pipe(out);
		});
	} catch (err) {
		logger.error(err);
		throw err;
	} finally {
		if (isFile(outFile)) {
			await fs.remove(outFile);
		}
	}
}

/**
 * Extracts the download Node.js archive.
 *
 * @param {Object} params - Various parameters.
 * @param {String} params.archive - The path to the Node.js archive.
 * @param {String} params.dest - The path to extract the Node.js executable to.
 * @returns {Promise}
 */
export function extractNode({ archive, dest }) {
	return new Promise((resolve, reject) => {
		if (!archiveRegExp.test(archive)) {
			return reject(new Error(`Unsupported archive: ${archive}`));
		}

		if (!dest || typeof dest !== 'string') {
			return reject(new TypeError('Expected dest to be a string'));
		}

		if (!isDir(dest)) {
			logger.log('Creating %s', highlight(dest));
			fs.mkdirsSync(dest);
		}

		let target = null;
		const binary = getNodeFilename();
		let binaryPath = path.join(dest, binary);

		if (/\.zip$/.test(archive)) {
			logger.log(`Extracting zip file: ${archive}`);
			yauzl.open(archive, { autoClose: true, lazyEntries: true }, function (err, zipfile) {
				if (err) {
					return reject(err);
				}

				zipfile
					.once('error', reject)
					.on('entry', entry => {
						if (!target) {
							target = `${entry.fileName.split('/')[0]}/${getNodeFilename()}`;
						}

						if (entry.fileName === target) {
							logger.log(`Found node executable (${formatNumber(entry.uncompressedSize)} bytes)`);
							zipfile.openReadStream(entry, (err, stream) => {
								stream.pipe(fs.createWriteStream(binaryPath));
								stream.once('end', () => {
									zipfile.close();
									resolve(binaryPath);
								});
							});
						} else {
							zipfile.readEntry();
						}
					})
					.once('end', resolve)
					.readEntry();
			});

		} else if (/\.pkg$/.test(archive)) {
			const dir = tmp.tmpNameSync({ prefix: 'appcd-nodejs-' });

			logger.log('Executing: %s', highlight(`pkgutil --expand "${archive}" "${dir}"`));
			let result = spawnSync('pkgutil', [ '--expand', archive, dir ]);
			if (result.status) {
				fs.removeSync(dir);
				return reject(new Error(`Failed to extract pkg: ${result.stderr.toString().trim()} (code ${result.status})`));
			}

			try {
				const nodePkgRegExp = /^(local|node-v.+)\.pkg$/;
				let cwd;
				for (const name of fs.readdirSync(dir)) {
					if (nodePkgRegExp.test(name)) {
						cwd = path.join(dir, name);
						break;
					}
				}

				if (!cwd) {
					throw new Error('Failed to find package directory in archive');
				}

				logger.log('Executing: %s', highlight(`CWD=${cwd} cat Payload | gzip -d | cpio -id`));
				execSync('cat Payload | gzip -d | cpio -id', { cwd, stdio: 'ignore' });

				let nodeBinary = path.join(cwd, 'bin', 'node');
				if (isFile(nodeBinary)) {
					fs.renameSync(nodeBinary, binaryPath);
				} else {
					nodeBinary = path.join(cwd, 'usr', 'local', 'bin', 'node');
					if (isFile(nodeBinary)) {
						fs.renameSync(nodeBinary, binaryPath);
					} else {
						binaryPath = null;
					}
				}
			} catch (e) {
				return reject(new Error(`Failed to extract pkg payload: ${e.message || e.toString()}`));
			} finally {
				fs.removeSync(dir);
			}

			resolve(binaryPath);

		} else if (/\.tar\.gz$/.test(archive)) {
			logger.log('Extracting tarball: %s', highlight(archive));

			const gunzip = zlib
				.createGunzip()
				.once('error', reject);

			const extract = tar
				.extract()
				.on('entry', (header, stream, cb) => {
					if (!target) {
						target = `${header.name.split('/')[0]}/bin/${binary}`;
					}

					if (header.name === target) {
						logger.log(`Found node executable (${formatNumber(header.size)})`);
						stream.pipe(fs.createWriteStream(binaryPath));
						stream.once('end', () => {
							extract.destroy();
							logger.log(`Setting node executable mode to ${header.mode.toString(8)}`);
							fs.chmodSync(binaryPath, header.mode);
							resolve(binaryPath);
						});
					} else {
						stream.once('end', cb).resume();
					}
				})
				.once('finish', resolve)
				.once('error', reject);

			fs.createReadStream(archive)
				.pipe(gunzip)
				.pipe(extract);
		}
	}).then(binaryPath => {
		if (binaryPath) {
			return binaryPath;
		}
		throw new Error(`Unable to find node executable in downloaded archive: ${archive}`);
	}).catch(err => {
		logger.error(err);
		throw err;
	});
}

/**
 * Analyzes the V8 memory setting value and generates the `--max_old_space_size` argument.
 *
 * @param {String} value - The V8 memory setting value.
 * @param {String} [arch] - The desired Node.js architecture. Must be `x86` or `x64`. Defaults to
 * the current machine architecture.
 * @returns {?String}
 */
export function generateV8MemoryArgument(value, arch) {
	if (!value) {
		return;
	}

	if (value === 'auto') {
		if (!arch) {
			arch = getArch();
		}
		if (arch !== 'x86' && arch !== 'x64') {
			throw new Error('Expected arch to be "x86" or "x64"');
		}

		const defaultMem = arch === 'x64' ? 1400 : 700;
		const totalMem = Math.floor(os.totalmem() / 1e6);
		// you must have at least double the RAM of the default memory amount
		if (totalMem * 0.5 > defaultMem) {
			value = Math.min(totalMem * 0.5, 3000);
		} else {
			value = null;
		}
	}

	if (value) {
		return `--max_old_space_size=${Math.round(value)}`;
	}
}

/**
 * Spawns the specified script using the specified Node.js version.
 *
 * @param {Object} params - Various parameters.
 * @param {String} [params.arch] - The desired Node.js architecture. Must be `x86` or `x64`.
 * Defaults to the current machine architecture.
 * @param {String} params.args - The arguments to pass into Node.js.
 * @param {Boolean} [params.detached=false] - When `true`, detaches the child
 * process.
 * @param {Array<String>} [params.nodeArgs] - Node and V8 arguments to pass into
 * the Node process. Useful for specifying V8 settings or enabling debugging.
 * @param {String} params.nodeHome - The path to where Node.js executables are
 * stored.
 * @param {String|Array.<String>} [params.stdio] - The stdio settings to pass into `spawn()`.
 * Defaults to 'ignore` if `detached` is `true`, otherwise `inherit`.
 * @param {Number|String} params.v8mem - The maximum amount of memory for child
 * Node.js process's V8 engine to use. The value must either be the number of
 * megabytes or the string `auto`, which will automatically select a sensible
 * size based on the system architecture and installed memory.
 * @param {String} params.version - The Node.js version to use.
 * @returns {Promise<ChildProcess>}
 */
export async function spawnNode({ arch, args, detached, nodeHome, nodeArgs, stdio, v8mem = 'auto', version }) {
	if (v8mem && (typeof v8mem !== 'number' && v8mem !== 'auto')) {
		throw new TypeError('Expected v8mem to be a number or "auto"');
	}

	if (!arch) {
		arch = getArch();
	}
	if (arch !== 'x86' && arch !== 'x64') {
		throw new Error('Expected arch to be "x86" or "x64"');
	}

	const node = await prepareNode({ arch, nodeHome, version });
	if (!Array.isArray(nodeArgs)) {
		nodeArgs = [];
	}

	if (v8mem && !nodeArgs.some(arg => arg.indexOf('--max_old_space_size=') === 0)) {
		const arg = generateV8MemoryArgument(v8mem, arch);
		if (arg) {
			nodeArgs.push(arg);
		}
	}

	args.unshift.apply(args, nodeArgs);

	const opts = {
		stdio: 'inherit'
	};

	if (detached) {
		opts.detached    = true;
		opts.stdio       = 'ignore';
		opts.windowsHide = true;
	}

	if (stdio) {
		// if stdio is set, then override the default
		opts.stdio = stdio;
	}

	const prettyArgs = args
		.map(s => {
			return s.indexOf(' ') === -1 ? s : `"${s}"`;
		})
		.join(' ');

	logger.log('Spawning: %s', highlight(`${node} ${prettyArgs} # ${JSON.stringify(opts)}`));

	// write the last run file
	fs.writeFileSync(path.join(path.dirname(node), '.lastrun'), Date.now());

	let tries = 3;

	return (async function trySpawn() {
		try {
			tries--;
			const child = spawn(node, args, opts);
			if (detached) {
				child.unref();
			}
			return child;
		} catch (err) {
			if ((err.code === 'ETXTBSY' || err.code === 'EBUSY') && tries) {
				logger.log(`Spawn threw ${err.code}, retrying...`);
				await sleep(50);
				return await trySpawn();
			}
			throw err;
		}
	}());
}

/**
 * Finds all unused Node.js executables that are older than the specified max age and deletes them.
 *
 * @param {Number} maxAge - The maximum age for unused Node.js executables.
 * @returns {Array.<String>} A list of unused Node.js executables that were removed.
 */
export function purgeUnusedNodejsExecutables({ maxAge, nodeHome }) {
	const purged = [];

	if (!isDir(nodeHome)) {
		return purged;
	}

	const nodeExecutable = getNodeFilename();
	const now = Date.now();

	const isEmpty = dir => {
		return fs.readdirSync(dir).filter(name => name !== '.DS_Store').length === 0;
	};

	for (const version of fs.readdirSync(nodeHome)) {
		const verDir = path.join(nodeHome, version);
		if (!isDir(verDir)) {
			continue;
		}

		for (const platform of fs.readdirSync(verDir)) {
			const platformDir = path.join(verDir, platform);
			if (!isDir(platformDir)) {
				continue;
			}

			for (const arch of fs.readdirSync(platformDir)) {
				const archDir = path.join(platformDir, arch);

				if (!isDir(archDir)) {
					continue;
				}

				const nodePath = path.join(archDir, nodeExecutable);
				if (!isFile(nodePath)) {
					continue;
				}

				const lastRunFile = path.join(archDir, '.lastrun');

				if (isFile(lastRunFile)) {
					const lastRun = parseInt(fs.readFileSync(lastRunFile, 'utf8').trim());
					if (!isNaN(lastRun)) {
						if ((lastRun + maxAge) < now) {
							purged.push({
								version,
								platform,
								arch
							});

							fs.removeSync(archDir);
						}
						continue;
					}
				}

				// no last run or parsed value was not a number, so create one now
				logger.log('Creating .lastrun file: %s', highlight(lastRunFile));
				fs.writeFileSync(lastRunFile, now);
			}

			if (isEmpty(platformDir)) {
				fs.removeSync(platformDir);
			}
		}

		if (isEmpty(verDir)) {
			fs.removeSync(verDir);
		}
	}

	if (purged.length) {
		logger.log(pluralize(`Purged ${highlight(purged.length)} unused Node.js executable`, purged.length) + ':');
		for (const { version, platform, arch } of purged) {
			logger.log(highlight(`  ${version} ${platform} ${arch}`));
		}
	}

	return purged;
}
