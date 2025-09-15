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
const EVENTS = {
	SERVER_ERROR: 'serverError',
	AUTH_REFRESH_MANUAL_EVENT : 'authRefreshManual'
}

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
const HTTP_RESPONSE_CODE = {
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	INTERNAL_SERVER_ERROR: 500,
	SERVICE_UNAVAILABLE: 503
}

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
		}
		this._authId = authId;

		if (!proxyPort) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.MISSING_PORT);
		}

		if (isNaN(proxyPort)) {
			throw NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.PORT_MUST_BE_NUMBER);
		}

		//Retrieve from authId accessToken and target host
		const { accessToken, hostName } = await this._retrieveCredentials();
		this._targetHost = hostName;
		this._accessToken = accessToken;

		await this.stop();
		this._localProxy = http.createServer();

		this._localProxy.addListener('request', async (req, res) => {

			const options = this._buildOptions(req);

			//Save body
			const bodyChunks = [];
			req.on('data', function(chunk) {
				bodyChunks.push(chunk);
			});

			req.on('end', async () => {
				const body = Buffer.concat(bodyChunks);
				const proxyReq = await this._createProxyReq(options, body, res, 0);
				proxyReq.write(body);
				proxyReq.end();
			});
		});

		this._localProxy.listen(proxyPort, LOCAL_HOSTNAME, () => {
			const localURL = `http://${LOCAL_HOSTNAME}:${proxyPort}`;
			console.log(`SuiteCloud Proxy server listening on ${localURL}`);
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

	async reloadAccessToken() {
		const { accessToken} = await this._retrieveCredentials();
		this._accessToken = accessToken;
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
	 * Record which returns the results of _updateAccessToken
	 * @type {*}
	 */
	_buildResponseUpdateAccessToken(opSuccessful, emitEvent, emitObjectMessage, errorMsg, httpStatusCode, authId) {
		//boolean (true|false) whether the token has been refresh or has been any problem
		if (opSuccessful) {
			return Object.freeze({ opSuccessful });
		} else {
			const emitObject = { message: emitObjectMessage, authId: authId };
			return Object.freeze({ opSuccessful, emitEvent, emitObject, errorMsg, httpStatusCode });
		}
	}

	/**
	 * This method refreshes authorization.
	 * If successful returns true and updates this._accessToken
	 * If not successful returns false and emits an event.
	 * It returns an object with the results of the operation. See _buildResponseUpdateAccessToken method.
	 * @returns {Promise<*>}
	 * @private
	 */
	//enum
	async _updateAccessToken() {
		const inspectAuthOperationResult = await checkIfReauthorizationIsNeeded(this._authId, this._sdkPath, this._executionEnvironmentContext);
		//Not being able to execute the reauth if needed, can be vpn disconnected, network problems...
		if (!inspectAuthOperationResult.isSuccess()) {
			const msg = NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.SERVER_COMMUNICATION_ERROR);
			return this._buildResponseUpdateAccessToken(false, EVENTS.SERVER_ERROR, msg,
				msg, HTTP_RESPONSE_CODE.FORBIDDEN, this._authId);
		}
		//Needs manual reauthorization
		const inspectAuthData = inspectAuthOperationResult.data;
		if (inspectAuthData[AUTHORIZATION_PROPERTIES_KEYS.NEEDS_REAUTHORIZATION]) {
			//Emit event needs manual reauthorization
			const msg = NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.NEED_TO_REAUTHENTICATE);
			return this._buildResponseUpdateAccessToken(false, EVENTS.AUTH_REFRESH_MANUAL_EVENT, msg,
				msg, HTTP_RESPONSE_CODE.FORBIDDEN, this._authId);
		}
		//force refresh
		const result = await forceRefreshAuthorization(this._authId, this._sdkPath, this._executionEnvironmentContext);
		if (result.status === 'ERROR') {
			//Refresh unsuccessful
			const msg = NodeTranslationService.getMessage(DEV_ASSIST_PROXY_SERVICE.NEED_TO_REAUTHENTICATE);
			return this._buildResponseUpdateAccessToken(false, EVENTS.AUTH_REFRESH_MANUAL_EVENT, msg,
				msg, HTTP_RESPONSE_CODE.FORBIDDEN, this._authId);
		} else {
			//Updated refresh token successful
			this._accessToken = result.data.accessToken;
			return this._buildResponseUpdateAccessToken(true);
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
			options.agent = new https.Agent({
				rejectUnauthorized: false,
			});
			options.rejectUnauthorized = false;
		}
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

	async _createProxyReq(options, body, res, attempts) {
		const proxy = https.request(options, async (proxyRes) => {
			console.log(`Proxy response ${attempts}: ${proxyRes.statusCode}`);
			if (proxyRes.statusCode === HTTP_RESPONSE_CODE.UNAUTHORIZED && attempts <= MAX_RETRY_ATTEMPTS) {
				proxyRes.resume();
				const updateAccessTokenResponse = await this._updateAccessToken();
				if (updateAccessTokenResponse.opSuccessful) {
					this._updateOptionsAccessToken(options);
					const proxyReq = await this._createProxyReq(options, body, res, attempts + 1);
					proxyReq.write(body);
					proxyReq.end();
					return proxyReq;
				} else {
					this.emit(updateAccessTokenResponse.emitEvent, updateAccessTokenResponse.emitObject);
					this._writeResponseMessage(res, updateAccessTokenResponse.httpStatusCode, updateAccessTokenResponse.errorMsg);
					proxyRes.pipe(res, { end: true });
					return;
				}
			}

			res.writeHead(proxyRes.statusCode || HTTP_RESPONSE_CODE.INTERNAL_SERVER_ERROR, proxyRes.headers);
			proxyRes.pipe(res, { end: true });
		});
		proxy.on('error', (err) => {
			console.error('Proxy request error:', err);
			res.writeHead(HTTP_RESPONSE_CODE.INTERNAL_SERVER_ERROR);
			res.end('SuiteCloud Proxy error: ' + err.message);
		});
		return proxy;
	}
}

module.exports = { DevAssistProxyService, EVENTS };