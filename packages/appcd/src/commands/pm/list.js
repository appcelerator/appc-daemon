export default {
	aliases: [ 'ls' ],
	args: [
		{
			name: 'filter',
			hint: 'field[.subfield]',
			desc: 'Filter installed plugins'
		}
	],
	desc: 'Lists all installed plugins',
	options: {
		'-d, --detailed': 'Display detailed plugin information'
	},
	async action({ _argv, argv, console }) {
		const [
			{ plugins: pm },
			{ snooplogg },
			{ loadConfig },
			{ default: Table }
		] = await Promise.all([
			import('appcd-core'),
			import('appcd-logger'),
			import('../../common'),
			import('cli-table3')
		]);

		const { cyan, gray, green, magenta, yellow } = snooplogg.chalk;
		const plugins = await pm.list({
			filter: argv.filter,
			home: loadConfig(argv).get('home')
		});

		if (argv.json) {
			console.log(JSON.stringify(plugins, null, '  '));
			return;
		}

		if (!plugins.length) {
			console.log('No plugins found\n');
			console.log(`To install the default plugins, run ${cyan('appcd pm install default')}`);
			return;
		}

		const unsupported = plugins.reduce((count, plugin) => (plugin.supported ? count + 1 : count), 0);

		console.log(`Found ${cyan(plugins.length)} plugin${plugins.length !== 1 ? 's' : ''}${unsupported ? gray(` (${unsupported} unsupported)`) : ''}\n`);

		if (argv.detailed) {
			let i = 0;
			for (const plugin of plugins) {
				if (i++) {
					console.log();
				}
				console.log(magenta(`${plugin.name} ${plugin.version}`));
				if (!plugin.supported) {
					console.log(`  ${yellow(`Unsupported: ${plugin.error}`)}\n`);
				}
				if (plugin.description) {
					console.log(`  ${plugin.description}`);
				}
				console.log();
				if (plugin.apiVersion) {
					console.log(`  API Version:   ${cyan(plugin.apiVersion)}`);
				}
				if (plugin.appcdVersion) {
					console.log(`  Appcd Version: ${cyan(plugin.appcdVersion)}`);
				}
				console.log(`  Endpoint:      ${cyan(plugin.endpoint)}`);
				if (plugin.homepage) {
					console.log(`  Homepage:      ${cyan(plugin.homepage)}`);
				}
				if (plugin.license) {
					console.log(`  License:       ${cyan(plugin.license)}`);
				}
				console.log(`  Path:          ${cyan(plugin.path)}`);
				console.log(`  Platforms:     ${cyan(plugin.os?.join(', ') || 'all')}`);
				if (plugin.type) {
					console.log(`  Type:          ${cyan(plugin.type)}`);
				}
			}
		} else {
			const table = new Table({
				chars: {
					bottom: '', 'bottom-left': '', 'bottom-mid': '', 'bottom-right': '',
					left: '', 'left-mid': '',
					mid: '', 'mid-mid': '', middle: '  ',
					right: '', 'right-mid': '',
					top: '', 'top-left': '', 'top-mid': '', 'top-right': ''
				},
				head: [ 'Name', 'Version', 'Description', 'Endpoint' ],
				style: {
					head: [ 'bold' ],
					'padding-left': 0,
					'padding-right': 0
				}
			});

			for (const plugin of plugins) {
				if (plugin.supported) {
					table.push([ green(plugin.name + (plugin.link ? '*' : '')), plugin.version, plugin.description, plugin.endpoint ]);
				} else {
					table.push([ gray(plugin.name + (plugin.link ? '*' : '')), gray(plugin.version), gray(plugin.description), gray(plugin.endpoint) ]);
				}
			}

			console.log(table.toString());
			console.log(`\nFor more info, run ${cyan(`appcd ${_argv.join(' ')} --detailed`)}`);
		}
	}
};
