/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const BaseAction = require('../../base/BaseAction');
const { HelloActionResult } = require('../../../services/actionresult/HelloActionResult');
const {ENV_VARS} = require('../../../ApplicationConstants');

const COMMAND = {
	OPTIONS: {
		PHRASE: 'phrase'
	},
	SDK_COMMAND: 'null',
};

module.exports = class HelloAction extends BaseAction {
	
	constructor(options) {
		super(options);
		this._options = options;
		// this._projectInfoService = new ProjectInfoService(this._projectFolder);
	}

	/**
	 * @An opportunity to:
	 * - modify the params. e.g. use a command argument to override the project folder?
	 * - check the environment
	 * - prompt the user, etc
	 * @param params
	 * @returns {any}
	 */
	preExecute(params) {

		if( params.debug) console.log('preExecute', params, this._options);
		return params;
	}

	/**
	 * @description - do whatever you want in here
	 * @param params
	 * @returns {Promise<void>}
	 */
	async execute(params) {
		if(params.debug) {
			console.log('execute', params, this._options);
			Object.values(ENV_VARS).forEach((envKey)=>{
				console.log(envKey,process.env[envKey]);
			});
		}
		return new HelloActionResult({
			status: 'SUCCESS',
			data: {},
			commandParameters: params
		});
	}
};
