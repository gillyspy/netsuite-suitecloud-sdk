/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';
const http = require('node:http');
const https = require('node:https');
const EventEmitter = require('events');

const {
	getAuthIds,
	checkIfReauthorizationIsNeeded,
	forceRefreshAuthorization,
} = require('../utils/AuthenticationUtils');
const NodeTranslationService = require('./NodeTranslationService');
const {
	DEV_ASSIST_PROXY_SERVICE,
	ANSWERS_VALIDATION_MESSAGES,
	COMMAND_REFRESH_AUTHORIZATION,
} = require('./TranslationKeys');
const { AUTHORIZATION_PROPERTIES_KEYS } = require('../ApplicationConstants');
const SdkOperationResult = require('../utils/SdkOperationResult');

const LOCAL_HOSTNAME = '127.0.0.1';
const UNAUTHORIZED_RESPONSE = 401;
const INTERNAL_SERVER_ERROR_RESPONSE = 500;

module.exports = class DevAssistProxyService extends EventEmitter {

	constructor(sdkPath, executionEnvironmentContext) {
		super();
		this._sdkPath = sdkPath;
		this._executionEnvironmentContext = executionEnvironmentContext;
		this._proxy = http.createServer();
		this._name = 'DevAssistProxyService'; //TODO move to parameter
		this._proxyReq = undefined; //TODO see if I can assign later
		this._accessToken =  undefined;
	}

	_buildOptions(hostName, accessToken, req) {
		const authorization = 'Bearerr ' + accessToken;
		const options = {
			hostname: hostName,
			port: 443,
			path: req.url,
			method: req.method,
			headers: { ...req.headers, authorization },
		};

		// Add agent for insecure connections when connecting to runboxes
		if (hostName && hostName.includes('vm.eng')) {
			console.log('Disabling reject unauthorized');
			options.agent = new https.Agent({
				rejectUnauthorized: false,
			});
			options.rejectUnauthorized = false;
		}


		console.log('Target: ' + options.hostname);
		console.log('Path: ' + options.path);
		console.log('Authorization: ' + (options.headers?.authorization?.substring(0, 20) + '...'));

		return options;
	}

	async start(authId, localPort) {

		//Parameters validation
		if (!authId) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.MISSING_AUTH_ID);
		}

		if (!localPort) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.MISSING_PORT);
		}

		if (isNaN(localPort)) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.PORT_MUST_BE_NUMBER);
		}

		let { accessToken, hostName } = await this._retrieveAccessToken(authId);
		this._accessToken = accessToken;

		//TODO check a server is running or not


		this._proxy.addListener('request', async (req, res) => {
			console.log(`${req.method} ${req.url}`);
			//we need the newAccessToken
			this._createProxyReq(authId, hostName, this._accessToken, req, res, 0);
			console.log('After add listener');
		});

		this._proxy.listen(localPort, LOCAL_HOSTNAME, () => {
			//TODO testing later	this.emit('start', this._name);
			const localURL = `http://${LOCAL_HOSTNAME}:${localPort}`;
			console.log(`SuiteCloud Proxy server listening on ${localURL}`);
			console.log(`Set Cline Base URL to: ${localURL}/api/internal/devassist`);
			console.log('SuiteCloud Proxy running.');
			console.log(`Configure Cline Base URL to: ${localURL}/api/internal/devassist`);
			console.log(`SuiteCloud Proxy server listening on ${localURL}`);
			console.log(`SuiteCloud Proxy is using the ${authId} authID`);
			console.log(`Configure Cline Base URL to: ${localURL}/api/internal/devassist`);
		});
	}

	async stop() {
		if (this._proxy.listening) {
			this._proxy.close(() => {
				console.log('SuiteCloud Proxy stopped.');
				console.log('SuiteCloud Proxy stopped.');
				console.log('SuiteCloud Proxy stopped.');
				return new Promise((resolve) => {
				});
			});
		}
	}

	_createProxyReq(authId, hostName, accessToken, clineRequest, clineResponse, numRetries) {
		let options = this._buildOptions(hostName, accessToken, clineRequest);
		const authenticatedRequest = https.request(options, async (serverResponse) => {
			console.log(`Proxy response: ${serverResponse.statusCode}`);

			if (serverResponse.statusCode === UNAUTHORIZED_RESPONSE && numRetries === 0) {
				try {
					const newAccessToken = await this._forceRefreshAuth(authId);
					console.log('New auth token' + newAccessToken);
					this._accessToken = newAccessToken;
				//	clineRequest.unpipe();
					authenticatedRequest.abort();
					authenticatedRequest.destroy();

					return this._createProxyReq(authId, hostName, newAccessToken, clineRequest, clineResponse, 1);
				} catch (err) {
					clineResponse.writeHead(UNAUTHORIZED_RESPONSE, serverResponse.headers);
					serverResponse.pipe(clineResponse, { end: true });
					console.error(` error when running foreRefreshAuth: ${err}`);
				}
			} //end if
			clineResponse.writeHead(serverResponse.statusCode || INTERNAL_SERVER_ERROR_RESPONSE, serverResponse.headers);
			serverResponse.pipe(clineResponse, { end: true });
		});

		authenticatedRequest.on('error', (err) => {
			console.error('Proxy request error:', err);
			clineResponse.writeHead(INTERNAL_SERVER_ERROR_RESPONSE);
			clineResponse.end('SuiteCloud Proxy error: ' + err.message);
		});

		//if (numRetries === 0) {
			clineRequest.pipe(authenticatedRequest, { end: true });
		//}

	}


	async _forceRefreshAuth(authId) {
		let inspectAuthOperationResult = await checkIfReauthorizationIsNeeded(authId, this._sdkPath, this._executionEnvironmentContext);
		if (!inspectAuthOperationResult.isSuccess()) {
			throw inspectAuthOperationResult.errorMessages;
		}

		let inspectAuthData = inspectAuthOperationResult.data;
		if (inspectAuthData[AUTHORIZATION_PROPERTIES_KEYS.NEEDS_REAUTHORIZATION]) {
			//TODO move to messages
			throw new Error('Need to reauthenticate');
		} else {
			//force refresh
			let result = await forceRefreshAuthorization(authId, this._sdkPath, this._executionEnvironmentContext);
			if (result.status === 'ERROR') {
				//TODO ensure there is no error here
				throw result.errorMessages[0];
			}
			return result.data.accessToken;
		}
	}


	async _retrieveAccessToken(authId) {
		const authIDActionResult = await getAuthIds(this._sdkPath);

		if (!authIDActionResult.isSuccess()) {
			throw authIDActionResult.errorMessages;
		}

		if (!authIDActionResult.data.hasOwnProperty(authId)) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.NOT_EXISTING_AUTH_ID, authId);
		}
		return {
			accessToken: authIDActionResult.data[authId].token.accessToken,
			hostName: authIDActionResult.data[authId].hostInfo.hostName,
		};
	}
};
