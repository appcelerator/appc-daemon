# Appc Daemon 3.1.0

## Nov 06, 2019

This is a minor release with new features, bug fixes, and dependency updates.

### Installation

```
npm i -g appcd@3.1.0
```

### appcd

 * **v3.1.0** - 11/6/2019

   * fix(common): Fixed bug with order of loading an arbitrary `--config-file` and the user-defined
     config file.
   * fix(common): Fixed bug where the incorrect global package directory was being resolved based on
     the Node.js executable used to spawn the core instead of the Node.js version used to run the
     `appcd` command.
   * fix(common): Re-enable detaching the core when starting the daemon to prevent unintended SIGINT
     propagation. [(DAEMON-288)](https://jira.appcelerator.org/browse/DAEMON-288)
   * fix(config): Fixed config 'delete' aliases when daemon is not running.
   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies.

### appcd-agent

 * **v1.1.8** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies.

### appcd-client

 * **v2.0.2** - 11/6/2019

   * fix: Fixed auto user agent generation for Node's repl.
   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Bumped required Node.js version to 8.12.0 which is technically a breaking change, but
     `appcd-response@2.0.0` already requires Node.js 8.12.0.
   * chore: Updated dependencies

### appcd-config

 * **v2.0.0** - 11/6/2019

   * BREAKING CHANGE: Removed `load()` helper as it was too Appc Daemon specific.
   * BREAKING CHANGE: Renamed `Root` namespace to `Base`.
   * BREAKING CHANGE: Removed `isUserDefined` option from `load()`.
   * feat: Added `baseConfig` and `baseConfigFile` to load configuration into the `Base` namespace.
   * feat: Added new `skipIfNotExists` option to `load()`.
   * feat: Added support for handlebars style variables in string values that resolve other config
     values.
   * fix: Added new `Runtime` layer to allow config settings set at runtime to override `Base` and
     `User` config values.
   * fix: Apply the runtime config after a file is loaded into the runtime namespace.
   * fix: Fixed bug introduced with config layer feature that wasn't allowing readonly values to be
     overwritten during initial load.
   * fix: Array merging, push, and unshifting no longer allows duplicate values.
   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies

### appcd-config-service

 * **v2.0.2** - 11/6/2019

   * fix: Fixed bug where `push` and `unshift` actions were not returning the new value.
   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Bumped required Node.js version to 8.12.0 which is technically a breaking change, but
     `appcd-response@2.0.0` already requires Node.js 8.12.0.
   * chore: Updated dependencies.

### appcd-core

 * **v3.1.0** - 11/6/2019

   * feat: Added `plugins.installDefault` config setting (default `true`) to control whether the
     default plugins should be installed on appcd start.
   * feat: Added `server.persistDebugLog` config setting (default `false`) to persist debug log to
     disk. [(DAEMON-93)](https://jira.appcelerator.org/browse/DAEMON-93)
   * fix: Fixed bug with order of loading an arbitrary `--config-file` and the user-defined config
     file.
   * chore: Updated Node.js version from 10.16.2 to 10.16.3.
   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies

### appcd-default-plugins

 * **v4.1.0** - 8/15/2019

   * chore: Updated plugins to latest appcd v3 compatible versions.

### appcd-detect

 * **v2.2.1** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies.

### appcd-dispatcher

 * **v2.0.2** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Bumped required Node.js version to 8.12.0 which is technically a breaking change, but
     `appcd-response@2.0.0` already requires Node.js 8.12.0.
   * chore: Updated dependencies.

### appcd-fs

 * **v1.1.9** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies.

### appcd-fswatch-manager

 * **v2.0.2** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Bumped required Node.js version to 8.12.0 which is technically a breaking change, but
     `appcd-response@2.0.0` already requires Node.js 8.12.0.
   * chore: Updated dependencies.

### appcd-fswatcher

 * **v1.2.4** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Bumped required Node.js version to 8.1.0 which is technically a breaking change, but
     `appcd-util@2.0.0` already requires Node.js 8.1.0.
   * chore: Updated dependencies.

### appcd-gulp

 * **v2.3.0** - 11/6/2019

   * feat: Added support for global appcd tests by setting the `APPCD_TEST_GLOBAL_PACKAGE_DIR`
     environment variable to the path of the `"packages"` directory.
   * feat: `gulp watch` now builds the project before watching files.
   * feat: Added lcov report output for coverage tests.
   * fix: Fixed `gulp watch` to continue to watch after a lint or build error occurs.
   * fix: Fixed coverage transpilation to factor in if module is the main entry point.
   * fix: Added missing fourth `options` argument to transpile `Module._resolveFilename()` override.
   * refactor: Moved `runTests()` out of standard template and into a separate `test-runner.js` file.
   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies.

### appcd-http

 * **v1.2.4** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies.

### appcd-logger

 * **v2.0.4** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies.

### appcd-machine-id

 * **v3.0.2** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies.

### appcd-nodejs

 * **v3.0.1** - 11/6/2019

   * fix: Discontinue automatic unref of detached subprocesses.
   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Bumped required Node.js version to 8.12.0 which is technically a breaking change, but
     `appcd-request@2.0.0` already requires Node.js 8.12.0.
   * chore: Updated dependencies.

### appcd-path

 * **v1.1.8** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies.

### appcd-plugin

 * **v3.1.0** - 11/6/2019

   * feat: Added `dependencies` to plugin info.
   * feat: `console` object is now a Node.js Console object instead of a SnoopLogg logger.
   * fix: Added support for non-transpiled plugin code to be instrumented for code coverage.
   * fix: Improved Node.js module API compatibility.
   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies

### appcd-request

 * **v2.1.1** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Bumped required Node.js version to 8.12.0 which is technically a breaking change, but
     `appcd-dispatcher@2.0.0` already requires Node.js 8.12.0.
   * chore: Updated dependencies.

### appcd-response

 * **v2.0.2** - 11/6/2019

   * fix(locale): Removed dependency on `winreglib` for detecting the locale on Windows in favor of
     spawning the Windows Registry `reg.exe` command.
     [(DAEMON-287)](https://jira.appcelerator.org/browse/DAEMON-287)
   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies.

### appcd-subprocess

 * **v3.0.1** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Bumped required Node.js version to 8.12.0 which is technically a breaking change, but
     `appcd-response@2.0.0` already requires Node.js 8.12.0.
   * chore: Updated dependencies.

### appcd-telemetry

 * **v3.0.1** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Bumped required Node.js version to 8.12.0 which is technically a breaking change, but
     `appcd-response@2.0.0` already requires Node.js 8.12.0.
   * chore: Updated dependencies.

### appcd-util

 * **v2.0.1** - 11/6/2019

   * chore: Fixed homepage and repository URLs in `package.json`.
   * chore: Added links to issue trackers in readme.
   * chore: Updated dependencies.