// External

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import i18n from '@ohif/i18n';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';

import Compose from './routes/Mode/Compose';
import {
  ExtensionManager,
  CommandsManager,
  HotkeysManager,
  ServiceProvidersManager,
  SystemContextProvider,
  ViewportRefsProvider,
} from '@ohif/core';
import {
  ThemeWrapper as ThemeWrapperNext,
  NotificationProvider,
  ViewportGridProvider,
  DialogProvider,
  CineProvider,
  TooltipProvider,
  Modal as ModalNext,
  ManagedDialog,
  ModalProvider,
  ViewportDialogProvider,
  UserAuthenticationProvider,
} from '@ohif/ui-next';
// Viewer Project
// TODO: Should this influence study list?
import { AppConfigProvider } from '@state';
import createRoutes from './routes';
import appInit from './appInit.js';
import OpenIdConnectRoutes from './utils/OpenIdConnectRoutes';
import { ShepherdJourneyProvider } from 'react-shepherd';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import { StlInstanceProvider } from './context/StlInstanceContext';
import { StlInstanceListDataProvider } from './context/StlInstanceListDataContext';
import { ParentStudyIdProvider } from './context/parentStudyIdContext';
import { MeasurementProvider } from '../../../extensions/stl-extention/src/context/MeasurementContext';
import { BrightnessProvider } from '../../../extensions/stl-extention/src/context/BrightnessContext';
import { BoneRemovalProvider } from '../../../extensions/stl-extention/src/context/BoneRemovalContext';
import { ClickRemoveProvider } from '../../../extensions/stl-extention/src/context/ClickRemoveContext';
import { LabelingViewProvider } from '../../../extensions/stl-extention/src/context/LabelingViewContext';
import { VersionHistoryProvider } from '../../../extensions/stl-extention/src/context/VersionHistoryContext';
import { ImplantProvider } from '../../../extensions/stl-extention/src/context/ImplantContext';
import { StlVisibilityProvider } from '../../../extensions/stl-extention/src/context/StlVisibilityContext';
import { AngleMeasurementProvider } from '../../../extensions/stl-extention/src/context/AngleMeasurementContext';
import { SpineLabelingProvider } from '../../../extensions/stl-extention/src/context/SpineLabelingContext';
import { SpineLabelOverlayProvider } from '../../../extensions/stl-extention/src/context/SpineLabelOverlayContext';
import { ThreeDToolsBridgeProvider } from '../../../extensions/stl-extention/src/context/ThreeDToolsBridgeContext';
import { ActivePanelProvider } from '../../../extensions/stl-extention/src/context/ActivePanelContext';
import { OvfLegendProvider } from '../../../extensions/stl-extention/src/context/OvfLegendContext';
import { ImplantDrawingProvider } from '../../../extensions/stl-extention/src/context/ImplantDrawingContext';

let commandsManager: CommandsManager,
  extensionManager: ExtensionManager,
  servicesManager: AppTypes.ServicesManager,
  serviceProvidersManager: ServiceProvidersManager,
  hotkeysManager: HotkeysManager;

function App({
  config = {
    /**
     * Relative route from domain root that OHIF instance is installed at.
     * For example:
     *
     * Hosted at: https://ohif.org/where-i-host-the/viewer/
     * Value: `/where-i-host-the/viewer/`
     * */
    routerBasename: '/',
    /**
     *
     */
    showLoadingIndicator: true,
    showStudyList: true,
    oidc: [],
    extensions: [],
  },
  defaultExtensions = [],
  defaultModes = [],
}) {
  const [init, setInit] = useState(null);
  useEffect(() => {
    const run = async () => {
      appInit(config, defaultExtensions, defaultModes).then(setInit).catch(console.error);
    };

    run();
  }, []);

  if (!init) {
    return null;
  }

  // Set above for named export
  commandsManager = init.commandsManager;
  extensionManager = init.extensionManager;
  servicesManager = init.servicesManager;
  serviceProvidersManager = init.serviceProvidersManager;
  hotkeysManager = init.hotkeysManager;

  // Set appConfig
  const appConfigState = init.appConfig;
  const { routerBasename, modes, dataSources, oidc, showStudyList } = appConfigState;

  // get the maximum 3D texture size
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');

  if (gl) {
    const max3DTextureSize = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
    appConfigState.max3DTextureSize = max3DTextureSize;
  }

  const {
    uiDialogService,
    uiModalService,
    uiViewportDialogService,
    viewportGridService,
    cineService,
    userAuthenticationService,
    uiNotificationService,
    customizationService,
  } = servicesManager.services;

  const providers = [
    [AppConfigProvider, { value: appConfigState }],
    [UserAuthenticationProvider, { service: userAuthenticationService }],
    [I18nextProvider, { i18n }],
    [ThemeWrapperNext],
    [SystemContextProvider, { commandsManager, extensionManager, hotkeysManager, servicesManager }],
    [ViewportRefsProvider],
    [ViewportGridProvider, { service: viewportGridService }],
    [ViewportDialogProvider, { service: uiViewportDialogService }],
    [CineProvider, { service: cineService }],
    [NotificationProvider, { service: uiNotificationService }],
    [TooltipProvider],
    [DialogProvider, { service: uiDialogService, dialog: ManagedDialog }],
    [ModalProvider, { service: uiModalService, modal: ModalNext }],
    [ShepherdJourneyProvider],
  ];

  // Loop through and register each of the service providers registered with the ServiceProvidersManager.
  const providersFromManager = Object.entries(serviceProvidersManager.providers);
  if (providersFromManager.length > 0) {
    providersFromManager.forEach(([serviceName, provider]) => {
      providers.push([provider, { service: servicesManager.services[serviceName] }]);
    });
  }

  const CombinedProviders = ({ children }) => Compose({ components: providers, children });

  let authRoutes = null;

  // Should there be a generic call to init on the extension manager?
  customizationService.init(extensionManager);

  // Use config to create routes
  const appRoutes = createRoutes({
    modes,
    dataSources,
    extensionManager,
    servicesManager,
    commandsManager,
    hotkeysManager,
    routerBasename,
    showStudyList,
  });

  if (oidc) {
    authRoutes = (
      <OpenIdConnectRoutes
        oidc={oidc}
        routerBasename={routerBasename}
        userAuthenticationService={userAuthenticationService}
      />
    );
  }

  return (
    <CombinedProviders>
      <ActivePanelProvider>
      <OvfLegendProvider>
      <ThreeDToolsBridgeProvider>
      <SpineLabelOverlayProvider>
      <SpineLabelingProvider>
      <AngleMeasurementProvider>
      <StlVisibilityProvider>
      <ImplantProvider>
      <ImplantDrawingProvider>
      <VersionHistoryProvider>
      <LabelingViewProvider>
      <ClickRemoveProvider>
      <BoneRemovalProvider>
      <BrightnessProvider>
      <MeasurementProvider>
        <StlInstanceProvider>
          <StlInstanceListDataProvider>
            <ParentStudyIdProvider>
              <BrowserRouter basename={routerBasename}>
                {authRoutes}
                {appRoutes}
              </BrowserRouter>
            </ParentStudyIdProvider>
          </StlInstanceListDataProvider>
        </StlInstanceProvider>
      </MeasurementProvider>
      </BrightnessProvider>
      </BoneRemovalProvider>
      </ClickRemoveProvider>
      </LabelingViewProvider>
      </VersionHistoryProvider>
      </ImplantDrawingProvider>
      </ImplantProvider>
      </StlVisibilityProvider>
      </AngleMeasurementProvider>
      </SpineLabelingProvider>
      </SpineLabelOverlayProvider>
      </ThreeDToolsBridgeProvider>
      </OvfLegendProvider>
      </ActivePanelProvider>
    </CombinedProviders>
  );
}

App.propTypes = {
  config: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({
      routerBasename: PropTypes.string.isRequired,
      oidc: PropTypes.array,
      whiteLabeling: PropTypes.object,
      extensions: PropTypes.array,
    }),
  ]).isRequired,
  /* Extensions that are "bundled" or "baked-in" to the application.
   * These would be provided at build time as part of they entry point. */
  defaultExtensions: PropTypes.array,
  /* Modes that are "bundled" or "baked-in" to the application.
   * These would be provided at build time as part of they entry point. */
  defaultModes: PropTypes.array,
};

export default App;

export { commandsManager, extensionManager, servicesManager };
