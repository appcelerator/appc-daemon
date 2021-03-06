/* istanbul ignore if */
if (!Error.prepareStackTrace) {
	require('source-map-support/register');
}

import appcdLogger from 'appcd-logger';
import fs from 'fs-extra';
import msgpack from 'msgpack-lite';
import path from 'path';
import WebSocket from 'ws';
import which from 'which';

import { arch } from 'appcd-util';
import { EventEmitter } from 'events';
import { locale } from 'appcd-response';
import { spawnSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

const { error, log } = appcdLogger('appcd:client');
const { alert, highlight, note, ok } = appcdLogger.styles;

/**
 * The client for connecting to the appcd server.
 */
export default class Client {
	/**
	 * Initializes the client.
	 *
	 * @param {Object} [opts] - Various options.
	 * @param {String} [opts.host='127.0.0.1'] - The host to connect to.
	 * @param {Number} [opts.port=1732] - The port to connect to.
	 * @param {String} [opts.userAgent] - The user agent containing the name and
	 * version of the client. If not specified, one will be generated.
	 * @access public
	 */
	constructor(opts = {}) {
		/**
		 * The websocket to the server.
		 * @type {WebSocket}
		 * @access private
		 */
		this.socket = null;

		/**
		 * An internal map used to dispatch responses to requesters.
		 * @type {Object}
		 * @access private
		 */
		this.requests = {};

		/**
		 * The host to connect to.
		 * @type {String}
		 * @access private
		 */
		this.host = opts.host || '127.0.0.1';

		/**
		 * The port to connect to.
		 * @type {Number}
		 * @access private
		 */
		if (opts.port && (typeof opts.port !== 'number' || opts.port < 1 || opts.port > 65535)) {
			throw new TypeError('Invalid port, expected a number between 1 and 65535');
		}
		this.port = opts.port || 1732;

		/**
		 * The user agent containing the name and version of the client. If not
		 * specified, one will be generated.
		 * @type {String}
		 * @access private
		 */
		this.userAgent = constructUserAgent(opts.userAgent);
	}

	/**
	 * Connects to the server via a websocket. You do not need to call this.
	 * `request()` will automatically call this function.
	 *
	 * @param {Object} [params] - Various parameters.
	 * @param {Boolean} [params.startDaemon] - When `true`, ensures the daemon is running and if
	 * not, attempts to locate the daemon, determine the configuration, start it, and re-connect.
	 * @returns {EventEmitter} Emits events `connected`, `close`, and `error`.
	 * @access public
	 */
	connect(params = {}) {
		const emitter = new EventEmitter();

		const tryConnect = async () => {
			if (this.socket) {
				emitter.emit('connected', this);
				return;
			}

			try {
				const headers = {
					'User-Agent': this.userAgent
				};

				const localeValue = process.env.APPCD_LOCALE || await locale();
				if (localeValue) {
					headers['Accept-Language'] = localeValue;
				}

				const url = `ws://${this.host}:${this.port}`;
				log(`Connecting to ${highlight(url)}`);
				const socket = this.socket = new WebSocket(url, { headers });

				socket
					.on('message', data => {
						let json = null;
						if (typeof data === 'string') {
							try {
								json = JSON.parse(data);
							} catch (e) {
								// bad response, shouldn't ever happen
								emitter.emit('warning', `Server returned invalid JSON: ${e.message}`);
								return;
							}
						} else {
							json = msgpack.decode(data);
						}

						if (json && typeof json === 'object' && this.requests[json.id]) {
							this.requests[json.id].handler(json);
						} else {
							emitter.emit('warning', 'Server response is not an object or has an invalid id');
						}
					})
					.on('open', () => emitter.emit('connected', this))
					.once('close', () => emitter.emit('close'))
					.once('error', async err => {
						socket.close();
						this.socket = null;

						if (err.code !== 'ECONNREFUSED' || !params.startDaemon) {
							emitter.emit('error', err);
							return;
						}

						try {
							log(`Failed to connect to appcd: ${highlight(`${this.host}:${this.port}`)}`);
							log('Attempting to locate appcd, then determine configuration...');

							if (this.appcd === undefined) {
								this.appcd = await find('appcd');
							}

							if (this.appcd) {
								if (this.fetchedAppcdConfig) {
									// maybe it just needs to be started?
									log('Starting daemon...');
									run(this.appcd, 'start');

									// at this point, we've done all we can do and if connect() throws an error, then so be it
									return tryConnect();
								}
								log('Fetching appcd config to determine host and port...');

								let start = false;
								this.fetchedAppcdConfig = true;

								try {
									const cfg = JSON.parse(run(this.appcd, 'config', 'get', 'server', '--json').stdout);
									if (cfg) {
										const { host: currentHost, port: currentPort } = this;
										const { hostname: newHost, port: newPort } = cfg.result;
										if (newHost && currentHost !== newHost) {
											this.host = newHost;
											start = true;
										}
										if (newPort && currentPort !== newPort) {
											this.port = newPort;
											start = true;
										}
										if (start) {
											log(`Updating client config from ${highlight(`${currentHost}:${currentPort}`)} to ${highlight(`${newHost}:${newPort}`)}`);
										} else {
											log(`Client config is unchanged: ${highlight(`${currentHost}:${currentPort}`)}`);
										}
									}
								} catch (e) {
									error(`Failed to get appcd config: ${e.message}`);
									start = true;
								}

								if (start) {
									log('Starting daemon...');
									run(this.appcd, 'start');
								}

								return tryConnect();
							}

							log(`${highlight('appcd')} not found, attempting to locate ${highlight('axway')}...`);

							if (this.axwayCLI === undefined) {
								this.axwayCLI = await find('axway');
							}

							if (this.axwayCLI) {
								try {
									// check if appcd is installed
									log('Checking Axway CLI if appcd is installed...');
									const packages = JSON.parse(run(this.axwayCLI, 'pm', 'list', '--json').stdout);
									const appcdPkg = Array.isArray(packages) && packages.filter(p => p.name === 'appcd')[0];
									if (appcdPkg) {
										const appcdPath = path.resolve(appcdPkg.versions[appcdPkg.version].path, 'bin', 'appcd');
										if (fs.existsSync(appcdPath)) {
											this.appcd = appcdPath;
											this.fetchedAppcdConfig = false;
											log(`Axway CLI found appcd: ${highlight(appcd)}`);
										}
										return tryConnect();
									}
								} catch (e) {
									error(`Failed to check Axway CLI for appcd: ${e.message}`);
								}
							} else {
								log(`${highlight('Axway CLI')} not found`);
							}

							throw new Error(
								'Unable to find the Appc Daemon (appcd).\n'
								+ `Run ${this.axwayCLI ? '"axway pm i appcd" or ' : ''}"npm i -g appcd" to install it.`
							);
						} catch (e) {
							emitter.emit('error', e);
						}
					});
			} catch (err) {
				emitter.emit('error', err);
			}
		};

		// need to delay request so event emitter can be returned and events can
		// be wired up
		setImmediate(() => tryConnect());

		return emitter;
	}

	/**
	 * Issues a request to the server over a websocket.
	 *
	 * @param {String|Object} pathOrParams - The path to request or an object containing the path,
	 * data, and type.
	 * @param {String} [pathOrParams.path] - The path to request.
	 * @param {Object} [pathOrParams.data] - An object to send.
	 * @param {Boolean} [pathOrParams.startDaemon] - When `true`, ensures the daemon is running and
	 * if not, attempts to locate the daemon, determine the configuration, start it, and
	 * re-connect.
	 * @param {String} [pathOrParams.type] - The request type. Valid types include `call`,
	 * `subscribe`, and `unsubscribe`.
	 * @returns {EventEmitter} Emits events `response` and `error`.
	 * @access public
	 */
	request(pathOrParams) {
		if (!pathOrParams || (typeof pathOrParams !== 'string' && typeof pathOrParams !== 'object')) {
			throw new TypeError('Expected non-empty path or parameters object');
		}

		const emitter = new EventEmitter();
		const id = uuidv4();
		const startTime = new Date();
		const req = {
			version: '1.0',
			path: pathOrParams,
			id
		};
		let startDaemon = false;

		if (typeof pathOrParams === 'object') {
			Object.assign(req, pathOrParams);
			({ startDaemon } = req);
		}

		if (!req.path || typeof req.path !== 'string') {
			throw new TypeError('Expected path to be a non-empty string');
		}

		if (req.data && (typeof req.data !== 'object' || Array.isArray(req.data))) {
			throw new TypeError('Expected data to be an object');
		}

		if (req.type && typeof req.type !== 'string') {
			throw new TypeError('Expected type to be a string');
		}

		// need to delay request so event emitter can be returned and events can
		// be wired up
		setImmediate(() => {
			this.connect({ startDaemon })
				.once('connected', client => {
					// if a response is chunked, this handler will be invoked multiple times
					this.requests[id] = {
						handler: response => {
							// no need for the id anymore
							delete response.id;

							let { status } = this.requests[id];
							if (!status) {
								// first response
								status = this.requests[id].status = response.status = ~~response.status || 500;
							}

							const statusClass = Math.floor(status / 100);

							if (response.fin) {
								const style = status < 400 ? ok : alert;
								log(`${style(status)} ${highlight(req.path)} ${note(`${new Date() - startTime}ms`)}`);
							}

							switch (statusClass) {
								case 2:
									if (response.type !== 'finish') {
										emitter.emit('response', response.message, response);
									}
									// `fin` exists on the last message from the request which can be
									// any message type, not just `finish`
									if (response.fin) {
										emitter.emit('finish');
									}
									break;

								case 4:
								case 5:
									const err = new Error(response.message || 'Server Error');
									if (!response.statusCode) {
										response.statusCode = String(status);
									}
									for (const prop of Object.keys(response)) {
										// we need to use defineProperty() to force properties to be created
										Object.defineProperty(err, prop, {
											configurable: true,
											enumerable:   true,
											value:        response[prop],
											writable:     true
										});
									}
									emitter.emit('error', err, response);
							}
						}
					};

					log('Sending request:', req);

					client.socket.send(JSON.stringify(req));
				})
				.on('warning', (...args) => emitter.emit('warning', ...args))
				.once('close', () => {
					delete this.requests[id];
					emitter.emit('close');
				})
				.once('error', err => {
					delete this.requests[id];
					emitter.emit('error', err);
				});
		});

		return emitter;
	}

	/**
	 * Disconnects from the server.
	 *
	 * @access public
	 */
	disconnect() {
		if (this.socket) {
			this.socket.close();
		}
		this.socket = null;
	}
}

/**
 * Generates a user agent string containing the name of the parent-most script
 * name, Node.js version, platform name, and architecture.
 *
 * @param {String} [userAgent] - The invoking client's user agent. This simply needs to be the
 * `name/version`.
 * @returns {String}
 */
function constructUserAgent(userAgent) {
	if (userAgent && typeof userAgent !== 'string') {
		throw new TypeError('Expected user agent to be a string');
	}

	const parts = userAgent ? userAgent.split(' ') : [];

	if (!parts.length) {
		let entry = module;
		while (entry.parent) {
			entry = entry.parent;
		}

		if (entry.filename) {
			const name = path.basename(entry.filename);
			const root = path.resolve('/');
			let dir = path.dirname(entry.filename);

			do {
				const pkgJsonFile = path.join(dir, 'package.json');

				try {
					parts.push(`${name}/${fs.readJsonSync(pkgJsonFile).version || ''}`);
					break;
				} catch (e) {
					// either the package.json doesn't exist or the JSON was malformed
					if (e.code !== 'ENOENT') {
						// must be malformed JSON, we can stop
						break;
					}
				}

				dir = path.dirname(dir);
			} while (dir !== root);
		}
	}

	parts.push(`appcd-client/${JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'))).version}`);

	if (!parts.some(p => p.indexOf('node/') === 0)) {
		parts.push(`node/${process.version.replace(/^v/, '')}`);
	}

	if (!parts.some(p => p === process.platform)) {
		parts.push(process.platform);
	}

	const architecture = arch();
	if (!parts.some(p => p === architecture)) {
		parts.push(architecture);
	}

	return parts.join(' ');
}

/**
 * Attempts to locate an executable in the system path.
 *
 * @param {String} bin - The name of the executable to find.
 * @returns {String|null}
 */
function find(bin) {
	try {
		const path = which.sync(bin);
		log(`Found ${bin}: ${highlight(path)}`);
		return path;
	} catch (e) {
		return null;
	}
}

/**
 * Synchronously spawns a process and returns the result. If the process returns a non-zero exit
 * code, then it will throw an error.
 *
 * @param {...String} args - The command and arguments. If the platform is Windows and the first
 * argument is not a `.cmd`, then it will automatically set the command to the current Node
 * executable.
 * @returns {Object}
 */
function run(...args) {
	const bin = args[0];
	const cmd = process.platform === 'win32' && !/\.cmd$/i.test(bin) ? process.execPath : args.shift();
	log(`Executing ${highlight(`${cmd} ${args.join(' ')}`)}`);

	// remove debug env vars so that JSON responses aren't malformed
	const { env } = process;
	delete env.DEBUG;
	delete env.SNOOPLOGG;

	const result = spawnSync(cmd, args, { env });
	if (!result.status) {
		return result;
	}

	throw new Error(`${bin} exited with code ${result.status}`);
}
