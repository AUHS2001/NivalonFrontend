// Updated ToolbarLayoutSelector.tsx
import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { CommandsManager } from '@ohif/core';

import { LayoutSelector } from '@ohif/ui-next';

function ToolbarLayoutSelectorWithServices({
  commandsManager,
  servicesManager,
  rows = 3,
  columns = 4,
  ...props
}) {
  const { customizationService, viewportGridService, toolbarService, displaySetService } = servicesManager.services;

  // Check if any active display set is reconstructable (has 3D volume data)
  const has3D = displaySetService
    ?.getActiveDisplaySets?.()
    ?.some(ds => ds.isReconstructable);

  // Get the presets from the customization service
  const commonPresets = customizationService?.getCustomization('layoutSelector.commonPresets') || [
    {
      icon: 'layout-single',
      commandOptions: {
        numRows: 1,
        numCols: 1,
      },
    },
    {
      icon: 'layout-side-by-side',
      commandOptions: {
        numRows: 1,
        numCols: 2,
      },
    },
    {
      icon: 'layout-four-up',
      commandOptions: {
        numRows: 2,
        numCols: 2,
      },
    },
    {
      icon: 'layout-three-row',
      commandOptions: {
        numRows: 3,
        numCols: 1,
      },
    },
  ];

  // Get the advanced presets generator from the customization service
  const advancedPresetsGenerator = customizationService?.getCustomization(
    'layoutSelector.advancedPresetGenerator'
  );

  // Generate the advanced presets
  const advancedPresets = advancedPresetsGenerator
    ? advancedPresetsGenerator({ servicesManager })
    : [
        {
          title: 'MPR',
          icon: 'layout-three-col',
          commandOptions: {
            protocolId: 'mpr',
          },
        },
        {
          title: '3D four up',
          icon: 'layout-four-up',
          commandOptions: {
            protocolId: '3d-four-up',
          },
        },
        {
          title: '3D main',
          icon: 'layout-three-row',
          commandOptions: {
            protocolId: '3d-main',
          },
        },
        {
          title: 'Axial Primary',
          icon: 'layout-side-by-side',
          commandOptions: {
            protocolId: 'axial-primary',
          },
        },
        {
          title: '3D only',
          icon: 'layout-single',
          commandOptions: {
            protocolId: '3d-only',
          },
        },
        {
          title: '3D primary',
          icon: 'layout-side-by-side',
          commandOptions: {
            protocolId: '3d-primary',
          },
        },
        {
          title: 'Frame View',
          icon: 'icon-stack',
          commandOptions: {
            protocolId: 'frame-view',
          },
        },
        {
          title: 'STL',
          icon: 'layout-three-row',
          commandOptions: {
            protocolId: 'stl-layout',
          },
        },
        {
          title: '3D Compare',
          icon: 'layout-side-by-side',
          commandOptions: {
            protocolId: '3d-compare',
            customLayout: '3d-compare',
          },
        },
        {
          title: 'Local 3D Compare',
          icon: 'layout-side-by-side',
          commandOptions: {
            protocolId: 'local-3d-compare',
            customLayout: 'local-3d-compare',
          },
        },
        {
          title: 'OVF',
          icon: 'layout-single',
          commandOptions: {
            protocolId: 'ovf-layout',
            customLayout: 'ovf',
          },
        },
      ];

  // Disable layouts that require 3D STL data when study is not reconstructable
  const requires3D = ['3d-four-up', '3d-main', '3d-only', '3d-primary', 'ovf-layout'];
  const filteredAdvancedPresets = advancedPresets.map(p => ({
    ...p,
    disabled: p.disabled || (!has3D && requires3D.includes(p.commandOptions?.protocolId)),
  }));

  // Unified selection handler that dispatches to the appropriate command
  const handleSelectionChange = useCallback(
    (commandOptions, isPreset) => {
      localStorage.setItem('myLayout', commandOptions.protocolId);

      // Refresh toolbar so Magnify evaluate re-runs with new layout
      setTimeout(() => {
        const viewportId = viewportGridService.getActiveViewportId();
        if (toolbarService?.refreshToolbarState) {
          toolbarService.refreshToolbarState({ viewportId });
        }
      }, 500);

      if (commandOptions && commandOptions.customLayout === '3d-compare') {
        console.log('Applying 3D Compare layout');
        try {
          viewportGridService.setLayout({
            numRows: 1,
            numCols: 1,
            layoutType: 'grid',
            layoutOptions: [],
            findOrCreateViewport: (index) => ({
              displaySetInstanceUIDs: [],
              displaySetOptions: [],
              viewportOptions: {
                viewportId: `3dCompareViewport-${index}`,
                customLayout: '3d-compare',
              },
            }),
            activeViewportId: '3dCompareViewport-0',
            isHangingProtocolLayout: false,
          });
        } catch (error) {
          console.error('Error applying 3D Compare layout:', error);
        }
        return;
      }

      if (commandOptions && commandOptions.customLayout === 'local-3d-compare') {
        console.log('Applying Local 3D Compare layout');
        try {
          viewportGridService.setLayout({
            numRows: 1,
            numCols: 1,
            layoutType: 'grid',
            layoutOptions: [],
            findOrCreateViewport: (index) => ({
              displaySetInstanceUIDs: [],
              displaySetOptions: [],
              viewportOptions: {
                viewportId: `local3dCompareViewport-${index}`,
                customLayout: 'local-3d-compare',
              },
            }),
            activeViewportId: 'local3dCompareViewport-0',
            isHangingProtocolLayout: false,
          });
        } catch (error) {
          console.error('Error applying Local 3D Compare layout:', error);
        }
        return;
      }

      if (commandOptions && commandOptions.customLayout === 'stl') {
        console.log('Applying STL layout');

        try {
          const findOrCreateViewport = (index) => {
            return {
              displaySetInstanceUIDs: [],
              displaySetOptions: [],
              viewportOptions: {
                viewportId: `stlViewport-${index}`,
                customLayout: 'stl'
              }
            };
          };

          viewportGridService.setLayout({
            numRows: 1,
            numCols: 1,
            layoutType: 'grid',
            layoutOptions: [],
            findOrCreateViewport: findOrCreateViewport,
            activeViewportId: 'stlViewport-0',
            isHangingProtocolLayout: false,
          });
        } catch (error) {
          console.error('Error applying STL layout:', error);
        }
        return;
      }

      if (commandOptions && commandOptions.customLayout === 'ovf') {
        console.log('Applying OVF layout');
        try {
          viewportGridService.setLayout({
            numRows: 1,
            numCols: 1,
            layoutType: 'grid',
            layoutOptions: [],
            findOrCreateViewport: (index) => ({
              displaySetInstanceUIDs: [],
              displaySetOptions: [],
              viewportOptions: {
                viewportId: `ovfViewport-${index}`,
                customLayout: 'ovf',
              },
            }),
            activeViewportId: 'ovfViewport-0',
            isHangingProtocolLayout: false,
          });
        } catch (error) {
          console.error('Error applying OVF layout:', error);
        }
        return;
      }


      if (isPreset) {
        // If we're leaving a custom layout (stl, 3d-compare, comparison),
        // force a reset so reuseCachedLayouts doesn't cache corrupt empty-UID state
        const currentState = viewportGridService.getState();
        const currentViewports = currentState?.viewports;
        let leavingCustomLayout = false;
        if (currentViewports) {
          currentViewports.forEach((vp) => {
            const cl = vp?.viewportOptions?.customLayout;
            if (cl === 'stl' || cl === '3d-compare' || cl === 'local-3d-compare' || cl === 'comparison' || cl === 'ovf') {
              leavingCustomLayout = true;
            }
          });
        }

        commandsManager.run({
          commandName: 'setHangingProtocol',
          commandOptions: {
            ...commandOptions,
            ...(leavingCustomLayout ? { reset: true } : {}),
          },
        });
      } else {
        // Common preset or custom grid selection
        commandsManager.run({
          commandName: 'setViewportGridLayout',
          commandOptions,
        });
      }
    },
    [commandsManager]
  );

  return (
    <div
      id="Layout"
      data-cy="Layout"
    >
      <LayoutSelector
        onSelectionChange={handleSelectionChange}
        {...props}
      >
        <LayoutSelector.Trigger tooltip="Change layout" />
        <LayoutSelector.Content>
          {/* Left side - Presets */}
          {(commonPresets.length > 0 || filteredAdvancedPresets.length > 0) && (
            <div className="bg-popover flex flex-col gap-2.5 rounded-lg p-2">
              {commonPresets.length > 0 && (
                <>
                  <LayoutSelector.PresetSection title="Common">
                    {commonPresets.map((preset, index) => (
                      <LayoutSelector.Preset
                        key={`common-preset-${index}`}
                        icon={preset.icon}
                        commandOptions={preset.commandOptions}
                        isPreset={false}
                      />
                    ))}
                  </LayoutSelector.PresetSection>
                  <LayoutSelector.Divider />
                </>
              )}

              {filteredAdvancedPresets.length > 0 && (
                <LayoutSelector.PresetSection title="Advanced">
                  {filteredAdvancedPresets.map((preset, index) => (
                    <LayoutSelector.Preset
                      key={`advanced-preset-${index}`}
                      title={preset.title}
                      icon={preset.icon}
                      commandOptions={preset.commandOptions}
                      disabled={preset.disabled}
                      isPreset={true}
                    />
                  ))}
                </LayoutSelector.PresetSection>
              )}
            </div>
          )}

          {/* Right Side - Grid Layout */}
          <div className="bg-muted flex flex-col gap-2.5 border-l-2 border-solid border-black p-2">
            <div className="text-muted-foreground text-xs">Custom</div>
            <LayoutSelector.GridSelector
              rows={rows}
              columns={columns}
            />
            <LayoutSelector.HelpText>
              Hover to select <br />
              rows and columns <br /> Click to apply
            </LayoutSelector.HelpText>
          </div>
        </LayoutSelector.Content>
      </LayoutSelector>
    </div>
  );
}

ToolbarLayoutSelectorWithServices.propTypes = {
  commandsManager: PropTypes.instanceOf(CommandsManager),
  servicesManager: PropTypes.object,
  rows: PropTypes.number,
  columns: PropTypes.number,
};

export default ToolbarLayoutSelectorWithServices;
