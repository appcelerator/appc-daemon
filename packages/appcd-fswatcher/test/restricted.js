const path = require('path');
const { spawnSync } = require('child_process');

exports.RESTRICTED_TESTS_RUN      = 0;
exports.RESTRICTED_TESTS_NOT_ROOT = 1;
exports.RESTRICTED_TESTS_BAD_OS   = 2;
exports.RESTRICTED_TESTS_NO_USER  = 3;
exports.RESTRICTED_TESTS_BAD_USER = 4;

exports.after          = after;
exports.getDescription = getDescription;
exports.getUser        = getUser;
exports.shouldRunTests = shouldRunTests;

const { TEST_USER, SUDO_USER, SUDO_UID, SUDO_GID } = process.env;
const user = TEST_USER || SUDO_USER;
let state = exports.RESTRICTED_TESTS_RUN;

if (!process.getuid || !process.seteuid) {
	state = exports.RESTRICTED_TESTS_BAD_OS;
} else if (process.getuid() !== 0) {
	state = exports.RESTRICTED_TESTS_NOT_ROOT;
} else if (!user) {
	state = exports.RESTRICTED_TESTS_NO_USER;
} else if (user === 'root') {
	state = exports.RESTRICTED_TESTS_BAD_USER;
}

function after() {
	const owner = (SUDO_UID || SUDO_USER) + (SUDO_GID ? `:${SUDO_GID}` : '');
	if (shouldRunTests() && owner) {
		const cwd = path.dirname(__dirname);
		const args = [ '-R', owner, '.nyc_output', 'coverage' ];
		console.log(`appcd-gulp after: CWD=${cwd} chown ${args.join(' ')}`);
		spawnSync('chown', args, { cwd });
	}
}

function getDescription() {
	switch (state) {
		case exports.RESTRICTED_TESTS_NOT_ROOT:
			return ' (test must be run as root)';
		case exports.RESTRICTED_TESTS_BAD_OS:
			return ' (test cannot be run on Windows)';
		case exports.RESTRICTED_TESTS_NO_USER:
			return ' (TEST_USER/SUDO_USER env var not set)';
		case exports.RESTRICTED_TESTS_BAD_USER:
			return ' (TEST_USER/SUDO_USER must not be root)';
	}
	return '';
}

function getUser() {
	return user;
}

function shouldRunTests() {
	return state === exports.RESTRICTED_TESTS_RUN;
}
