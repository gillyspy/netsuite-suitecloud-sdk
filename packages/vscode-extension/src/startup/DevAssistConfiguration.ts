import * as vscode from 'vscode';
import { VSCODE_PLATFORM } from '../ApplicationConstants';
import { getSdkPath } from '../core/sdksetup/SdkProperties';
import VSConsoleLogger from "../loggers/VSConsoleLogger";
import MessageService from '../service/MessageService';
import { REFRESH_AUTHORIZATION } from '../service/TranslationKeys';
import { VSTranslationService } from '../service/VSTranslationService';
import type { SuiteCloudAuthProxyServiceInterface } from '../types/JavascriptNodeCli';
import { AuthenticationUtils, SuiteCloudAuthProxyService, ExecutionEnvironmentContext } from '../util/ExtensionUtil';


// CONSTANTS
type devAssistConfig = {
    proxyEnabled: boolean,
    authID: string,
    localPort: number,
    startupNotificationEnabled: boolean
};
const defaultSettings: devAssistConfig = {
    proxyEnabled: false,
    localPort: 8181,
    authID: 'authid-to-be-used-by-devassist',
    startupNotificationEnabled: true,
}

const devAssistConfigStatus: { current: devAssistConfig, previous: devAssistConfig } = {
    current: {
        proxyEnabled: false,
        authID: '',
        localPort: 0,
        startupNotificationEnabled: true,
    },
    previous: {
        proxyEnabled: false,
        authID: '',
        localPort: 0,
        startupNotificationEnabled: true
    }
}

const proxyServiceEvents = {
    reauthorize: 'authRefreshManual',
    serverError: 'serverError'
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
    proxyEnabled: 'enable',
    auhtID: 'authID',
    localPort: 'proxyPort',
    startupNotificationEnabled: 'showNotification'
}

const executionEnvironmentContext = new ExecutionEnvironmentContext({
    platform: VSCODE_PLATFORM,
    platformVersion: vscode.version,
});

let devAssistProxyService: SuiteCloudAuthProxyServiceInterface;
const vsLogger: VSConsoleLogger = new VSConsoleLogger();
const vsNotificationService = new MessageService('DevAssistService');
const translationService = new VSTranslationService();


export const startDevAssistProxyIfEnabled = async (devAssistStatusBar: vscode.StatusBarItem) => {
    updateDevAssistConfigStatus();
    console.log('startDevAssistProxyIfEnabled', devAssistConfigStatus.current);

    if (devAssistConfigStatus.current.startupNotificationEnabled && !devAssistConfigStatus.current.proxyEnabled) {
        vsNotificationService.showDevAssistStartUpMessage('SuiteCloud Dev Assist is here. Enable it here [link to Settings] and start using in it')
    }

    if (devAssistConfigStatus.current.proxyEnabled) {
        try {
            initializeDevAssistService(devAssistStatusBar);
            await startDevAssistService(devAssistConfigStatus.current.authID, devAssistConfigStatus.current.localPort, devAssistStatusBar);
        } catch (error) {
            showStartDevAssistProblemNotification('startup', error as string, devAssistConfigStatus.current, devAssistStatusBar);
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

export const devAssistConfigurationChangeHandler = async (configurationChangeEvent: vscode.ConfigurationChangeEvent, devAssistStatusBar: vscode.StatusBarItem) => {
    if (configurationChangeEvent.affectsConfiguration(configKeys.devAssistSection)) {
        updateDevAssistConfigStatus();

        if (!devAssistConfigStatusHasEffectivelyChanged()) {
            // if configuration has not effectively changed do not perform any action
            return;
        }
        console.log('DevAssist Proxy enabled: ' + devAssistConfigStatus.current.proxyEnabled);
        console.log(devAssistConfigStatus.current);

        if (devAssistConfigStatus.current.proxyEnabled === true) {
            if (devAssistProxyService) {
                await devAssistProxyService?.stop();
            } else {
                initializeDevAssistService(devAssistStatusBar);
            }

            try {
                await startDevAssistService(devAssistConfigStatus.current.authID, devAssistConfigStatus.current.localPort, devAssistStatusBar);
            } catch (error) {
                showStartDevAssistProblemNotification('settingsChange', error as string, devAssistConfigStatus.current, devAssistStatusBar);
            }
        } else { // devAssistConfig.proxyEnabled === false
            await stopDevAssistService(devAssistStatusBar);
            devAssistStatusBar.hide()
        }
        // add extra line to differenciate logs
        vsLogger.info('');
    }
};


const initializeDevAssistService = (devAssistStatusBar: vscode.StatusBarItem) => {
    try {
        devAssistProxyService = new SuiteCloudAuthProxyService(getSdkPath(), executionEnvironmentContext);
        vsLogger.info(`DevAssist initialized using authID: ${devAssistConfigStatus.current.authID} and port: ${devAssistConfigStatus.current.localPort}`)

        // adding listener to trigger manual reauthentication from vscode
        devAssistProxyService.on(proxyServiceEvents.reauthorize, async (emitParams: { authId: string, message: string }) => {
            updateDevAssistConfigStatus();
            // TODO: not sure which authID we should use or if they could be different at all
            const refreshIsSuccessful = await refreshAuthorizationWithNotifications(emitParams.authId);
            // TODO: we could be using something like devAsssitProxy.reloadAccessToken() to avoid extra forceRefresh in next cline request
            if (refreshIsSuccessful) {
                try {
                    stopDevAssistService(devAssistStatusBar);
                    await startDevAssistService(emitParams.authId, devAssistConfigStatus.current.localPort, devAssistStatusBar);
                } catch (error) {
                    showStartDevAssistProblemNotification('afterManualRefresh', error as string, devAssistConfigStatus.current, devAssistStatusBar)
                }
            }
        });

        devAssistProxyService.on(proxyServiceEvents.serverError, (emitParams: { authId: string, message: string }) => {
            updateDevAssistConfigStatus();
            // just forwarding info into suitecloud output for now
            vsLogger.error(`ServerError has occured when running DevAssist service.\nError: ${emitParams.message}`)
        });
    } catch (error) {
        vsLogger.error(`There was an error when initializing DevAssist service.\n${error}`)
    }
};

const startDevAssistService = async (devAssistAuthID: string, localPort: number, devAssistStatusBar: vscode.StatusBarItem) => {
    await devAssistProxyService.start(devAssistAuthID, localPort);

    const clineURLMessage = `Set Cline Base URL to: ${getProxyUrl(localPort)}`;
    const devAssistRunningAndClineURL = `DevAssist service is running.\n${clineURLMessage}`;

    devAssistStatusBar.text = `$(terminal-view-icon) DevAssist is running.`;
    devAssistStatusBar.backgroundColor = undefined;
    devAssistStatusBar.show();

    vsLogger.info(devAssistRunningAndClineURL)
    vsNotificationService.showCommandInfo(devAssistRunningAndClineURL);
}

const stopDevAssistService = async (devAssistStatusBar: vscode.StatusBarItem) => {
    await devAssistProxyService.stop();

    devAssistStatusBar.text = `$(ports-stop-forward-icon) DevAssist is stopped.`;
    devAssistStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
    // devAssistStatusBar.show();

    if (!devAssistConfigStatus.current.proxyEnabled && devAssistConfigStatus.previous.proxyEnabled) {
        const stopMessage = 'DevAssist service has been stoped.';
        vsLogger.info(stopMessage)
        vsNotificationService.showCommandInfo(stopMessage);
    }
}

const showStartDevAssistProblemNotification = (errorStage: string, error: string, devAssistConfig: devAssistConfig, devAssistStatusBar: vscode.StatusBarItem) => {
    vsLogger.error(`There was a problem when starting DevAssist service. (${errorStage})\n${error}`);
    // for debugging purposes
    // vsLogger.error(`Current DevAssist settings are: ${JSON.stringify({ devAssistConfig })}`);

    devAssistStatusBar.text = `$(ports-stop-forward-icon) DevAssist is stopped.`;
    devAssistStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
    devAssistStatusBar.show();

    vsNotificationService.showCommandErrorDevAssist('There was a problem when starting DevAssist service.');
}

const updateDevAssistConfigStatus = (): void => {

    const previousConfig: devAssistConfig = devAssistConfigStatus.current;

    const currentConfig: devAssistConfig = getDevAssistCurrentSettings();

    // const configHasEffectivelyChanged = devAssistConfigurationHasChanged(newConfig)

    // update saved status
    devAssistConfigStatus.current = currentConfig;
    devAssistConfigStatus.previous = previousConfig;
}

const getDevAssistCurrentSettings = (): devAssistConfig => {
    const devAssistConfigSection = vscode.workspace.getConfiguration(configKeys.devAssistSection);

    //  * The *effective* value (returned by {@linkcode WorkspaceConfiguration.get get}) is computed by overriding or merging the values in the following order:
    //  *
    //  * 1. `defaultValue` (if defined in `package.json` otherwise derived from the value's type)
    //  * 2. `globalValue` (if defined)
    //  * 3. `workspaceValue` (if defined)
    //  * 4. `workspaceFolderValue` (if defined)
    //  * 5. `defaultLanguageValue` (if defined)
    //  * 6. `globalLanguageValue` (if defined)
    //  * 7. `workspaceLanguageValue` (if defined)
    //  * 8. `workspaceFolderLanguageValue` (if defined)
    //  * Refer to [Settings](https://code.visualstudio.com/docs/getstarted/settings) for more information.

    // we don't know exaclty were configuration change comes from when devAssistConfigurationChangeHandler is called
    // it could be that configuration has changed from globalValue (user) and there is workspaceValue that has left intact
    // this is not 100% sure but configuration could have been changed even in different vscode editor instance
    // we should not be performing any action in the case devAssist settings haven't effectivelly changed 
    const proxyEnabled = devAssistConfigSection.get<boolean>(configKeys.proxyEnabled) || defaultSettings.proxyEnabled;
    const authID = devAssistConfigSection.get<string>(configKeys.auhtID) || defaultSettings.authID;
    const localPort = devAssistConfigSection.get<number>(configKeys.localPort) || defaultSettings.localPort;
    const startupNotificationEnabled = devAssistConfigSection.get<boolean>(configKeys.startupNotificationEnabled) || defaultSettings.startupNotificationEnabled;

    return { proxyEnabled, authID, localPort, startupNotificationEnabled }
}

const devAssistConfigStatusHasEffectivelyChanged = (): boolean => {
    // omiting to compare startupNotificationEnabled status
    if (devAssistConfigStatus.current.authID === devAssistConfigStatus.previous.authID &&
        devAssistConfigStatus.current.localPort === devAssistConfigStatus.previous.localPort &&
        devAssistConfigStatus.current.proxyEnabled === devAssistConfigStatus.previous.proxyEnabled
    ) {
        return false
    }
    return true;
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

    // TODO remove debbugging logs
    console.log('log from refreshAuthorization DevAssistConfiguration.', { refreshAuthzOperationResult });
    vsLogger.info('log from refreshAuthorization DevAssistConfiguration.')
    vsLogger.info(JSON.stringify(refreshAuthzOperationResult))

    if (!refreshAuthzOperationResult.isSuccess()) {
        // throw refreshAuthzOperationResult.errorMessages;
        // vsLogger.error(refreshAuthzOperationResult.)
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

