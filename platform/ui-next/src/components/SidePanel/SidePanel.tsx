import classnames from 'classnames';
import React, { useCallback, useEffect, useState } from 'react';
import { Icons } from '../Icons';
import { TooltipTrigger, TooltipContent, Tooltip } from '../Tooltip';
import { Separator } from '../Separator';

/**
 * SidePanel component properties.
 * Note that the component monitors changes to the various widths and border sizes and will resize dynamically
 * @property {boolean} isExpanded - boolean indicating if the side panel is expanded/open or collapsed
 * @property {number} expandedWidth - the width of this side panel when expanded not including any borders or margins
 * @property {number} collapsedWidth - the width of this side panel when collapsed not including any borders or margins
 * @property {number} expandedInsideBorderSize - the width of the space between the expanded side panel content and viewport grid
 * @property {number} collapsedInsideBorderSize - the width of the space between the collapsed side panel content and the viewport grid
 * @property {number} collapsedOutsideBorderSize - the width of the space between the collapsed side panel content and the edge of the browser window
 */
type SidePanelProps = {
  side: 'left' | 'right';
  className: string;
  activeTabIndex: number;
  onOpen: () => void;
  onClose: () => void;
  onActiveTabIndexChange: () => void;
  isExpanded: boolean;
  expandedWidth: number;
  collapsedWidth: number;
  expandedInsideBorderSize: number;
  collapsedInsideBorderSize: number;
  collapsedOutsideBorderSize: number;
  tabs: any;
};

type StyleMap = {
  open: {
    left: {
      marginLeft: string; // the space between the expanded/open left side panel and the browser window left edge
      marginRight: string; // the space between the expanded/open left side panel and the viewport grid
    };
    right: {
      marginLeft: string; // the space between the expanded/open right side panel and the viewport grid
      marginRight: string; // the space between the expanded/open right side panel and the browser window right edge
    };
  };
  closed: {
    left: {
      marginLeft: string; // the space between the collapsed/closed left panel and the browser window left edge
      marginRight: string; // the space between the collapsed/closed left panel and the viewport grid
      alignItems: 'flex-end'; // the flexbox layout align-items property
    };
    right: {
      marginLeft: string; // the space between the collapsed/closed right panel and the viewport grid
      marginRight: string; // the space between the collapsed/closed right panel and the browser window right edge
      alignItems: 'flex-start'; // the flexbox layout align-items property
    };
  };
};
const closeIconWidth = 30;
const gridHorizontalPadding = 10;
const tabSpacerWidth = 2;

const baseClasses = 'bg-[rgba(6,9,20,0.96)] backdrop-blur-2xl justify-start box-content flex flex-col';

const openStateIconName = {
  left: 'SidePanelCloseLeft',
  right: 'SidePanelCloseRight',
};

const getTabWidth = (numTabs: number) => {
  if (numTabs < 3) {
    return 68;
  } else {
    return 40;
  }
};

const getGridWidth = (numTabs: number, gridAvailableWidth: number) => {
  const spacersWidth = (numTabs - 1) * tabSpacerWidth;
  const tabsWidth = getTabWidth(numTabs) * numTabs;

  if (gridAvailableWidth > tabsWidth + spacersWidth) {
    return tabsWidth + spacersWidth;
  }

  return gridAvailableWidth;
};

const getNumGridColumns = (numTabs: number, gridWidth: number) => {
  if (numTabs === 1) {
    return 1;
  }

  // Start by calculating the number of tabs assuming each tab was accompanied by a spacer.
  const tabWidth = getTabWidth(numTabs);
  const numTabsWithOneSpacerEach = Math.floor(gridWidth / (tabWidth + tabSpacerWidth));

  // But there is always one less spacer than tabs, so now check if an extra tab with one less spacer fits.
  if (
    (numTabsWithOneSpacerEach + 1) * tabWidth + numTabsWithOneSpacerEach * tabSpacerWidth <=
    gridWidth
  ) {
    return numTabsWithOneSpacerEach + 1;
  }

  return numTabsWithOneSpacerEach;
};

const getTabClassNames = (
  numColumns: number,
  numTabs: number,
  tabIndex: number,
  isActiveTab: boolean,
  isTabDisabled: boolean
) =>
  classnames('h-[32px] mb-[2px] cursor-pointer text-white bg-transparent transition-all duration-200', {
    'hover:bg-[rgba(52,140,253,0.13)] hover:shadow-[0_0_10px_rgba(52,140,253,0.18)] hover:text-primary': !isActiveTab && !isTabDisabled,
    'rounded-l': tabIndex % numColumns === 0,
    'rounded-r': (tabIndex + 1) % numColumns === 0 || tabIndex === numTabs - 1,
  });

const getTabStyle = (numTabs: number) => {
  return {
    width: `${getTabWidth(numTabs)}px`,
  };
};

const getTabIconClassNames = (numTabs: number, isActiveTab: boolean) => {
  return classnames('h-full w-full flex items-center justify-center transition-all duration-200', {
    'bg-[rgba(52,140,253,0.28)] rounded shadow-[0_0_12px_rgba(52,140,253,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]': isActiveTab,
  });
};
const createStyleMap = (
  expandedWidth: number,
  expandedInsideBorderSize: number,
  collapsedWidth: number,
  collapsedInsideBorderSize: number,
  collapsedOutsideBorderSize: number
): StyleMap => {
  const collapsedHideWidth = expandedWidth - collapsedWidth - collapsedOutsideBorderSize;

  return {
    open: {
      left: { marginLeft: '0px', marginRight: `${expandedInsideBorderSize}px` },
      right: { marginLeft: `${expandedInsideBorderSize}px`, marginRight: '0px' },
    },
    closed: {
      left: {
        marginLeft: `-${collapsedHideWidth}px`,
        marginRight: `${collapsedInsideBorderSize}px`,
        alignItems: `flex-end`,
      },
      right: {
        marginLeft: `${collapsedInsideBorderSize}px`,
        marginRight: `-${collapsedHideWidth}px`,
        alignItems: `flex-start`,
      },
    },
  };
};

const getToolTipContent = (label: string, disabled: boolean) => {
  return (
    <>
      <div>{label}</div>
      {disabled && <div className="text-white">{'Not available based on current context'}</div>}
    </>
  );
};

const createBaseStyle = (expandedWidth: number) => {
  return {
    maxWidth: `${expandedWidth}px`,
    width: `${expandedWidth}px`,
    // To align the top of the side panel with the top of the viewport grid, use position relative and offset the
    // top by the same top offset as the viewport grid. Also adjust the height so that there is no overflow.
    position: 'relative',
    top: '0.2%',
    height: '99.8%',
  };
};

const SidePanel = ({
  side,
  className,
  activeTabIndex: activeTabIndexProp,
  isExpanded,
  tabs,
  onOpen,
  onClose,
  onActiveTabIndexChange,
  expandedWidth = 280,
  collapsedWidth = 25,
  expandedInsideBorderSize = 4,
  collapsedInsideBorderSize = 8,
  collapsedOutsideBorderSize = 4,
}: SidePanelProps) => {
  const [panelOpen, setPanelOpen] = useState(isExpanded);
  const [activeTabIndex, setActiveTabIndex] = useState(activeTabIndexProp ?? 0);

  const [styleMap, setStyleMap] = useState(
    createStyleMap(
      expandedWidth,
      expandedInsideBorderSize,
      collapsedWidth,
      collapsedInsideBorderSize,
      collapsedOutsideBorderSize
    )
  );

  const [baseStyle, setBaseStyle] = useState(createBaseStyle(expandedWidth));

  const [gridAvailableWidth, setGridAvailableWidth] = useState(
    expandedWidth - closeIconWidth - gridHorizontalPadding
  );

  const [gridWidth, setGridWidth] = useState(getGridWidth(tabs.length, gridAvailableWidth));
  const openStatus = panelOpen ? 'open' : 'closed';
  const style = Object.assign({}, styleMap[openStatus][side], baseStyle);

  const updatePanelOpen = useCallback(
    (isOpen: boolean) => {
      setPanelOpen(isOpen);
      if (isOpen !== panelOpen) {
        // only fire events for changes
        if (isOpen && onOpen) {
          onOpen();
        } else if (onClose && !isOpen) {
          onClose();
        }
      }
    },
    [panelOpen, onOpen, onClose]
  );

  const updateActiveTabIndex = useCallback(
    (activeTabIndex: number, forceOpen: boolean = false) => {
      if (forceOpen) {
        updatePanelOpen(true);
      }

      setActiveTabIndex(activeTabIndex);

      if (onActiveTabIndexChange) {
        onActiveTabIndexChange({ activeTabIndex });
      }
    },
    [onActiveTabIndexChange, updatePanelOpen]
  );

  useEffect(() => {
    updatePanelOpen(isExpanded);
  }, [isExpanded, updatePanelOpen]);

  useEffect(() => {
    setStyleMap(
      createStyleMap(
        expandedWidth,
        expandedInsideBorderSize,
        collapsedWidth,
        collapsedInsideBorderSize,
        collapsedOutsideBorderSize
      )
    );
    setBaseStyle(createBaseStyle(expandedWidth));

    const gridAvailableWidth = expandedWidth - closeIconWidth - gridHorizontalPadding;
    setGridAvailableWidth(gridAvailableWidth);
    setGridWidth(getGridWidth(tabs.length, gridAvailableWidth));
  }, [
    collapsedInsideBorderSize,
    collapsedWidth,
    expandedWidth,
    expandedInsideBorderSize,
    tabs.length,
    collapsedOutsideBorderSize,
  ]);

  useEffect(() => {
    updateActiveTabIndex(activeTabIndexProp ?? 0);
  }, [activeTabIndexProp, updateActiveTabIndex]);

  const getCloseStateComponent = () => {
    const _childComponents = Array.isArray(tabs) ? tabs : [tabs];
    return (
      <>
        <div
          className={classnames(
            'flex h-[48px] w-full cursor-pointer items-center border-b border-[rgba(52,140,253,0.1)]',
            side === 'left' ? 'justify-end pr-[1px]' : 'justify-start pl-[1px]'
          )}
          onClick={() => {
            updatePanelOpen(!panelOpen);
          }}
          data-cy={`side-panel-header-${side}`}
        >
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg shadow-[0_0_14px_rgba(52,140,253,0.25)] transition-all duration-200"
            style={{ backgroundColor: '#182E59' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#1e3870'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#182E59'; }}
          >
            <Icons.NavigationPanelReveal
              className={classnames(side === 'left' && 'rotate-180 transform')}
              style={{ width: '15px', height: '15px', color: '#ffffff' }}
            />
          </div>
        </div>
        {side !== 'left' && (
        <div className="mt-2 flex flex-col space-y-2 pl-[1px]">
          {_childComponents.map((childComponent, index) => (
            <Tooltip key={index}>
              <TooltipTrigger>
                <div
                  id={`${childComponent.name}-btn`}
                  data-cy={`${childComponent.name}-btn`}
                  className={classnames(
                    'flex items-center justify-center w-7 h-7 rounded-lg cursor-pointer transition-all duration-200',
                    { 'ohif-disabled': childComponent.disabled }
                  )}
                  style={{ backgroundColor: '#182E59' }}
                  onMouseEnter={e => { if (!childComponent.disabled) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#1e3870'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#182E59'; }}
                  onClick={() => {
                    return childComponent.disabled ? null : updateActiveTabIndex(index, true);
                  }}
                >
                  {React.createElement(Icons[childComponent.iconName] || Icons.MissingIcon, {
                    style: {
                      width: '15px',
                      height: '15px',
                      color: '#ffffff',
                      opacity: childComponent.disabled ? 0.35 : 1,
                    },
                  })}
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                <div className="flex items-center justify-start">
                  {getToolTipContent(childComponent.label, childComponent.disabled)}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        )}
      </>
    );
  };

  const getCloseIcon = () => {
    return (
      <div
        className={classnames(
          'absolute inset-y-0 flex cursor-pointer items-center justify-center',
          side === 'left' ? 'right-0 pr-1' : 'left-0 pl-1'
        )}
        style={{ width: `${closeIconWidth + 8}px` }}
        onClick={() => {
          updatePanelOpen(!panelOpen);
        }}
        data-cy={`side-panel-header-${side}`}
      >
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl shadow-[0_0_16px_rgba(52,140,253,0.22)] hover:shadow-[0_0_24px_rgba(52,140,253,0.48)] transition-all duration-200"
          style={{ backgroundColor: '#182E59' }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#1e3870'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#182E59'; }}
        >
          {React.createElement(Icons[openStateIconName[side]] || Icons.MissingIcon, {
            style: { width: '18px', height: '18px', color: '#ffffff' },
          })}
        </div>
      </div>
    );
  };

  const getTabGridComponent = () => {
    const numCols = getNumGridColumns(tabs.length, gridWidth);

    return (
      <>
        {getCloseIcon()}
        <div className={classnames('flex grow justify-center items-center', side === 'left' && 'invisible')}>
          <div className={classnames('bg-transparent text-primary flex flex-wrap items-center')}>
            {tabs.map((tab, tabIndex) => {
              const { disabled } = tab;
              return (
                <React.Fragment key={tabIndex}>
                  {tabIndex % numCols !== 0 && (
                    <div></div>
                  )}
                  <Tooltip key={tabIndex}>
                    <TooltipTrigger>
                      <div
                        className={getTabClassNames(
                          numCols,
                          tabs.length,
                          tabIndex,
                          tabIndex === activeTabIndex,
                          disabled
                        )}
                        style={getTabStyle(tabs.length)}
                        onClick={() => {
                          return disabled ? null : updateActiveTabIndex(tabIndex);
                        }}
                        data-cy={`${tab.name}-btn`}
                      >
                        <div
                          className={getTabIconClassNames(tabs.length, tabIndex === activeTabIndex)}
                        >
                          {React.createElement(Icons[tab.iconName] || Icons.MissingIcon, {
                            className: classnames({
                              'text-primary': true,
                              'ohif-disabled': disabled,
                            }),
                            style: {
                              width: '22px',
                              height: '22px',
                            },
                          })}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {getToolTipContent(tab.label, disabled)}
                    </TooltipContent>
                  </Tooltip>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  const getOneTabComponent = () => {
    return (
      <div
        className={classnames(
          'text-primary flex grow cursor-pointer select-none justify-center self-center text-[13px]'
        )}
        data-cy={`${tabs[0].name}-btn`}
        onClick={() => updatePanelOpen(!panelOpen)}
      >
        {getCloseIcon()}
        <span>{tabs[0].label}</span>
      </div>
    );
  };

  const getOpenStateComponent = () => {
    if (side === 'left') {
      // No header bar — glass card close button floating at top-right, vertically centered
      // with the first PanelSection.Header (h-8 + my-[2px] ≈ top 2px, height 32px → center ~18px)
      return (
        <div className="absolute top-[2px] left-[4px] z-20 flex items-center justify-center h-8">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-xl cursor-pointer shadow-[0_0_16px_rgba(52,140,253,0.22)] hover:shadow-[0_0_24px_rgba(52,140,253,0.48)] transition-all duration-200"
            style={{ backgroundColor: '#182E59' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#1e3870'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#182E59'; }}
            onClick={() => updatePanelOpen(false)}
            data-cy="side-panel-header-left"
          >
            <Icons.SidePanelCloseLeft
              style={{ width: '18px', height: '18px', color: '#ffffff' }}
            />
          </div>
        </div>
      );
    }
    return (
      <>
        <div className={tabs.length === 1 && side === "right" ? "flex h-[0px] flex-shrink-0 select-none": "relative bg-gradient-to-r from-[rgba(12,16,34,0.96)] to-[rgba(8,11,24,0.92)] flex h-[44px] flex-shrink-0 select-none border-b border-[rgba(52,140,253,0.18)] shadow-[0_1px_12px_rgba(0,0,0,0.3)]"}>
          {tabs.length === 1 ? getOneTabComponent() : getTabGridComponent()}
        </div>
      </>
    );
  };

  return (
    <div
      className={classnames(
        className,
        baseClasses,
        side === 'left'
          ? 'border-r border-[rgba(52,140,253,0.22)] shadow-[2px_0_32px_rgba(0,0,0,0.5),2px_0_16px_rgba(52,140,253,0.08)]'
          : 'border-l border-[rgba(52,140,253,0.22)] shadow-[-2px_0_32px_rgba(0,0,0,0.5),-2px_0_16px_rgba(52,140,253,0.08)]'
      )}
      style={style}
    >
      {panelOpen ? (
        <>
          {getOpenStateComponent()}
          {tabs.map((tab, tabIndex) => {
            if (tabIndex === activeTabIndex) {
              return <div key={tabIndex} className="relative flex-1 min-h-0 overflow-hidden">
              <tab.content />
            </div>;
            }
            return null;
          })}

        </>
      ) : (
        <React.Fragment>{getCloseStateComponent()}</React.Fragment>
      )}
    </div>
  );
};

export { SidePanel };
