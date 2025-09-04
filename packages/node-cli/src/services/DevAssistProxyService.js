/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';
const http = require('http');
const FileSystemService = require('./FileSystemService');
const { getAuthIds } = require('../utils/AuthenticationUtils');


module.exports = class DevAssistProxyService {

	constructor(sdkPath) {
		this._sdkPath = sdkPath;
		this._proxy = http.createServer();
	}

	async start(authId, localPort) {
		//TODO validate authId has the correct format and it is not empty
		//assert(authId);
		console.log('Start');
		const authIDActionResult = await getAuthIds(this._sdkPath);

		if (!authIDActionResult.isSuccess()) {
			throw authIDActionResult.errorMessages;
		}

		let authIDs = Object.keys(authIDActionResult.data);
		console.log(authIDs)

		//this.oauthToken = localStoredAuthData.data[this.authID].token.accessToken;
		//this.target = localStoredAuthData.data[this.authID].hostInfo.hostName;
	}

	stop() {
		console.log('Stop');
	}
};
