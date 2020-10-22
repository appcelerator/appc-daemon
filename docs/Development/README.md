> [Home](../README.md) ➤ Development

> :warning: Under construction.

# Development

The source code is open source under the Apache 2 license and can be found at https://github.com/appcelerator/appc-daemon.

### Prerequisites

The Appc Daemon requires

### Cloning the Repository

#### Requirements

On client machines, Node.js v10.13.0 or newer is required.

Additionally, developing on the Appc Daemon also requires Gulp 4, Yarn >=1.15, and Lerna >=3.

> :warning: Note: Yarn 2 is not yet supported.

For development, you will need at around 300 MB of free space for all of the code, the local git
checkout, and all of the npm dependencies and dev dependencies.

> :bulb: Note: The Appc Daemon use Yarn Workspaces which optimizes the `node_modules` directory and
> saves a significant amount of disk space. Without workspaces, a development checkout is
> approximately 2.3 GB, however with workspaces this size drops to 280 MB.

##### Node.js

You can download Node.js from [https://nodejs.org]([https://nodejs.org]).

##### Gulp

```bash
npm install -g gulp lerna
```

##### Yarn

<table>
	<thead>
		<tr>
			<th>OS</th>
			<th>Command</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td>macOS</td>
			<td><code>brew install yarn</code><br>
				or<br>
				<code>port install yarn</code><br>
				or<br>
				<code>curl -o- -L https://yarnpkg.com/install.sh | bash</code></td>
		</tr>
		<tr>
			<td>Windows</td>
			<td>Download from <a href="https://yarnpkg.com/latest.msi">https://yarnpkg.com/latest.msi</a></td>
		</tr>
		<tr>
			<td>Ubuntu</td>
			<td><code>curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add - echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list</code><br>
				<code>sudo apt-get update && sudo apt-get install yarn</code><br>
				or<br>
				<code>curl -o- -L https://yarnpkg.com/install.sh | bash</code></td>
		</tr>
		<tr>
			<td>CentOS / Fedora / RHEL</td>
			<td><code>sudo wget https://dl.yarnpkg.com/rpm/yarn.repo -O /etc/yum.repos.d/yarn.repo</code><br>
				<code>sudo yum install yarn</code><br>
				or<br>
				<code>curl -o- -L https://yarnpkg.com/install.sh | bash</code></td>
		</tr>
	</tbody>
</table>

Please refer to [Yarn's Installation documentation](https://yarnpkg.com/en/docs/install) for
additional information.

#### First Time Initialization

```bash
git clone git@github.com:appcelerator/appc-daemon.git

cd appc-daemon

sudo ln -s /usr/local/bin/appcd `pwd`/packages/appcd/bin/appcd
```

#### Developing Plugins

Plugins are npm packages and are loaded from either the appcd home plugins directory or the global
modules path. The default appcd plugins live in their own individual git repositories, but are
referenced by the main [`appcd-daemon`](https://github.com/appcelerator/appc-daemon) repo as git
submodules. Once the submodules have been synced, they will be linked via Yarn and linked again
to the appcd home plugins directory.

From the plugin's directory you can run `gulp build` or `gulp watch` to recompile the code after
updates. If the daemon is running, and the plugin is "external", then the daemon will see the
plugin was changed and stop the plugin. The daemon will load the new plugin code on the next
request.

### Running in Production

Starts the Appc Daemon as a detached background process.

```bash
appcd start
```

To stop the server, run:

```bash
appcd stop
```

### Running in Debug Mode

Starts the Appc Daemon, but does not background the Appc Daemon Core process or detach stdio.

```bash
appcd start --debug
```

Press <kbd>CTRL-C</kbd> to stop the Appc Daemon.

### Developing the Appc Daemon

To rebuild the entire Appc Daemon project and all of its packages, simply run:

```bash
gulp build
```

When developing on the Appc Daemon, it is much faster to use the watch task:

```bash
gulp watch
```

The watch task will monitor all of the Appc Daemon packages for changes. When a file is modified, it
will rebuild that package and all parent packages, then restart the Appc Daemon.

> :bulb: Note that the `gulp watch` task is not bulletproof. If you save a .js file that contains
> malformed JavaScript code, it's likely going to cause `gulp` to exit, but the last spawned Appc
> Daemon process will remain running. You may need to run `appcd stop` or `killall appcd`.

When running the Appc Daemon with the `gulp watch` task telemetry will be sent using the
`development` deployType.

### Debugging the Appc Daemon

To debug the Appc Daemon, you can:

* Debug the Appc Daemon in debug mode
* Debug the appcd-core directly

> :bulb: Before debugging, make sure you have the NIM (Node Inspector Manager) Chrome Extension
> installed:
>
> https://chrome.google.com/webstore/detail/nim-node-inspector-manage/gnhhdgbaldcilmgcpfddgdbkhjohddkj
>
> The NIM extension will detect when the Appc Daemon has been started in debug mode and
> automatically connect to it.

#### Debug the Appc Daemon in Debug Mode

```bash
appcd start --debug
```

For continuous development, run the `watch` task:

```bash
gulp watch
```

#### Debugging appcd with the Node debugger

```bash
gulp debug
```

#### Debugging the appcd-core with the Node debugger

If for some reason the appcd CLI is getting in the way of debugging, you can debug the
`appcd-core` directly:

```bash
gulp build
node --inspect package/appcd-core/dist/main.js
```

### Checking dependency updates

Periodically, run the check task to make sure all of the npm dependencies are up-to-date and that
there is no security issues. If there are any issues, follow the recommended actions.

```bash
gulp check
```

To upgrade dependencies within the defined dependency semver ranges, run `gulp upgrade`.

To upgrade dependency semver ranges, run `gulp upgrade -u`.

### Updating the Source Code

After doing a `git pull` or switching a branch, you must run:

```bash
yarn
```

This will ensure all dependencies for each package match those in the `package.json` files.

