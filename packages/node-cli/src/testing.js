/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
const DevAssistProxyService = require('./services/DevAssistProxyService')
const authId = 'antonioauth';

const sdkpath = 'C:\\Users\\Carol\\.suitecloud-sdk\\cli\\cli-2025.1.0.jar';
const proxyService = new DevAssistProxyService(sdkpath);
proxyService.start(authId, 8181);





