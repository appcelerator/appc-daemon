import appcdLogger from 'appcd-logger';
import appcdPluginAPIVersion from './plugin-api-version';
import Dispatcher, { DispatcherError } from 'appcd-dispatcher';
import ExternalPlugin from './external-plugin';
import findup from 'findup-sync';
import fs from 'fs-extra';
import gawk from 'gawk';
import ignore from 'ignore';
import ignoreList from './ignore';
import InternalPlugin from './internal-plugin';
import path from 'path';
import PluginError, { PluginMissingAppcdError } from './plugin-error';
import prettyMs from 'pretty-ms';
import semver from 'semver';
import slug from 'slugg';
import sortKeys from 'sort-keys';
import types from './types';

import { arrayify, sha1 } from 'appcd-util';
import { EventEmitter } from 'events';
import { expandPath, real } from 'appcd-path';
import { isDir, isFile } from 'appcd-fs';
import { Readable } from 'stream';
import { states } from './plugin-base';

const { highlight } = appcdLogger.styles;

/**
 * The next number to use for the timer id.
 * @type {Number}
 */
let inactivityTimerID = 1;

/**
 * Contains information about a plugin.
 */
export default class Plugin extends EventEmitter {
	/**
	 * Determines if the specified directory is a plugin and then loads it's meta data.
	 *
	 * @param {String} pluginPath - The path to the plugin.
	 * @param {Boolean} [isParent=false] - When `true` and this is an external plugin, it will let
	 * the external plugin to spawn the plugin host process.
	 * @access public
	 */
	constructor(pluginPath, isParent = false) {
		super();

		this.isParent = isParent;

		this.logger = appcdLogger(isParent ? 'appcd:plugin' : 'appcd:plugin:host:plugin');

		let link = false;
		try {
			link = fs.lstatSync(pluginPath).isSymbolicLink();
		} catch (e) {
			// squelch
		}

		/**
		 * Internal plugin information storage. Since a `Plugin` object cannot be gawked, we store
		 * just the properties that can be gawked in a private object, then define setters to make
		 * accessing the properties transparent.
		 * @type {GawkObject}
		 */
		this.info = gawk({
			path:           undefined,
			name:           undefined,
			packageName:    undefined,
			version:        undefined,
			description:    undefined,
			homepage:       undefined,
			license:        undefined,
			main:           undefined,
			type:           'external',
			appcdVersion:   undefined,
			apiVersion:     undefined,
			nodeVersion:    undefined,
			autoStart:      false,
			os:             undefined,
			error:          null,
			supported:      null,
			state:          states.STOPPED,
			link,
			activeRequests: 0,
			totalRequests:  0,
			dependencies:   {}
		});

		return new Proxy(this, {
			get(target, name) {
				if (Object.prototype.hasOwnProperty.call(target.info, name)) {
					return target.info[name];
				} else {
					return target[name];
				}
			},

			set(target, name, value) {
				if (name === 'info') {
					throw new Error('The "info" property is readonly');
				}
				if (Object.prototype.hasOwnProperty.call(target.info, name)) {
					target.info[name] = value;
				} else {
					target[name] = value;
				}
				return true;
			}
		}).init(pluginPath);
	}

	/**
	 * Validates and load's the plugins information.
	 *
	 * @param {String} pluginPath - The Path to the plugin.
	 * @returns {Plugin}
	 * @access private
	 */
	init(pluginPath) {
		if (!pluginPath || typeof pluginPath !== 'string') {
			throw new PluginError('Expected plugin path to be a non-empty string');
		}
		pluginPath = real(pluginPath);
		if (!isDir(pluginPath)) {
			throw new PluginError('Plugin path does not exist: %s', pluginPath);
		}
		this.path = pluginPath;

		const pkgJsonFile = path.join(pluginPath, 'package.json');
		if (!isFile(pkgJsonFile)) {
			throw new PluginError('Plugin path does not contain a package.json: %s', pluginPath);
		}

		this.pkgJsonHash = null;

		let pkgJson;
		try {
			const contents = fs.readFileSync(pkgJsonFile, 'utf8');
			this.pkgJsonHash = sha1(contents);
			pkgJson = JSON.parse(contents);
		} catch (e) {
			throw new PluginError('Error parsing %s: %s', pkgJsonFile, e.message);
		}

		if (!pkgJson.appcd && !pkgJson['appcd-plugin']) {
			throw new PluginMissingAppcdError('Plugin does not contain an appcd object in package.json: %s', pluginPath);
		}

		// validate and set the package name
		if (pkgJson.name) {
			if (typeof pkgJson.name !== 'string') {
				throw new PluginError('Invalid "name" property in %s', pkgJsonFile);
			}
			this.packageName = pkgJson.name;
			this.name = slug(pkgJson.name);
		}

		// validate and set the version
		if (!pkgJson.version || typeof pkgJson.version !== 'string') {
			throw new PluginError('Missing "version" property in %s', pkgJsonFile);
		}
		const version = semver.valid(pkgJson.version);
		if (!version) {
			throw new PluginError('Invalid version "%s" in %s', pkgJson.version, pkgJsonFile);
		}
		this.version = version;

		this.description = pkgJson.description;
		this.homepage = pkgJson.homepage;
		this.license = pkgJson.license;

		// find the main file
		let main = expandPath(pluginPath, pkgJson.main || 'index.js');
		if (isDir(main)) {
			main = path.join(main, 'index.js');
		}
		if (!/\.js$/.test(main)) {
			main += '.js';
		}
		if (!isFile(main)) {
			throw new PluginError('Unable to find main file "%s"', pkgJson.main || 'index.js');
		}
		this.main = main;

		if (pkgJson.dependencies && typeof pkgJson.dependencies === 'object') {
			for (const pkg of Object.keys(pkgJson.dependencies)) {
				// try to determine the installed version
				try {
					const p = findup('package.json', { cwd: require.resolve(pkg, { paths: [ pluginPath ] }) });
					this.dependencies[pkg] = p && fs.readJsonSync(p).version || null;
				} catch (e) {
					this.dependencies[pkg] = null;
				}
			}
		}

		const appcd = {};

		if (pkgJson['appcd-plugin']) {
			if (typeof pkgJson['appcd-plugin'] !== 'object') {
				throw new PluginError('Expected "appcd-plugin" section to be an object in %s', pkgJsonFile);
			}
			Object.assign(appcd, pkgJson['appcd-plugin']);
		}

		if (pkgJson.appcd) {
			if (typeof pkgJson.appcd !== 'object') {
				throw new PluginError('Expected "appcd" section to be an object in %s', pkgJsonFile);
			}
			Object.assign(appcd, pkgJson.appcd);
		}

		if (appcd.name) {
			if (typeof appcd.name !== 'string') {
				throw new PluginError('Invalid "name" property in the "appcd" section of %s', pkgJsonFile);
			}
			if (!this.packageName) {
				this.packageName = appcd.name;
			}
			this.name = slug(appcd.name);
		}

		if (appcd.appcdVersion) {
			if (!semver.validRange(appcd.appcdVersion)) {
				throw new PluginError('Invalid "appcdVersion" property in the "appcd" section of %s', pkgJsonFile);
			}
			this.appcdVersion = appcd.appcdVersion;
		}

		if (appcd.apiVersion) {
			if (!semver.validRange(appcd.apiVersion)) {
				throw new PluginError('Invalid "apiVersion" property in the "appcd" section of %s', pkgJsonFile);
			}
			this.apiVersion = appcd.apiVersion;
		}

		if (appcd.type) {
			if (typeof appcd.type !== 'string' || types.indexOf(appcd.type) === -1) {
				throw new PluginError('Invalid type "%s" in "appcd" section of %s', appcd.type, pkgJsonFile);
			}
			this.type = appcd.type;
		}

		if (appcd.config) {
			let configFile = appcd.config;
			if (typeof configFile !== 'string') {
				throw new PluginError('Expected config to be a string');
			}

			if (!path.isAbsolute(configFile)) {
				configFile = path.resolve(pluginPath, configFile);
			}

			this.configFile = expandPath(configFile);
		}

		if (appcd.os) {
			this.os = arrayify(appcd.os, true);
			if (this.os.length === 0) {
				this.os = null;
			}
		}

		this.autoStart = !!appcd.autoStart;

		if (appcd.inactivityTimeout !== undefined) {
			if (typeof appcd.inactivityTimeout !== 'number' || isNaN(appcd.inactivityTimeout) || appcd.inactivityTimeout < 0) {
				throw new PluginError('Expected inactivity timeout to be a non-negative number');
			}
			this.inactivityTimeout = appcd.inactivityTimeout;
		}

		if (appcd.ignore) {
			if (!Array.isArray(appcd.ignore)) {
				throw new PluginError('Expected ignore to be an array');
			}
			ignoreList.push.apply(ignoreList, appcd.ignore);
		}

		this.ignore = ignore().add(Array.from(new Set([ ...ignoreList ])));

		let { configSchema } = appcd;
		if (configSchema) {
			if (typeof configSchema !== 'string') {
				throw new PluginError('Expected config schema file to be a string');
			}

			if (!path.isAbsolute(configSchema)) {
				configSchema = path.resolve(pluginPath, configSchema);
			}

			this.configSchemaFile = expandPath(configSchema);
		}

		// validate the name
		if (!this.name) {
			throw new PluginError('Invalid "name" property in the "appcd" section of %s', pkgJsonFile);
		}
		if (this.name === 'appcd') {
			throw new PluginError('Plugin forbidden from using the name "%s"', 'appcd');
		}

		this.nodeVersion = appcd.node || (pkgJson.engines && pkgJson.engines.node) || process.version.replace(/^v/, '');

		// reset the error
		this.error = null;
		this.supported = true;

		if (this.configFile && !isFile(this.configFile)) {
			throw new PluginError(`Plugin config file not found: ${this.configFile}`);
		}

		if (this.os && !this.os.includes(process.platform)) {
			this.error = `Unsupported platform "${process.platform}"`;
			this.supported = false;
		}

		if (!this.error && process.env.APPCD && this.appcdVersion && !semver.satisfies(process.env.APPCD, this.appcdVersion)) {
			this.error = `Requires Appc Daemon ${this.appcdVersion}, but currently running v${process.env.APPCD}`;
			this.supported = false;
		}

		if (!this.error && this.apiVersion && !semver.satisfies(appcdPluginAPIVersion, this.apiVersion)) {
			this.error = `Requires Appc Daemon plugin API ${this.apiVersion}, but currently running v${appcdPluginAPIVersion}`;
			this.supported = false;
		}

		if (!this.error && this.type === 'internal' && this.nodeVersion && !semver.satisfies(process.version, this.nodeVersion)) {
			this.error = `Internal plugin requires Node.js ${this.nodeVersion}, but currently running ${process.version}`;
			this.supported = false;
		}

		/**
		 * A list of directories to be watched for source changes.
		 * @type {Set}
		 */
		this.directories = new Set()
			.add(this.path)
			.add(path.dirname(this.main));

		if (typeof pkgJson.directories === 'object') {
			for (const type of [ 'lib', 'src' ]) {
				const dir = pkgJson.directories[type];
				if (dir && typeof dir === 'string') {
					this.directories.add(path.isAbsolute(dir) ? dir : path.resolve(pluginPath, dir));
				}
			}
		}

		this.impl = null;

		if (this.error) {
			return this;
		}

		// initialize the plugin implementation
		if (this.type === 'external') {
			this.impl = new ExternalPlugin(this, this.isParent);
		} else {
			this.impl = new InternalPlugin(this, this.isParent);
		}

		// watch the plugin info changes and merge them into the public plugin info
		gawk.watch(this.impl.info, obj => {
			const info = { ...obj };
			if (this.info.error) {
				// if we already had an error, then don't override it
				info.error = this.info.error;
			}
			gawk.merge(this.info, info);
		});

		return this;
	}

	/**
	 * Starts the plugin. This is called from the main process and not the plugin host process.
	 *
	 * @returns {Promise}
	 * @access public
	 */
	async start() {
		if (!this.impl) {
			throw new PluginError(this.error || 'Plugin not initialized');
		}

		this.error = null;
		this.stack = null;

		return this.impl.start();
	}

	/**
	 * Stops the plugin.
	 *
	 * @returns {Promise}
	 * @access public
	 */
	stop() {
		if (this.inactivityTimer) {
			this.logger.log('Resetting inactivity timer: %s', this.inactivityTimer.id);
			clearTimeout(this.inactivityTimer);
			this.inactivityTimer = null;
		}

		if (this.impl) {
			return this.impl.stop();
		}
	}

	/**
	 * Dispatches a request to the plugin's dispatcher.
	 *
	 * @param {Object} ctx - A dispatcher context.
	 * @param {Function} next - A function to continue to next dispatcher route.
	 * @returns {Promise}
	 * @access public
	 */
	dispatch(ctx, next) {
		gawk.merge(this.info, {
			activeRequests: this.info.activeRequests + 1,
			totalRequests:  this.info.totalRequests + 1
		});

		if (this.inactivityTimer) {
			this.logger.log('Resetting inactivity timer: %s', this.inactivityTimer.id);
			clearTimeout(this.inactivityTimer);
			this.inactivityTimer = null;
		}

		const resetTimer = async () => {
			let timeout = this.inactivityTimeout;
			if (timeout === undefined || timeout === null) {
				try {
					const { response } = await Dispatcher.call('/appcd/config/plugins/defaultInactivityTimeout');
					timeout = response;
				} catch (e) {
					timeout = 60 * 60 * 1000; // 1 hour
				}
			}

			if (this.type === 'external' && timeout !== 0 && this.info.state === states.STARTED) {
				// restart the inactivity timer
				this.inactivityTimer = setTimeout(() => {
					if (this.info.activeRequests === 0) {
						this.logger.log('Deactivating plugin after %s of inactivity: %s', prettyMs(timeout, { verbose: true }), highlight(this.toString()));
						this.stop();
					}
				}, timeout);

				this.inactivityTimer.id = inactivityTimerID++;

				this.logger.log('Setting inactivity timer for %s ms: %s', timeout, this.inactivityTimer.id);
			}
		};

		if (!this.impl) {
			return next();
		}

		return this.impl.dispatch(ctx, next)
			.then(ctx => {
				if (ctx.response instanceof Readable) {
					ctx.response.on('end', () => {
						this.info.activeRequests--;
					});
				} else {
					this.info.activeRequests--;
				}
				resetTimer();
				return ctx;
			})
			.catch(err => {
				this.info.activeRequests--;
				resetTimer();

				// if the request was for `/<plugin-name>/version/` and the plugin didn't explicitly
				// handle the request, then override the error and return the plugin info
				if (ctx.path === '/' && err instanceof DispatcherError && err.status === 404) {
					ctx.response = sortKeys(this.info);
					ctx.status = 200;
					return ctx;
				}

				throw err;
			});
	}

	/**
	 * Returns a string with this plugin's name and version.
	 *
	 * @returns {String}
	 * @access public
	 */
	toString() {
		return `${this.name}@${this.version}`;
	}

	/**
	 * If this plugin is an external plugin, this function will retrieve its health report from the
	 * agent running in the external plugin.
	 *
	 * @returns {Promise<Object>}
	 */
	health() {
		return this.type === 'external' && this.impl ? this.impl.health() : null;
	}
}
