import React, { useState, useContext } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import { useDrag } from 'react-dnd';
import { Icons } from '../Icons';
import { DisplaySetMessageListTooltip } from '../DisplaySetMessageListTooltip';
import { TooltipTrigger, TooltipContent, Tooltip } from '../Tooltip';
import { StlInstanceContext } from '../../../../app/src/context/StlInstanceContext';
import { ParentStudyIdContext } from '../../../../app/src/context/parentStudyIdContext';
import { StlInstanceListDataContext } from '../../../../app/src/context/StlInstanceListDataContext';

/**
 * Display a thumbnail for a display set.
 */
const Thumbnail = ({
  myIndex,
  studyID,
  displaySetInstanceUID,
  className,
  imageSrc,
  imageAltText,
  description,
  seriesNumber,
  numInstances,
  loadingProgress,
  countIcon,
  messages,
  isActive,
  onClick,
  onDoubleClick,
  thumbnailType,
  modality,
  viewPreset = 'thumbnails',
  isHydratedForDerivedDisplaySet = false,
  isTracked = false,
  canReject = false,
  dragData = {},
  onReject = () => {},
  onClickUntrack = () => {},
  ThumbnailMenuItems = () => {},
}: withAppTypes): React.ReactNode => {
  // TODO: We should wrap our thumbnail to create a "DraggableThumbnail", as
  // this will still allow for "drag", even if there is no drop target for the
  // specified item.
  const context = useContext(StlInstanceContext);
  const { stlInstanceId, updateStlInstanceId, updateSeriesName } = context;
  const context1 = useContext(StlInstanceListDataContext);
  const { stlInstanceListData, updateStlInstanceListData } = context1;
  const context3 = useContext(ParentStudyIdContext);
  const { parentStudyId, updateParentStudyId } = context3;

  const [collectedProps, drag, dragPreview] = useDrag({
    type: 'displayset',
    item: { ...dragData, myIndex, studyID },
    canDrag: function (monitor) {
      return Object.keys(dragData).length !== 0;
    },
    end: (item, monitor) => {
      console.log("item", item)
      if (monitor.didDrop()) {
        const dropResult = monitor.getDropResult() as any;
        // If dropped on 3D Compare panel, don't switch the main series
        if (dropResult?.handled3dCompare) {
          console.log('[Thumbnail] Dropped on 3D Compare panel — skipping series switch');
          return;
        }
        console.log("selected index ==> ",myIndex)
        console.log("selected parent index ==> ", parentStudyId)
        console.log("datat =>",stlInstanceListData)
        stlInstanceListData.map((e) => {
           if(e.study_instance_uid === studyID){
             console.log("data => ",e)
             console.log("selected series id ==> ", e.series[myIndex].series_instance_uid)
             updateStlInstanceId(e.series[myIndex].series_instance_uid)
             updateSeriesName(e.series[myIndex].description)
           }
        });

      } else {
        console.log('Drag ended but item was not dropped');
      }
    },
  });

  const [lastTap, setLastTap] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const handleTouchEnd = e => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (tapLength < 300 && tapLength > 0) {
      console.log("selected index ==> ",myIndex)
        console.log("selected parent index ==> ", parentStudyId)
        console.log("datat =>",stlInstanceListData)
        stlInstanceListData.map((e) => {
           if(e.study_instance_uid === studyID){
             console.log("data => ",e)
             console.log("selected series id ==> ", e.series[myIndex].series_instance_uid)
             updateStlInstanceId(e.series[myIndex].series_instance_uid)
             updateSeriesName(e.series[myIndex].description)
           }
        });
      onDoubleClick(e);
    } else {
      console.log("selected index ==> ",myIndex)
        console.log("selected parent index ==> ", parentStudyId)
        console.log("datat =>",stlInstanceListData)
        stlInstanceListData.map((e) => {
           if(e.study_instance_uid === studyID){
             console.log("data => ",e)
             console.log("selected series id ==> ", e.series[myIndex].series_instance_uid)
             updateStlInstanceId(e.series[myIndex].series_instance_uid)
             updateSeriesName(e.series[myIndex].description)
           }
        });
      onClick(e);
    }
    setLastTap(currentTime);
  };

  const renderThumbnailPreset = () => {
    return (
      <div
        className={classnames(
          'flex h-full w-full flex-col items-center justify-center gap-[2px] p-[4px]',
          isActive && 'rounded'
        )}
      >
        <div className="h-[114px] w-[128px]">
          <div className="relative bg-[#0a0e17]">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={imageAltText}
                className="h-[114px] w-[128px] rounded object-contain"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="bg-background h-[114px] w-[128px] rounded"></div>
            )}

            {/* Loading overlay — z-10 so toolbar dropdowns (z-50) render above */}
            {loadingProgress !== undefined && loadingProgress < 1 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded bg-black/40">
                <div className="mb-1 h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent"></div>
                <div className="text-[10px] font-medium text-white/80">Loading...</div>
              </div>
            )}

            {/* bottom left */}
            <div className="absolute bottom-0 left-0 flex h-[14px] items-center gap-[4px] rounded-tr pt-[10px] pb-[10px] pr-[6px] pl-[5px]">
              <div
                className={classnames(
                  'h-[10px] w-[10px] rounded-[2px]',
                  isActive || isHydratedForDerivedDisplaySet ? 'bg-highlight' : 'bg-primary/65',
                  loadingProgress !== undefined && loadingProgress < 1 && 'bg-primary/25'
                )}
              ></div>
              <div className="text-[11px] font-semibold text-white">{modality}</div>
            </div>

            {/* top right */}
            <div className="absolute top-0 right-0 flex items-center gap-[4px]">
              <DisplaySetMessageListTooltip
                messages={messages}
                id={`display-set-tooltip-${displaySetInstanceUID}`}
              />
              {isTracked && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="group">
                      <Icons.StatusTracking className="text-primary-light h-[15px] w-[15px] group-hover:hidden" />
                      <Icons.Cancel
                        className="text-primary-light hidden h-[15px] w-[15px] group-hover:block"
                        onClick={onClickUntrack}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="flex flex-1 flex-row">
                      <div className="flex-2 flex items-center justify-center pr-4">
                        <Icons.InfoLink className="text-primary" />
                      </div>
                      <div className="flex flex-1 flex-col">
                        <span>
                          <span className="text-white">
                            {isTracked ? 'Series is tracked' : 'Series is untracked'}
                          </span>
                        </span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {/* bottom right */}
            <div className="absolute bottom-0 right-0 flex items-center gap-[4px] p-[4px]">
              <ThumbnailMenuItems
                displaySetInstanceUID={displaySetInstanceUID}
                canReject={canReject}
                onReject={onReject}
              />
            </div>
          </div>
        </div>
        <div className="flex h-[52px] w-[128px] flex-col justify-start pt-px">
          <Tooltip>
            <TooltipContent>{description}</TooltipContent>
            <TooltipTrigger>
              <div className="min-h-[18px] w-[128px] overflow-hidden text-ellipsis whitespace-nowrap pb-0.5 pl-1 text-left text-[12px] font-normal leading-4 text-white">
                {description}
              </div>
            </TooltipTrigger>
          </Tooltip>
          <div className="flex h-[12px] items-center gap-[7px] overflow-hidden">
            <div className="text-muted-foreground pl-1 text-[11px]"> S:{seriesNumber}</div>
            <div className="text-muted-foreground text-[11px]">
              <div className="flex items-center gap-[4px]">
                {countIcon ? (
                  React.createElement(Icons[countIcon] || Icons.MissingIcon, { className: 'w-3' })
                ) : (
                  <Icons.InfoSeries className="w-3" />
                )}
                <div>{numInstances}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderListPreset = () => {
    return (
      <div
        className={classnames(
          'flex h-full w-full items-center justify-between pr-[8px] pl-[8px] pt-[4px] pb-[4px]',
          isActive && 'rounded'
        )}
      >
        <div className="relative flex h-[32px] w-full items-center gap-[8px] overflow-hidden">
          <div
            className={classnames(
              'h-[32px] w-[4px] min-w-[4px] rounded',
              isActive || isHydratedForDerivedDisplaySet ? 'bg-highlight' : 'bg-primary/65',
              loadingProgress !== undefined && loadingProgress < 1 && 'bg-primary/25'
            )}
          ></div>
          {loadingProgress !== undefined && loadingProgress < 1 && (
            <div className="absolute right-2 h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-transparent"></div>
          )}
          <div className="flex h-full w-[calc(100%-12px)] flex-col justify-start">
            <div className="flex items-center gap-[7px]">
              <div className="text-[13px] font-semibold text-white">{modality}</div>
              <Tooltip>
                <TooltipContent>{description}</TooltipContent>
                <TooltipTrigger className="w-full overflow-hidden">
                  <div className="max-w-[160px] overflow-hidden overflow-ellipsis whitespace-nowrap text-left text-[13px] font-normal text-white">
                    {description}
                  </div>
                </TooltipTrigger>
              </Tooltip>
            </div>

            <div className="flex h-[12px] items-center gap-[7px] overflow-hidden">
              <div className="text-muted-foreground text-[12px]"> S:{seriesNumber}</div>
              <div className="text-muted-foreground text-[12px]">
                <div className="flex items-center gap-[4px]">
                  {' '}
                  {countIcon ? (
                    React.createElement(Icons[countIcon] || Icons.MissingIcon, { className: 'w-3' })
                  ) : (
                    <Icons.InfoSeries className="w-3" />
                  )}
                  <div>{numInstances}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex h-full items-center gap-[4px]">
          <DisplaySetMessageListTooltip
            messages={messages}
            id={`display-set-tooltip-${displaySetInstanceUID}`}
          />
          {isTracked && (
            <Tooltip>
              <TooltipTrigger>
                <div className="group">
                  <Icons.StatusTracking className="text-primary-light h-[20px] w-[15px] group-hover:hidden" />
                  <Icons.Cancel
                    className="text-primary-light hidden h-[15px] w-[15px] group-hover:block"
                    onClick={onClickUntrack}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="flex flex-1 flex-row">
                  <div className="flex-2 flex items-center justify-center pr-4">
                    <Icons.InfoLink className="text-primary" />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span>
                      <span className="text-white">
                        {isTracked ? 'Series is tracked' : 'Series is untracked'}
                      </span>
                    </span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          <ThumbnailMenuItems
            displaySetInstanceUID={displaySetInstanceUID}
            canReject={canReject}
            onReject={onReject}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className={classnames(
        className,
        'group flex cursor-pointer select-none flex-col rounded outline-none',
        viewPreset === 'thumbnails' && 'h-[170px] w-[135px]',
        viewPreset === 'list' && 'h-[40px] w-full'
      )}
      style={{
        backgroundColor: isActive
          ? 'rgba(10,111,253,0.15)'
          : isHovered
            ? 'rgba(52,140,253,0.08)'
            : 'rgba(14,20,42,0.65)',
        border: isActive
          ? '1px solid rgba(52,140,253,0.45)'
          : '1px solid rgba(52,140,253,0.15)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        transition: 'all 0.15s ease',
      }}
      id={`thumbnail-${displaySetInstanceUID}`}
      data-cy={
        thumbnailType === 'thumbnailNoImage'
          ? 'study-browser-thumbnail-no-image'
          : 'study-browser-thumbnail'
      }
      data-series={seriesNumber}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
    >
      <div
        ref={drag}
        className="h-full w-full"
      >
        {viewPreset === 'thumbnails' && renderThumbnailPreset()}
        {viewPreset === 'list' && renderListPreset()}
      </div>
    </div>
  );
};

Thumbnail.propTypes = {
  myIndex: PropTypes.number,
  displaySetInstanceUID: PropTypes.string.isRequired,
  className: PropTypes.string,
  imageSrc: PropTypes.string,
  /**
   * Data the thumbnail should expose to a receiving drop target. Use a matching
   * `dragData.type` to identify which targets can receive this draggable item.
   * If this is not set, drag-n-drop will be disabled for this thumbnail.
   *
   * Ref: https://react-dnd.github.io/react-dnd/docs/api/use-drag#specification-object-members
   */
  dragData: PropTypes.shape({
    /** Must match the "type" a dropTarget expects */
    type: PropTypes.string.isRequired,
  }),
  studyID: PropTypes.string,
  imageAltText: PropTypes.string,
  description: PropTypes.string.isRequired,
  seriesNumber: PropTypes.any,
  numInstances: PropTypes.number.isRequired,
  loadingProgress: PropTypes.number,
  messages: PropTypes.object,
  isActive: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  onDoubleClick: PropTypes.func.isRequired,
  viewPreset: PropTypes.string,
  modality: PropTypes.string,
  isHydratedForDerivedDisplaySet: PropTypes.bool,
  isTracked: PropTypes.bool,
  onClickUntrack: PropTypes.func,
  countIcon: PropTypes.string,
  thumbnailType: PropTypes.oneOf(['thumbnail', 'thumbnailTracked', 'thumbnailNoImage']),
};

export { Thumbnail };
