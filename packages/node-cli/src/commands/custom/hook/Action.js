/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const BaseAction = require('../../base/BaseAction');
const { ActionResult, STATUS } = require('../../../services/actionresult/ActionResult');

module.exports = class AcsExtraAction extends BaseAction {
	constructor(options) {
		super(options);
	}

	/**
	 *
	 * @param params
	 * @returns {Promise<ActionResult>}
	 */
	async execute(params) {
		return new ActionResult({
			status: STATUS.SUCCESS,
			data: {},
			commandParameters: params
		});
	}

};
