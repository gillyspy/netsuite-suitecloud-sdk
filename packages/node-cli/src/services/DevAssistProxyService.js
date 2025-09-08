/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';
/** http libraries */
const http = require('node:http');
const https = require('node:https');

/** Authentication methods */
const {
	getAuthIds,
	checkIfReauthorizationIsNeeded,
	forceRefreshAuthorization,
} = require('../utils/AuthenticationUtils');
const {
	AUTHORIZATION_PROPERTIES_KEYS,
} = require('../ApplicationConstants');

/** Message literal service method */
const NodeTranslationService = require('./NodeTranslationService');
const {
	DEV_ASSIST_PROXY_SERVICE,
} = require('./TranslationKeys');

const SdkOperationResult = require('../utils/SdkOperationResult');
const { ServerResponse, IncomingMessage } = require('node:http');

const LOCAL_HOSTNAME = '127.0.0.1';
const UNAUTHORIZED_RESPONSE = 401;
const INTERNAL_SERVER_ERROR_RESPONSE = 500;

/** Target server port */
const TARGET_SERVER_PORT = 443;

module.exports = class DevAssistProxyService {

	constructor(sdkPath, executionEnvironmentContext) {
		this._sdkPath = sdkPath;
		this._executionEnvironmentContext = executionEnvironmentContext;
		this._accessToken = undefined;
		this._targetHost = undefined;
		this._proxy = undefined;
		this._authId = undefined;
	}

	async _retrieveAccessToken() {
		const authIDActionResult = await getAuthIds(this._sdkPath);

		if (!authIDActionResult.isSuccess()) {
			throw authIDActionResult.errorMessages;
		}

		if (!authIDActionResult.data.hasOwnProperty(this._authId)) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.NOT_EXISTING_AUTH_ID, this._authId);
		}
		return {
			accessToken: authIDActionResult.data[this._authId].token.accessToken,
			hostName: authIDActionResult.data[this._authId].hostInfo.hostName,
		};
	}

	_buildOptions(clineRequest) {
		const authorization = 'Bearer ' + this._accessToken;
		const options = {
			hostname: this._targetHost,
			port: TARGET_SERVER_PORT,
			path: clineRequest.url,
			method: clineRequest.method,
			headers: { ...clineRequest.headers, authorization },
		};

		// Add agent for insecure connections when connecting to runboxes
		if (this._targetHost && this._targetHost.includes('vm.eng')) {
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

	async _forceRefreshAuth(authId) {
		let inspectAuthOperationResult = await checkIfReauthorizationIsNeeded(authId, this._sdkPath, this._executionEnvironmentContext);
		if (!inspectAuthOperationResult.isSuccess()) {
			throw inspectAuthOperationResult.errorMessages;
		}

		let inspectAuthData = inspectAuthOperationResult.data;
		if (inspectAuthData[AUTHORIZATION_PROPERTIES_KEYS.NEEDS_REAUTHORIZATION]) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.NEED_TO_REAUTHENTICATE);
		} else {
			//force refresh
			let result = await forceRefreshAuthorization(authId, this._sdkPath, this._executionEnvironmentContext);
			if (result.status === 'ERROR') {
				//TODO ensure there is no error here
				throw result.errorMessages[0];
			}
			this._accessToken = result.data.accessToken;
		}
	}

	_handleProxyError(res, err) {
		console.error('Proxy request error:', err);
		res.writeHead(500);
		res.end('SuiteCloud Proxy error: ' + err.message);
	}

	_handleProxyResponse(res, req, options, retryCount, body, proxyRes) {
		console.log(`Proxy response ${retryCount}: ${proxyRes.statusCode}`);

		if (proxyRes.statusCode === UNAUTHORIZED_RESPONSE && retryCount < 1) {
			proxyRes.resume(); // Consume the original response to prevent hanging
			this._forceRefreshAuth(this._authId).then(() => {
				// Retry the request with updated token
				const newAuthorization = 'Bearer ' + this._accessToken;
				const newOptions = {
					...options,
					headers: { ...options.headers, authorization: newAuthorization },
				};
				const newProxyReq = https.request(newOptions, this._handleProxyResponse.bind(this, res, req, options, retryCount + 1, body));
				newProxyReq.on('error', this._handleProxyError.bind(this, res));
				newProxyReq.write(body);
				newProxyReq.end();
			});
		} else {
			res.writeHead(proxyRes.statusCode || INTERNAL_SERVER_ERROR_RESPONSE, proxyRes.headers);
			proxyRes.pipe(res, { end: true });
		}
	}

	async start(authId, localProxyPort) {

		//Parameters validation
		if (!authId) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.MISSING_AUTH_ID);
		} else {
			this._authId = authId;
		}

		if (!localProxyPort) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.MISSING_PORT);
		}

		if (isNaN(localProxyPort)) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.PORT_MUST_BE_NUMBER);
		}

		let { accessToken, hostName } = await this._retrieveAccessToken();
		this._targetHost = hostName;
		this._accessToken = accessToken;

		this._proxy = http.createServer();

		this._proxy.addListener('request', (req, res) => {
			console.log(`${req.method} ${req.url}`);

			const options = this._buildOptions(req);

			const bodyChunks = [];
			req.on('data', (chunk) => bodyChunks.push(chunk));
			req.on('end', () => {
				const body = Buffer.concat(bodyChunks);
				const proxyReq = https.request(options, this._handleProxyResponse.bind(this, res, req, options, 0, body));
				proxyReq.on('error', this._handleProxyError.bind(this, res));
				proxyReq.write(body);
				proxyReq.end();
			});
		});

		this._proxy.listen(localProxyPort, LOCAL_HOSTNAME, () => {
			const localURL = `http://${LOCAL_HOSTNAME}:${localProxyPort}`;
			console.log(`SuiteCloud Proxy server listening on ${localURL}`);
			console.log(`Set Cline Base URL to: ${localURL}/api/internal/devassist`);
			console.log('SuiteCloud Proxy running.');
			console.log(`Configure Cline Base URL to: ${localURL}/api/internal/devassist`);
			console.log(`SuiteCloud Proxy server listening on ${localURL}`);
			console.log(`SuiteCloud Proxy is using the ${authId} authID`);
			console.log(`Configure Cline Base URL to: ${localURL}/api/internal/devassist`);
		});

	}

	async stop(authId, localProxyPort) {
		//TODO to develop
	}
};




//https://github.com/oracle/netsuite-suitecloud-sdk/security/dependabot/85

