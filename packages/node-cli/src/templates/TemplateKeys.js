/*
** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
*/
const PACKAGE = require('../../package.json');
const [firstConfig] = Array.isArray(PACKAGE.configFile) ? PACKAGE.configFile : ['sdf.config.js'];
'use strict';

module.exports = {
	SCRIPTS: {
		blankscript: require.resolve('./scripts/blankscript.js'),
	},
	OBJECTS: {
		commerceextension: require.resolve('./objects/commerceextension.xml'),
	},
	PROJECTCONFIGS: {
		cliconfig: require.resolve(`./projectconfigs/${firstConfig}`),
		gitignore: require.resolve('./projectconfigs/default_gitignore.template')
	},
	UNIT_TEST: {
		cliconfig: require.resolve(`./unittest/${firstConfig}.template`),
		jestconfig: require.resolve('./unittest/jest.config.js.template'),
		packagejson: require.resolve('./unittest/package.json.template'),
		sampletest: require.resolve('./unittest/sample-test.js.template'),
		jsconfig: require.resolve('./unittest/jsconfig.json.template')
	}
};
