import * as vscode from 'vscode';
import { VSCODE_PLATFORM } from '../ApplicationConstants';
import { getSdkPath } from '../core/sdksetup/SdkProperties';
import VSConsoleLogger from "../loggers/VSConsoleLogger";
import MessageService from '../service/MessageService';
import { REFRESH_AUTHORIZATION } from '../service/TranslationKeys';
import { VSTranslationService } from '../service/VSTranslationService';
import type { DevAssistProxyServiceInterface } from '../util/ExtensionUtil';
import { AuthenticationUtils, DevAssistProxyServiceClass, ExecutionEnvironmentContext } from '../util/ExtensionUtil';

// add breaklines to be able to differenciate logs in suitecloud output
// if there is a problem when starting/restarting devassistproxy show a notificaiton with a button to see output and another that is open suiteclouud>devAssist settings
// maybe what we want to do is to open suitecloud>devAssist settings
// extra: add a status bar with current dev-assist-service status, clicking on it should bring the user to its setttings
//      should be red color if there is a problem, blue if configuration is alright

// CONSTANTS
const defaultSettings = {
    enableProxy: false,
    proxyPort: 8181,
    authID: 'runbox'
}

const proxyServiceEvents = {
    reauthorize: 'authRefreshManual'
}

const proxyUrlParts = {
    scheme: 'http://',
    localhost: '127.0.0.1',
    path: '/api/internal/devassist'
}
const getProxyUrl = (port: number) => `${proxyUrlParts.scheme}${proxyUrlParts.localhost}:${port}${proxyUrlParts.path}`

// should be in sycn with vscode-extension package.json config properties
const configKeys = {
    devAssistSection: 'suitecloud.devAssist',
    enableProxy: 'enable',
    auhtID: 'authID',
    proxyPort: 'proxyPort'
}

const executionEnvironmentContext = new ExecutionEnvironmentContext({
    platform: VSCODE_PLATFORM,
    platformVersion: vscode.version,
});

let devAssistProxyService: DevAssistProxyServiceInterface;
const vsLogger: VSConsoleLogger = new VSConsoleLogger();
const vsNotificationService = new MessageService('DevAssistService');
const translationService = new VSTranslationService();


export const startDevAssistProxyIfEnabled = async () => {
    const devAssistConfig = getDevAssistConfig();
    console.log('startDevAssistProxyIfEnabled', devAssistConfig);

    if (devAssistConfig.enableProxy) {
        try {
            initializeDevAssistService();
            await startDevAssistService(devAssistConfig.authID, devAssistConfig.localPort);
        } catch (error) {
            showStartDevAssistProblemNotification('startup', error as string, devAssistConfig);
        }
    } else {
        if (devAssistProxyService) {
            // this shouldn't happen
            vsLogger.info("Stoping DevAssist proxy. This shouldn't happen.");
            devAssistProxyService.stop()
        }
        // TODO: We might want to propose to configure and enable service
        vsLogger.log('DevAssist service is not enabled.')
    }
    // add extra line to differenciate logs
    vsLogger.info('');

    // just for testing purposes
    return devAssistProxyService;
}

export const devAssistConfigurationChangeHandler = async (configurationChangeEvent: vscode.ConfigurationChangeEvent) => {
    if (configurationChangeEvent.affectsConfiguration(configKeys.devAssistSection)) {
        const devAssistConfig = getDevAssistConfig();
        console.log('DevAssist Proxy enabled: ' + devAssistConfig.enableProxy);
        console.log(devAssistConfig);

        if (devAssistConfig.enableProxy === true) {
            if (devAssistProxyService) {
                await devAssistProxyService?.stop();
            } else {
                initializeDevAssistService();
            }

            try {
                await startDevAssistService(devAssistConfig.authID, devAssistConfig.localPort);
            } catch (error) {
                showStartDevAssistProblemNotification('settingsChange', error as string, devAssistConfig);
            }
        } else {
            await stopDevAssistService();
        }
        // add extra line to differenciate logs
        vsLogger.info('');
    }
};


const initializeDevAssistService = () => {
    const devAssistConfig = getDevAssistConfig()

    try {
        devAssistProxyService = new DevAssistProxyServiceClass(getSdkPath(), executionEnvironmentContext);
        vsLogger.info(`DevAssist initialized using authID: ${devAssistConfig.authID} and port: ${devAssistConfig.localPort}`)

        // adding listener to trigger manual reauthentication from vscode
        devAssistProxyService.on(proxyServiceEvents.reauthorize, async (emitParams: { authId: string, message: string }) => {
            const devAssistConfigOnReauthorize = getDevAssistConfig();
            // TODO: not sure which authID we should use or if they could be different at all
            const refreshIsSuccessful = await refreshAuthorizationWithNotifications(emitParams.authId);
            // TODO: we could be using something like devAsssitProxy.reloadAccessToken() to avoid extra forceRefresh in next cline request
            if (refreshIsSuccessful) {
                try {
                    stopDevAssistService();
                    await startDevAssistService(emitParams.authId, devAssistConfigOnReauthorize.localPort);
                } catch (error) {
                    showStartDevAssistProblemNotification('afterManualRefresh', error as string, devAssistConfigOnReauthorize)
                }
            }
        })
    } catch (error) {
        vsLogger.error(`There was an error when initializing DevAssist service.\n${error}`)
    }
};

const startDevAssistService = async (devAssistAuthID: string, localPort: number) => {
    await devAssistProxyService.start(devAssistAuthID, localPort);
    
    const clineURLMessage = `Set Cline Base URL to: ${getProxyUrl(localPort)}`;
    const devAssistRunningAndClineURL = `DevAssist service is running.\n${clineURLMessage}`;
    
    vsLogger.info(devAssistRunningAndClineURL)
    vsNotificationService.showCommandInfo(devAssistRunningAndClineURL);
}

const stopDevAssistService = async () => {
    await devAssistProxyService.stop();
    const stopMessage = 'DevAssist service has been stoped.';
    vsLogger.info(stopMessage)
    vsNotificationService.showCommandInfo(stopMessage);
}

const showStartDevAssistProblemNotification = (errorStage: string, error: string, devAssistConfig: devAssistConfig) => {
    vsLogger.error(`There was a problem when starting DevAssist service. (${errorStage})\n${error}`);
    // for debugging purposes
    vsLogger.error(`Current DevAssist settings are: ${JSON.stringify({ devAssistConfig })}`);
    vsNotificationService.showCommandErrorDevAssist('There was a problem when starting DevAssist service.');
}

type devAssistConfig = { enableProxy: boolean, authID: string, localPort: number };
const getDevAssistConfig = (): devAssistConfig => {
    const devAssistConfigSection = vscode.workspace.getConfiguration(configKeys.devAssistSection);

    const enableProxy = devAssistConfigSection.get<boolean>(configKeys.enableProxy) || defaultSettings.enableProxy;
    const authID = devAssistConfigSection.get<string>(configKeys.auhtID) || defaultSettings.authID;
    const localPort = devAssistConfigSection.get<number>(configKeys.proxyPort) || defaultSettings.proxyPort;

    return { enableProxy, authID, localPort }
}

// refresh authorization with notification popups 
const refreshAuthorizationWithNotifications = async (authID: string) => {
    const executionEnvironmentContext = new ExecutionEnvironmentContext({
        platform: VSCODE_PLATFORM,
        platformVersion: vscode.version,
    });
    vsNotificationService.showInformationMessage(
        translationService.getMessage(
            REFRESH_AUTHORIZATION.CREDENTIALS_NEED_TO_BE_REFRESHED, authID
        )
    );
    const refreshAuthzOperationResult = await AuthenticationUtils.refreshAuthorization(
        authID,
        getSdkPath(),
        executionEnvironmentContext
    );
    console.log('log from refreshAuthorization DevAssistConfiguration.', { refreshAuthzOperationResult });
    vsLogger.info('log from refreshAuthorization DevAssistConfiguration.')
    vsLogger.info(JSON.stringify(refreshAuthzOperationResult))

    if (!refreshAuthzOperationResult.isSuccess()) {
        // throw refreshAuthzOperationResult.errorMessages;
        vsNotificationService.showCommandError(refreshAuthzOperationResult.errorMessages.join('\n'), false);
        return false;
    }
    vsNotificationService.showInformationMessage(
        translationService.getMessage(
            REFRESH_AUTHORIZATION.AUTHORIZATION_REFRESH_COMPLETED
        )
    );
    return true;
}

