/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';
/** http libraries */
const http = require('node:http');
const https = require('node:https');
const EventEmitter = require('events');

/** Events */
const AUTH_REFRESH_MANUAL_EVENT = 'authRefreshManual';

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

const MAX_RETRY_ATTEMPTS = 1;
const LOCAL_HOSTNAME = '127.0.0.1';

/** Target server port */
const TARGET_SERVER_PORT = 443;

/** Http codes */
const UNAUTHORIZED_RESPONSE = 401;
const FORBIDDEN_RESPONSE = 403;
const INTERNAL_SERVER_ERROR_RESPONSE = 500;

class DevAssistProxyService extends EventEmitter {
	constructor(sdkPath, executionEnvironmentContext) {
		super();
		this._sdkPath = sdkPath;
		this._executionEnvironmentContext = executionEnvironmentContext;
		/** These are the variables we are going to use to store instance data */
		this._accessToken = undefined;
		this._localProxy = undefined;
		this._targetHost = undefined;
		this._authId = undefined;
	}

	/**
	 * This method retrieves the credentials and returns the hostname and the accessToken
	 * @returns {Promise<{hostName: string, accessToken: string}>}
	 * @private
	 */
	async _retrieveCredentials() {
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

	/**
	 * This method refreshes authorization.
	 * If successful returns true and updates this._accessToken
	 * If not successful returns false an emits an event
	 * @returns {Promise<*>}
	 * @private
	 */
	async _forceRefreshAuth() {
		let inspectAuthOperationResult = await checkIfReauthorizationIsNeeded(this._authId, this._sdkPath, this._executionEnvironmentContext);
		if (!inspectAuthOperationResult.isSuccess()) {
			//check throw inspectAuthOperationResult.errorMessages;
			//TODO send special message The remote server returned an error:\n\n\nReceived fatal alert: internal_error; when not being able to connect, for instance vpn disconnected
			//Also not being able to connect to cli
			return false;
		}
		let inspectAuthData = inspectAuthOperationResult.data;
		if (inspectAuthData[AUTHORIZATION_PROPERTIES_KEYS.NEEDS_REAUTHORIZATION]) {
			//Emit event needs manual reauthorization
			return false;
		}
		//force refresh
		let result = await forceRefreshAuthorization(this._authId, this._sdkPath, this._executionEnvironmentContext);
		if (result.status === 'ERROR') {
			//Even problem when refresh authorization
			//emit event for manual reauthorization
			return false;
		} else {
			//Update refresh token
			this._accessToken = result.data.accessToken;
			return true;
		}
	}

	/**
	 * Builds request options
	 * @param req request
	 * @returns {{path: *, headers: *&{authorization: string}, hostname: *, method: *, port: number}}
	 * @private
	 */
	_buildOptions(req) {
		const authorization = 'Bearer ' + this._accessToken;

		const options = {
			hostname: this._targetHost,
			port: TARGET_SERVER_PORT,
			path: req.url,
			method: req.method,
			headers: { ...req.headers, authorization },
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

	/**
	 * Update options access token
	 * @param options
	 * @private
	 */
	_updateOptionsAccessToken(options) {
		if (options.headers && options.headers.authorization) {
			options.headers.authorization = 'Bearer ' + this._accessToken;
		}
	}

	/**
	 * Write JSON response message
	 * @param res
	 * @param responseCode
	 * @param responseMessage
	 * @private
	 */
	_writeResponseMessage(res, responseCode, responseMessage) {
		res.writeHead(responseCode, { 'Content-Type': 'application/json' });
		const message = { error: responseMessage };
		res.end(JSON.stringify(message));
	}

	/**
	 * starts the listener.
	 * It can return an error, for instance when it cannot connect to the auth server or the parameters being incorrect
	 * @param authId
	 * @param proxyPort
	 * @returns {Promise<void>}
	 */
	async start(authId, proxyPort) {

		//Parameters validation
		if (!authId) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.MISSING_AUTH_ID);
		} else {
			this._authId = authId;
		}

		if (!proxyPort) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.MISSING_PORT);
		}

		if (isNaN(proxyPort)) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.PORT_MUST_BE_NUMBER);
		}

		//Retrieve from authId accessToken and target host
		let { accessToken, hostName } = await this._retrieveCredentials();
		this._targetHost = hostName;
		this._accessToken = accessToken;

		this._localProxy = http.createServer();


		this._localProxy.addListener('request', async (req, res) => {
			console.log(`${req.method} ${req.url}`);

			let options = this._buildOptions(req);
			const self = this;

			//Save body
			const bodyChunks = [];
			req.on('data', function(chunk) {
				bodyChunks.push(chunk);
			});

			req.on('end', async function() {
				const body = Buffer.concat(bodyChunks);
				const proxyReq = await self._createProxyReq(options, body, res, 0);

				proxyReq.on('error', function(err) {
					console.error('Proxy request error:', err);
					res.writeHead(INTERNAL_SERVER_ERROR_RESPONSE);
					res.end('SuiteCloud Proxy error: ' + err.message);
				});

				proxyReq.write(body);
				proxyReq.end();
			});
		});

		this._localProxy.listen(proxyPort, LOCAL_HOSTNAME, () => {
			const localURL = `http://${LOCAL_HOSTNAME}:${proxyPort}`;
			console.log(`SuiteCloud Proxy server listening on ${localURL}`);
			console.log(`Set Cline Base URL to: ${localURL}/api/internal/devassist`);
			console.log('SuiteCloud Proxy running.');
			console.log(`Configure Cline Base URL to: ${localURL}/api/internal/devassist`);
			console.log(`SuiteCloud Proxy server listening on ${localURL}`);
			console.log(`SuiteCloud Proxy is using the ${authId} authID`);
			console.log(`Configure Cline Base URL to: ${localURL}/api/internal/devassist`);
		});
	}

	async _createProxyReq(options, body, res, attempts) {
		return https.request(options, async (proxyRes) => {
			console.log(`Proxy response ${attempts}: ${proxyRes.statusCode}`);
			if (proxyRes.statusCode === UNAUTHORIZED_RESPONSE && attempts <= MAX_RETRY_ATTEMPTS) {
				proxyRes.resume();
				let authSuccess = await this._forceRefreshAuth();
				if (authSuccess) {
					this._updateOptionsAccessToken(options);
					let clientRequest = await this._createProxyReq(options, body, res, attempts + 1);
					clientRequest.write(body);
					clientRequest.end();
					return clientRequest;
				} else {
					let needsToReauthenticateMsg = NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.NEED_TO_REAUTHENTICATE);
					this.emit(AUTH_REFRESH_MANUAL_EVENT, {
						message: needsToReauthenticateMsg,
						'authId': this._authId,
					});
					this._writeResponseMessage(res, FORBIDDEN_RESPONSE,needsToReauthenticateMsg);
					proxyRes.pipe(res, { end: true });
					return;
				}
			}

			res.writeHead(proxyRes.statusCode || INTERNAL_SERVER_ERROR_RESPONSE, proxyRes.headers);
			proxyRes.pipe(res, { end: true });
		});
	}

	/**
	 * Stops server
	 * @returns {Promise<void>}
	 */
	async stop() {
		if (this._localProxy) {
			this._localProxy.close(() => console.log('SuiteCloud Proxy server stopped.'));
			this._localProxy = null;
		} else {
			console.log('No server instance to stop.');
		}
	}
}

module.exports = { DevAssistProxyService, AUTH_REFRESH_MANUAL_EVENT };